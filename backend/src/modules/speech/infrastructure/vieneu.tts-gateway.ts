import { z } from 'zod';
import { TtsError, TtsGateway } from '../application/tts-gateway';
import { CloudVoice } from '../domain/cloud-voice';
import { SAMPLE_RATE, SAYABLE, SILENCE, wavOf } from './wav';

// Long enough for the service to start from zero, which takes about a minute.
const TIMEOUT_MS = 180_000;
// A 429 from Cloud Run itself does not carry Retry-After.
const THROTTLE_WAIT_SECONDS = 1;

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

/** Our own VieNeu service on Cloud Run, reading in the voices cloned from voice/clips. */
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
    if (samples.length > 0) return wavOf(samples);
    // The service drops what it cannot say and answers 200 with no audio, as it also does when it
    // fails mid-stream, so only text with nothing to say may pass for silence: clips are stored.
    if (SAYABLE.test(text)) throw new TtsError('UPSTREAM_ERROR');
    return wavOf(SILENCE);
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
      const waitMs = Number(response.headers.get('retry-after') ?? THROTTLE_WAIT_SECONDS) * 1_000;
      if (response.status !== 429 || Date.now() + waitMs > deadline) throw new TtsError('UPSTREAM_ERROR');
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
