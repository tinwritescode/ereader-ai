import { z } from 'zod';
import { CloudVoice } from '../domain/cloud-voice';
import { TtsError, TtsGateway } from '../application/tts-gateway';

const TTS_URL = 'https://api.vbee.vn/v1/tts';
const VOICES_URL = 'https://vbee.vn/api/public/v1/voices';
const SAMPLE_RATE = 24_000;
const VOICES_PER_PAGE = 100;
const REQUEST_TIMEOUT_MS = 15_000;
// The batch API requires a webhook even when the result is polled. Nothing listens here.
const UNUSED_WEBHOOK = 'https://example.com/vbee-callback';
// Vbee lists these voices but answers "Bad Request" when asked to read with them.
const REFUSED_VOICES = new Set(['sg_male_anhtu_yt_24k-pre', 'sg_female_thanhmai_yt_24k-pre']);

// Community voices offered before Vbee's own. Vbee lists thousands; these are picked by hand.
export const PICKED_COMMUNITY_VOICES = ['s_hochiminh_female_gionghatde1_book_vc'];

export type VbeeOptions = {
  token: string;
  appId: string;
  communityVoices?: string[];
  pollIntervalMs?: number;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
};

const VbeeEnvSchema = z.object({
  VBEE_TOKEN: z.string().min(1),
  VBEE_APP_ID: z.string().min(1),
});

/** Vbee is optional: without both settings the app simply offers no cloud voices. */
export function vbeeOptionsFromEnv(env: Record<string, string | undefined>): VbeeOptions | null {
  const parsed = VbeeEnvSchema.safeParse(env);
  return parsed.success
    ? { token: parsed.data.VBEE_TOKEN, appId: parsed.data.VBEE_APP_ID, communityVoices: PICKED_COMMUNITY_VOICES }
    : null;
}

const CreatedSchema = z.object({ requestId: z.string().min(1) });
const RequestStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('PROCESSING') }),
  z.object({ status: z.literal('COMPLETED'), audioLink: z.string().url() }),
  z.object({ status: z.literal('FAILED') }),
]);
const VoicesPageSchema = z.object({
  result: z.object({
    voices: z.array(
      z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        gender: z.enum(['male', 'female']),
        language_code: z.string(),
      }),
    ),
    pagination: z.object({ has_next_page: z.boolean(), next_cursor: z.string().nullable() }),
  }),
});

/** Vbee's batch API: create a request, poll it until done, then fetch the audio it links to. */
export class VbeeTtsGateway implements TtsGateway {
  private readonly fetch: typeof globalThis.fetch;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;
  private cachedVoices: Promise<CloudVoice[]> | null = null;

  constructor(private readonly options: VbeeOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 300;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  voices(): Promise<CloudVoice[]> {
    // A failed listing is not kept, so the next call tries again.
    this.cachedVoices ??= this.listVoices().catch((error: unknown) => {
      this.cachedVoices = null;
      throw error;
    });
    return this.cachedVoices;
  }

  async speak(text: string, voiceCode: string): Promise<Buffer> {
    const deadline = Date.now() + this.timeoutMs;
    const created = CreatedSchema.safeParse(
      await this.json(TTS_URL, {
        method: 'POST',
        body: JSON.stringify({
          text,
          voiceCode,
          mode: 'async',
          outputFormat: 'wav',
          sampleRate: SAMPLE_RATE,
          webhookUrl: UNUSED_WEBHOOK,
        }),
      }),
    );
    if (!created.success) throw new TtsError('UPSTREAM_ERROR');

    const audioLink = await this.waitForAudio(created.data.requestId, deadline);
    const audio = await this.call(audioLink, { method: 'GET' }, false);
    const bytes = Buffer.from(await audio.arrayBuffer());
    if (bytes.subarray(0, 4).toString('latin1') !== 'RIFF' || bytes.subarray(8, 12).toString('latin1') !== 'WAVE') {
      throw new TtsError('UPSTREAM_ERROR');
    }
    return bytes;
  }

  private async waitForAudio(requestId: string, deadline: number): Promise<string> {
    for (;;) {
      const state = RequestStateSchema.safeParse(await this.json(`${TTS_URL}/requests/${requestId}`, { method: 'GET' }));
      if (!state.success || state.data.status === 'FAILED') throw new TtsError('UPSTREAM_ERROR');
      if (state.data.status === 'COMPLETED') return state.data.audioLink;
      if (Date.now() + this.pollIntervalMs > deadline) throw new TtsError('UPSTREAM_ERROR');
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  private async listVoices(): Promise<CloudVoice[]> {
    const voices: CloudVoice[] = [];
    for (const code of this.options.communityVoices ?? []) {
      voices.push(...(await this.voicePages({ voice_ownership: 'COMMUNITY', code })));
    }
    voices.push(...(await this.voicePages({ voice_ownership: 'VBEE', language_code: 'vi-VN' })));
    return voices;
  }

  private async voicePages(filter: Record<string, string>): Promise<CloudVoice[]> {
    const voices: CloudVoice[] = [];
    let cursor: string | null = null;
    do {
      const url = new URL(VOICES_URL);
      for (const [name, value] of Object.entries(filter)) url.searchParams.set(name, value);
      url.searchParams.set('limit', String(VOICES_PER_PAGE));
      if (cursor) url.searchParams.set('cursor', cursor);
      const page = VoicesPageSchema.safeParse(await this.json(url.toString(), { method: 'GET' }));
      if (!page.success) throw new TtsError('UPSTREAM_ERROR');
      for (const { code, name, gender, language_code } of page.data.result.voices) {
        if (language_code === 'vi-VN' && !REFUSED_VOICES.has(code)) {
          // The app already says "Giọng" before every name.
          voices.push({ code, name: name.replace(/^Giọng\s+/u, ''), gender });
        }
      }
      const { has_next_page, next_cursor } = page.data.result.pagination;
      cursor = has_next_page ? next_cursor : null;
    } while (cursor);
    return voices;
  }

  private async json(url: string, init: RequestInit): Promise<unknown> {
    const response = await this.call(url, init, true);
    return response.json().catch(() => null);
  }

  private async call(url: string, init: RequestInit, authorized: boolean): Promise<Response> {
    const headers: Record<string, string> = authorized
      ? {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.token}`,
          'app-id': this.options.appId,
        }
      : {};
    const response = await this.fetch(url, { ...init, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(
      () => {
        throw new TtsError('UPSTREAM_ERROR');
      },
    );
    if (!response.ok) throw new TtsError('UPSTREAM_ERROR');
    return response;
  }
}
