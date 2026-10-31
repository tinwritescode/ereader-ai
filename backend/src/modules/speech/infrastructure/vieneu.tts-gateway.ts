import { z } from 'zod';
import { TtsError, TtsGateway } from '../application/tts-gateway';
import { CloudVoice } from '../domain/cloud-voice';
import { VIENEU_REFERENCE_AUDIO } from './vieneu-reference';

const PREDICTIONS_URL = 'https://api.replicate.com/v1/predictions';
// VieNeu-TTS v3 Turbo. Pinned so a new upload cannot change the voice under cached clips.
const MODEL_VERSION = '7f9fe07b44b5cdf98a0a50152d3548122e812b1dc0c2c4baade48b63bb0bc041';
const WAIT_SECONDS = 60;
const SOURCE_RATE = 48_000;
const HEADER_BYTES = 44;
// A halfband low-pass, so halving the rate does not fold high tones back into speech.
const FILTER = [-1, 0, 9, 16, 9, 0, -1];
const FILTER_SUM = 32;

export const VIENEU_VOICE: CloudVoice = { code: 'vieneu-clone', name: 'VieNeu', gender: 'female' };

export type VieneuOptions = {
  token: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  /** Replaced in tests. */
  fetch?: typeof globalThis.fetch;
};

const VieneuEnvSchema = z.object({ REPLICATE_API_TOKEN: z.string().min(1) });

export function vieneuOptionsFromEnv(env: Record<string, string | undefined>): VieneuOptions | null {
  const parsed = VieneuEnvSchema.safeParse(env);
  return parsed.success ? { token: parsed.data.REPLICATE_API_TOKEN } : null;
}

const PredictionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.enum(['starting', 'processing']), urls: z.object({ get: z.string().url() }) }),
  z.object({ status: z.literal('succeeded'), output: z.string().url() }),
  z.object({ status: z.enum(['failed', 'canceled']) }),
]);
type Prediction = z.infer<typeof PredictionSchema>;

function isSource(audio: Buffer): boolean {
  return (
    audio.length >= HEADER_BYTES &&
    audio.subarray(0, 4).toString('latin1') === 'RIFF' &&
    audio.subarray(8, 12).toString('latin1') === 'WAVE' &&
    audio.subarray(12, 16).toString('latin1') === 'fmt ' &&
    audio.readUInt16LE(22) === 1 &&
    audio.readUInt32LE(24) === SOURCE_RATE &&
    audio.readUInt16LE(34) === 16 &&
    audio.subarray(36, 40).toString('latin1') === 'data'
  );
}

/** VieNeu answers at 48 kHz and the app plays 24 kHz. */
function halveRate(source: Buffer): Buffer {
  const count = Math.floor((source.length - HEADER_BYTES) / 2);
  const sampleAt = (index: number) =>
    source.readInt16LE(HEADER_BYTES + 2 * Math.min(Math.max(index, 0), count - 1));
  const kept = Math.floor(count / 2);
  const out = Buffer.alloc(HEADER_BYTES + kept * 2);
  source.copy(out, 0, 0, HEADER_BYTES);
  out.writeUInt32LE(out.length - 8, 4);
  out.writeUInt32LE(SOURCE_RATE / 2, 24);
  out.writeUInt32LE(SOURCE_RATE, 28);
  out.writeUInt32LE(kept * 2, 40);
  for (let index = 0; index < kept; index += 1) {
    const sum = FILTER.reduce((total, weight, tap) => total + weight * sampleAt(index * 2 + tap - 3), 0);
    out.writeInt16LE(Math.max(-32_768, Math.min(32_767, Math.round(sum / FILTER_SUM))), HEADER_BYTES + index * 2);
  }
  return out;
}

/** VieNeu on Replicate, cloning the one reference clip we ship. */
export class VieneuTtsGateway implements TtsGateway {
  private readonly fetch: typeof globalThis.fetch;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: VieneuOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.timeoutMs = options.timeoutMs ?? 180_000;
  }

  async voices(): Promise<CloudVoice[]> {
    return [VIENEU_VOICE];
  }

  async speak(text: string): Promise<Buffer> {
    const deadline = Date.now() + this.timeoutMs;
    const created = await this.prediction(PREDICTIONS_URL, deadline, {
      method: 'POST',
      headers: { 'content-type': 'application/json', prefer: `wait=${WAIT_SECONDS}` },
      body: JSON.stringify({ version: MODEL_VERSION, input: { text, ref_audio: VIENEU_REFERENCE_AUDIO } }),
    });
    const audioUrl = await this.waitForAudio(created, deadline);
    const response = await this.call(audioUrl, deadline, { method: 'GET' });
    const audio = Buffer.from(await response.arrayBuffer().catch(() => new ArrayBuffer(0)));
    if (!isSource(audio)) throw new TtsError('UPSTREAM_ERROR');
    return halveRate(audio);
  }

  private async waitForAudio(created: Prediction, deadline: number): Promise<string> {
    let current = created;
    for (;;) {
      if (current.status === 'succeeded') return current.output;
      if (current.status !== 'starting' && current.status !== 'processing') throw new TtsError('UPSTREAM_ERROR');
      if (Date.now() + this.pollIntervalMs > deadline) throw new TtsError('UPSTREAM_ERROR');
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      current = await this.prediction(current.urls.get, deadline, { method: 'GET' });
    }
  }

  private async prediction(url: string, deadline: number, init: RequestInit): Promise<Prediction> {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${this.options.token}`);
    const response = await this.call(url, deadline, { ...init, headers });
    const parsed = PredictionSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new TtsError('UPSTREAM_ERROR');
    return parsed.data;
  }

  private async call(url: string, deadline: number, init: RequestInit): Promise<Response> {
    for (;;) {
      const signal = AbortSignal.timeout(Math.max(deadline - Date.now(), 1));
      const response = await this.fetch(url, { ...init, signal }).catch(() => {
        throw new TtsError('UPSTREAM_ERROR');
      });
      if (response.ok) return response;
      const waitMs = Number(response.headers.get('retry-after') ?? 0) * 1_000;
      if (response.status !== 429 || Date.now() + waitMs > deadline) throw new TtsError('UPSTREAM_ERROR');
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
