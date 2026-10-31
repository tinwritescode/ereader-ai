import { TtsError } from '../application/tts-gateway';
import { VIENEU_VOICE, VieneuTtsGateway, vieneuOptionsFromEnv } from './vieneu.tts-gateway';
import { VIENEU_REFERENCE_AUDIO } from './vieneu-reference';

const PREDICTION_URL = 'https://api.replicate.test/v1/predictions/p1';
const AUDIO_URL = 'https://replicate.delivery/p1/out.wav';

function wav(samples: number[], { rate = 48_000, channels = 1, bits = 16 } = {}): Buffer {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write('RIFF', 0, 'latin1');
  out.writeUInt32LE(out.length - 8, 4);
  out.write('WAVE', 8, 'latin1');
  out.write('fmt ', 12, 'latin1');
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(channels, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE((rate * channels * bits) / 8, 28);
  out.writeUInt16LE((channels * bits) / 8, 32);
  out.writeUInt16LE(bits, 34);
  out.write('data', 36, 'latin1');
  out.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => out.writeInt16LE(sample, 44 + index * 2));
  return out;
}

const samplesOf = (audio: Buffer) =>
  Array.from({ length: (audio.length - 44) / 2 }, (_, index) => audio.readInt16LE(44 + index * 2));

const prediction = (state: Record<string, unknown>) => ({ urls: { get: PREDICTION_URL }, ...state });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Call = { url: string; init?: RequestInit };

function gatewayAnswering(...answers: (() => Response)[]) {
  const calls: Call[] = [];
  const fetch: typeof globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = answers.shift();
    if (!next) throw new Error('unexpected call');
    return next();
  };
  return { calls, gateway: new VieneuTtsGateway({ token: 'secret', fetch, pollIntervalMs: 0, timeoutMs: 1_000 }) };
}

describe('VieneuTtsGateway', () => {
  const done = () => json(prediction({ status: 'succeeded', output: AUDIO_URL }));
  const audio = (body: Buffer) => () => new Response(new Uint8Array(body));

  it('offers the VieNeu voice', async () => {
    expect(await gatewayAnswering().gateway.voices()).toEqual([VIENEU_VOICE]);
  });

  it('asks for the text in the cloned voice, with the token in a header', async () => {
    const { calls, gateway } = gatewayAnswering(done, audio(wav([0, 0])));
    await gateway.speak('Xin chào.');

    const [{ url, init }] = calls;
    expect(url).toBe('https://api.replicate.com/v1/predictions');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret');
    expect(JSON.parse(String(init?.body)).input).toEqual({ text: 'Xin chào.', ref_audio: VIENEU_REFERENCE_AUDIO });
  });

  it('returns audio at the rate the app plays', async () => {
    const { gateway } = gatewayAnswering(done, audio(wav(new Array<number>(96).fill(1000))));
    const spoken = await gateway.speak('Xin chào.');

    expect(spoken.readUInt32LE(24)).toBe(24_000);
    expect(spoken.readUInt32LE(28)).toBe(48_000);
    expect(spoken.readUInt32LE(4)).toBe(spoken.length - 8);
    expect(spoken.readUInt32LE(40)).toBe(spoken.length - 44);
    expect(samplesOf(spoken)).toEqual(new Array<number>(48).fill(1000));
  });

  it('removes tones the lower rate cannot carry', async () => {
    const whine = Array.from({ length: 96 }, (_, index) => (index % 2 === 0 ? 8000 : -8000));
    const { gateway } = gatewayAnswering(done, audio(wav(whine)));
    const inner = samplesOf(await gateway.speak('Xin chào.')).slice(4, -4);
    expect(inner.every((sample) => sample === 0)).toBe(true);
  });

  it('waits for a prediction still running', async () => {
    const { calls, gateway } = gatewayAnswering(
      () => json(prediction({ status: 'starting', output: null })),
      () => json(prediction({ status: 'processing', output: null })),
      done,
      audio(wav([0, 0])),
    );
    await gateway.speak('Xin chào.');
    expect(calls.map(({ url }) => url)).toEqual([
      'https://api.replicate.com/v1/predictions',
      PREDICTION_URL,
      PREDICTION_URL,
      AUDIO_URL,
    ]);
    expect(new Headers(calls[1].init?.headers).get('authorization')).toBe('Bearer secret');
    expect(new Headers(calls[3].init?.headers).get('authorization')).toBeNull();
  });

  it('tries again when Replicate says to wait', async () => {
    const throttled = () => new Response('{}', { status: 429, headers: { 'retry-after': '0' } });
    const { calls, gateway } = gatewayAnswering(throttled, done, audio(wav([0, 0])));
    await gateway.speak('Xin chào.');
    expect(calls.map(({ url }) => url)).toEqual([
      'https://api.replicate.com/v1/predictions',
      'https://api.replicate.com/v1/predictions',
      AUDIO_URL,
    ]);
  });

  it('stops waiting at the deadline', async () => {
    const throttled = () => new Response('{}', { status: 429, headers: { 'retry-after': '10' } });
    const gateway = new VieneuTtsGateway({ token: 'secret', fetch: async () => throttled(), timeoutMs: 5 });
    await expect(gateway.speak('Xin chào.')).rejects.toThrow('UPSTREAM_ERROR');
  });

  it('gives up on a prediction that never finishes', async () => {
    const running = () => json(prediction({ status: 'processing', output: null }));
    const gateway = new VieneuTtsGateway({ token: 'secret', fetch: async () => running(), pollIntervalMs: 1, timeoutMs: 5 });
    await expect(gateway.speak('Xin chào.')).rejects.toThrow(TtsError);
  });

  it.each(['failed', 'canceled'])('reports a %s prediction without its message', async (status) => {
    const { gateway } = gatewayAnswering(() => json(prediction({ status, error: 'Xin chào.' })));
    await expect(gateway.speak('Xin chào.')).rejects.toThrow('UPSTREAM_ERROR');
  });

  it.each([
    ['another sample rate', wav([0, 0], { rate: 44_100 })],
    ['stereo', wav([0, 0], { channels: 2 })],
    ['another bit depth', wav([0, 0], { bits: 8 })],
    ['something that is not a WAV', Buffer.from('{"detail":"no"}')],
  ])('refuses %s', async (_, body) => {
    const { gateway } = gatewayAnswering(done, audio(body));
    await expect(gateway.speak('Xin chào.')).rejects.toThrow(TtsError);
  });

  it('reports a refused request and an unreachable service the same way', async () => {
    await expect(gatewayAnswering(() => json({}, 401)).gateway.speak('Xin chào.')).rejects.toThrow('UPSTREAM_ERROR');
    await expect(gatewayAnswering().gateway.speak('Xin chào.')).rejects.toThrow('UPSTREAM_ERROR');
  });

  it('stays off without a token', () => {
    expect(vieneuOptionsFromEnv({})).toBeNull();
    expect(vieneuOptionsFromEnv({ REPLICATE_API_TOKEN: 'k' })).toEqual({ token: 'k' });
  });
});
