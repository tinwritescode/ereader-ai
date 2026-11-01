import { z } from 'zod';
import { TtsError, TtsGateway } from '../application/tts-gateway';
import { CloudVoice } from '../domain/cloud-voice';
import { SAMPLE_RATE, SAYABLE, SILENCE, samplesOf, wavOf } from './wav';

// Waits behind the other sentences in the queue, and a cold start.
const TIMEOUT_MS = 120_000;
// Bumped when the audio changes, so clips kept under the old code are not served.
const CODE_PREFIX = 'zero2-';
// The service trims each clip tight, so sentences played in a row would run together.
const BREATH_AFTER_SENTENCE = Buffer.alloc(Math.round(SAMPLE_RATE * 0.4) * 2);

const voice = (id: string, name: string, gender: CloudVoice['gender']): CloudVoice => ({
  code: `${CODE_PREFIX}${id}`,
  name,
  gender,
});

export const ZERO_VOICES: readonly CloudVoice[] = [
  voice('hatde', 'Hạt Dẻ (Zero)', 'female'),
  voice('maichi', 'Mai Chi', 'female'),
  voice('baotrang', 'Bảo Trang', 'female'),
  voice('kimoanh', 'Kim Oanh', 'female'),
  voice('hamy', 'Hà My', 'female'),
  voice('giahuy', 'Gia Huy', 'male'),
  voice('huuduc', 'Hữu Đức', 'male'),
  voice('quangminh', 'Quang Minh', 'male'),
  voice('tiendat', 'Tiến Đạt', 'male'),
];

export type ZeroOptions = {
  url: string;
  apiKey: string;
  timeoutMs?: number;
  /** Replaced in tests. */
  fetch?: typeof globalThis.fetch;
};

const ZeroEnvSchema = z.object({ ZERO_TTS_URL: z.string().url(), ZERO_TTS_API_KEY: z.string().min(1) });

export function zeroOptionsFromEnv(env: Record<string, string | undefined>): ZeroOptions | null {
  const parsed = ZeroEnvSchema.safeParse(env);
  if (!parsed.success) return null;
  return { url: parsed.data.ZERO_TTS_URL.replace(/\/$/, ''), apiKey: parsed.data.ZERO_TTS_API_KEY };
}

/** Our own ZeroTTS service, which also spells out numbers and splits long sentences. */
export class ZeroTtsGateway implements TtsGateway {
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: ZeroOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  }

  async voices(): Promise<CloudVoice[]> {
    return [...ZERO_VOICES];
  }

  async speak(text: string, voiceCode: string): Promise<Buffer> {
    if (!ZERO_VOICES.some(({ code }) => code === voiceCode)) throw new TtsError('UPSTREAM_ERROR');
    if (!SAYABLE.test(text)) return wavOf(SILENCE);
    const { url, apiKey } = this.options;
    const wav = await this.fetch(`${url}/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ text, voice: voiceCode.slice(CODE_PREFIX.length) }),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
      .then(async (response) => (response.ok ? Buffer.from(await response.arrayBuffer()) : null))
      .catch(() => null);
    const samples = wav && samplesOf(wav);
    if (!samples) throw new TtsError('UPSTREAM_ERROR');
    return wavOf(Buffer.concat([samples, BREATH_AFTER_SENTENCE]));
  }
}
