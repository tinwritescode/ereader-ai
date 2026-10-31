import { z } from 'zod';
import { TtsError, TtsGateway } from '../application/tts-gateway';
import { CloudVoice } from '../domain/cloud-voice';

const SAMPLE_RATE = 24_000;
// A sleeping Modal container takes close to a minute to wake before its first sentence.
const TIMEOUT_MS = 180_000;
const SPOKEN_VOICE = 'hat_de';

export const OMNIVOICE_HAT_DE: CloudVoice = { code: 'omnivoice-hat-de', name: 'Hạt Dẻ Modal', gender: 'female' };

export type OmnivoiceOptions = {
  url: string;
  apiKey: string;
  /** Replaced in tests. */
  fetch?: typeof globalThis.fetch;
};

const OmnivoiceEnvSchema = z.object({ OMNIVOICE_URL: z.string().url(), OMNIVOICE_API_KEY: z.string().min(1) });

export function omnivoiceOptionsFromEnv(env: Record<string, string | undefined>): OmnivoiceOptions | null {
  const parsed = OmnivoiceEnvSchema.safeParse(env);
  return parsed.success ? { url: parsed.data.OMNIVOICE_URL, apiKey: parsed.data.OMNIVOICE_API_KEY } : null;
}

/** The app plays only this format, so anything else is refused here and not stored. */
function isPlayable(audio: Buffer): boolean {
  return (
    audio.length > 36 &&
    audio.subarray(0, 4).toString('latin1') === 'RIFF' &&
    audio.subarray(8, 12).toString('latin1') === 'WAVE' &&
    audio.subarray(12, 16).toString('latin1') === 'fmt ' &&
    audio.readUInt16LE(22) === 1 &&
    audio.readUInt32LE(24) === SAMPLE_RATE &&
    audio.readUInt16LE(34) === 16
  );
}

/** Our own OmniVoice service on Modal, reading in the Hạt Dẻ voice. */
export class OmnivoiceTtsGateway implements TtsGateway {
  private readonly fetch: typeof globalThis.fetch;

  constructor(private readonly options: OmnivoiceOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async voices(): Promise<CloudVoice[]> {
    return [OMNIVOICE_HAT_DE];
  }

  async speak(text: string): Promise<Buffer> {
    const form = new FormData();
    form.set('language', 'Vietnamese');
    form.set('voice', SPOKEN_VOICE);
    form.set('text', text);
    const audio = await this.request(form);
    if (!isPlayable(audio)) throw new TtsError('UPSTREAM_ERROR');
    return audio;
  }

  private async request(form: FormData): Promise<Buffer> {
    try {
      const response = await this.fetch(`${this.options.url}/tts`, {
        method: 'POST',
        headers: { 'X-API-Key': this.options.apiKey },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new TtsError('UPSTREAM_ERROR');
      return Buffer.from(await response.arrayBuffer());
    } catch {
      throw new TtsError('UPSTREAM_ERROR');
    }
  }
}
