import { TtsError } from '../application/tts-gateway';
import { VbeeTtsGateway } from './vbee.tts-gateway';

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

/** Answers each URL from a queue of responses, recording every call. */
function fakeFetch(routes: Record<string, Array<() => Response>>) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    const next = key ? routes[key].shift() : undefined;
    if (!next) throw new Error(`unexpected call ${url}`);
    return next();
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(32)]);

const options = { token: 'secret-token', appId: 'app-1', pollIntervalMs: 0, timeoutMs: 1000 };

describe('VbeeTtsGateway', () => {
  it('asks for a 24 kHz WAV, waits for it to finish, and downloads it', async () => {
    const { fetch, calls } = fakeFetch({
      'https://api.vbee.vn/v1/tts/requests/req-1': [
        () => json({ requestId: 'req-1', status: 'PROCESSING' }),
        () => json({ requestId: 'req-1', status: 'COMPLETED', audioLink: 'https://vbee.vn/s/req-1/audio' }),
      ],
      'https://api.vbee.vn/v1/tts': [() => json({ requestId: 'req-1', status: 'PROCESSING' })],
      'https://vbee.vn/s/req-1/audio': [() => new Response(wav)],
    });

    const audio = await new VbeeTtsGateway({ ...options, fetch }).speak('Xin chào.', 'voice-a');

    expect(audio).toEqual(wav);
    expect(calls[0]).toMatchObject({
      url: 'https://api.vbee.vn/v1/tts',
      method: 'POST',
      headers: { authorization: 'Bearer secret-token', 'app-id': 'app-1' },
      body: { text: 'Xin chào.', voiceCode: 'voice-a', mode: 'async', outputFormat: 'wav', sampleRate: 24000 },
    });
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.vbee.vn/v1/tts',
      'https://api.vbee.vn/v1/tts/requests/req-1',
      'https://api.vbee.vn/v1/tts/requests/req-1',
      'https://vbee.vn/s/req-1/audio',
    ]);
  });

  it('fails when Vbee refuses the request or the result is not a WAV', async () => {
    const refused = fakeFetch({
      'https://api.vbee.vn/v1/tts': [() => json({ error: { code: 'BAD_REQUEST', message: 'Bad Request' } }, 400)],
    });
    await expect(new VbeeTtsGateway({ ...options, fetch: refused.fetch }).speak('a', 'v')).rejects.toEqual(
      new TtsError('UPSTREAM_ERROR'),
    );

    const notWav = fakeFetch({
      'https://api.vbee.vn/v1/tts/requests/req-2': [
        () => json({ requestId: 'req-2', status: 'COMPLETED', audioLink: 'https://vbee.vn/s/req-2' }),
      ],
      'https://api.vbee.vn/v1/tts': [() => json({ requestId: 'req-2', status: 'PROCESSING' })],
      'https://vbee.vn/s/req-2': [() => new Response('<html>')],
    });
    await expect(new VbeeTtsGateway({ ...options, fetch: notWav.fetch }).speak('a', 'v')).rejects.toEqual(
      new TtsError('UPSTREAM_ERROR'),
    );
  });

  it('gives up when the request does not finish in time', async () => {
    const { fetch } = fakeFetch({
      'https://api.vbee.vn/v1/tts/requests/req-3': Array.from({ length: 1000 }, () => () =>
        json({ requestId: 'req-3', status: 'PROCESSING' }),
      ),
      'https://api.vbee.vn/v1/tts': [() => json({ requestId: 'req-3', status: 'PROCESSING' })],
    });
    await expect(
      new VbeeTtsGateway({ ...options, fetch, pollIntervalMs: 5, timeoutMs: 20 }).speak('a', 'v'),
    ).rejects.toEqual(new TtsError('UPSTREAM_ERROR'));
  });

  it('lists Vietnamese Vbee voices across pages, once, without the voices it refuses to read with', async () => {
    const voice = (code: string, name: string) => ({ code, name, gender: 'female', language_code: 'vi-VN' });
    const page = (voices: unknown[], next: string | null) =>
      json({ status: 1, result: { voices, pagination: { has_next_page: next !== null, next_cursor: next } } });
    const { fetch, calls } = fakeFetch({
      'https://vbee.vn/api/public/v1/voices': [
        () => page([voice('a_48k-fhg', 'HN - A'), voice('sg_male_anhtu_yt_24k-pre', 'Anh Tú Pro (Beta)')], 'c/2=='),
        () => page([voice('c_48k-fhg', 'SG - C')], null),
      ],
    });
    const gateway = new VbeeTtsGateway({ ...options, fetch });

    const voices = await gateway.voices();
    await gateway.voices();

    expect(voices).toEqual([
      { code: 'a_48k-fhg', name: 'HN - A', gender: 'female' },
      { code: 'c_48k-fhg', name: 'SG - C', gender: 'female' },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain('cursor=c%2F2%3D%3D');
  });
});
