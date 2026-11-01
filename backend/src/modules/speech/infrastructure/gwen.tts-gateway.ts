import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { TtsError, TtsGateway } from '../application/tts-gateway';
import { CloudVoice } from '../domain/cloud-voice';
import { piecesWithin } from '../domain/speech-plan';
import { spelledOut } from '../domain/spoken-numbers';
import { SAMPLE_RATE, SAYABLE, SILENCE, samplesOf, wavOf } from './wav';

// The model loses its way on longer text.
const MAX_PIECE_CHARACTERS = 200;
// Each call waits behind the service's one GPU, which may have to start first.
const TIMEOUT_MS = 180_000;
const PAUSE_BETWEEN_PIECES = Buffer.alloc(Math.round(SAMPLE_RATE * 0.12) * 2);
const REFERENCE_FILE = 'hat-de.mp3';
// Word for word what the clip says: the model learns the voice by matching the two.
const REFERENCE_TEXT =
  'Tôi đủ lớn để hiểu rằng, mỗi năm thế giới mỗi đổi thay và lòng người cũng khác, tuổi ấu thơ chỉ có một con đường để cùng nhau chung bước.';

export const GWEN_HAT_DE: CloudVoice = { code: 'gwen-hat-de', name: 'Hạt Dẻ (Gwen)', gender: 'female' };

export type GwenOptions = {
  url: string;
  apiKey: string;
  reference: { audio: Buffer; text: string };
  timeoutMs?: number;
  /** Replaced in tests. */
  fetch?: typeof globalThis.fetch;
};

const GwenEnvSchema = z.object({ GWEN_TTS_URL: z.string().url(), GWEN_TTS_API_KEY: z.string().min(1) });

export function gwenOptionsFromEnv(env: Record<string, string | undefined>): GwenOptions | null {
  const parsed = GwenEnvSchema.safeParse(env);
  if (!parsed.success) return null;
  return {
    url: parsed.data.GWEN_TTS_URL.replace(/\/$/, ''),
    apiKey: parsed.data.GWEN_TTS_API_KEY,
    reference: { audio: readFileSync(join(process.cwd(), 'assets', REFERENCE_FILE)), text: REFERENCE_TEXT },
  };
}

/** The Gwen-TTS service on Modal, cloning a voice from a reference clip sent with every call. */
export class GwenTtsGateway implements TtsGateway {
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: GwenOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  }

  async voices(): Promise<CloudVoice[]> {
    return [GWEN_HAT_DE];
  }

  async speak(text: string, voiceCode: string): Promise<Buffer> {
    if (voiceCode !== GWEN_HAT_DE.code) throw new TtsError('UPSTREAM_ERROR');
    if (!SAYABLE.test(text)) return wavOf(SILENCE);
    const pieces: Buffer[] = [];
    for (const piece of piecesWithin(spelledOut(text), MAX_PIECE_CHARACTERS)) {
      if (pieces.length > 0) pieces.push(PAUSE_BETWEEN_PIECES);
      pieces.push(await this.read(piece));
    }
    return wavOf(Buffer.concat(pieces));
  }

  private async read(text: string): Promise<Buffer> {
    const { url, apiKey, reference } = this.options;
    const form = new FormData();
    form.set('text', text);
    form.set('ref_text', reference.text);
    form.set('ref_audio', new Blob([new Uint8Array(reference.audio)], { type: 'audio/mpeg' }), REFERENCE_FILE);
    const wav = await this.fetch(`${url}/tts`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    })
      .then(async (response) => (response.ok ? Buffer.from(await response.arrayBuffer()) : null))
      .catch(() => null);
    const samples = wav && samplesOf(wav);
    if (!samples) throw new TtsError('UPSTREAM_ERROR');
    return samples;
  }
}
