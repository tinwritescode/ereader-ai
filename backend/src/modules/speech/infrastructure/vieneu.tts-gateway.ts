import { z } from 'zod';
import { TtsError, TtsGateway } from '../application/tts-gateway';
import { CloudVoice } from '../domain/cloud-voice';

const SAMPLE_RATE = 24_000;
const HEADER_BYTES = 44;
// Sentences wait their turn in the service's queue, one or two at a time on CPU.
const TIMEOUT_MS = 180_000;

export const VIENEU_HAT_DE: CloudVoice = { code: 'vieneu-clone', name: 'Hạt Dẻ', gender: 'female' };
export const TRUNG_TIN_VOICE: CloudVoice = { code: 'vieneu-trung-tin', name: 'Trung Tín', gender: 'male' };

// Our voice codes, to the names enrolled from the clips in voice/clips.
const ENROLLED: ReadonlyMap<string, string> = new Map([
  [VIENEU_HAT_DE.code, 'hat-de'],
  [TRUNG_TIN_VOICE.code, 'trung-tin'],
]);

export type VieneuOptions = {
  url: string;
  apiKey: string;
  timeoutMs?: number;
  /** Replaced in tests. */
  fetch?: typeof globalThis.fetch;
};

const VieneuEnvSchema = z.object({ VIENEU_URL: z.string().url(), VIENEU_API_KEY: z.string().min(1) });

export function vieneuOptionsFromEnv(env: Record<string, string | undefined>): VieneuOptions | null {
  const parsed = VieneuEnvSchema.safeParse(env);
  return parsed.success ? { url: parsed.data.VIENEU_URL, apiKey: parsed.data.VIENEU_API_KEY } : null;
}

function wavOf(samples: Buffer): Buffer {
  const header = Buffer.alloc(HEADER_BYTES);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(HEADER_BYTES - 8 + samples.length, 4);
  header.write('WAVE', 8, 'latin1');
  header.write('fmt ', 12, 'latin1');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'latin1');
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}

/** Our own VieNeu service on Railway, reading in the voices cloned from voice/clips. */
export class VieneuTtsGateway implements TtsGateway {
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: VieneuOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  }

  async voices(): Promise<CloudVoice[]> {
    return [VIENEU_HAT_DE, TRUNG_TIN_VOICE];
  }

  async speak(text: string, voiceCode: string): Promise<Buffer> {
    const voice = ENROLLED.get(voiceCode);
    if (voice === undefined) throw new TtsError('UPSTREAM_ERROR');
    const body = JSON.stringify({ input: text, voice, response_format: 'pcm', sample_rate: SAMPLE_RATE });
    const samples = await this.request(body, Date.now() + this.timeoutMs);
    if (samples.length === 0) throw new TtsError('UPSTREAM_ERROR');
    return wavOf(samples);
  }

  private async request(body: string, deadline: number): Promise<Buffer> {
    for (;;) {
      const response = await this.fetch(`${this.options.url}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.options.apiKey}` },
        body,
        signal: AbortSignal.timeout(Math.max(deadline - Date.now(), 1)),
      }).catch(() => {
        throw new TtsError('UPSTREAM_ERROR');
      });
      if (response.ok) {
        return Buffer.from(
          await response.arrayBuffer().catch(() => {
            throw new TtsError('UPSTREAM_ERROR');
          }),
        );
      }
      const waitMs = Number(response.headers.get('retry-after') ?? 0) * 1_000;
      if (response.status !== 429 || Date.now() + waitMs > deadline) throw new TtsError('UPSTREAM_ERROR');
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
