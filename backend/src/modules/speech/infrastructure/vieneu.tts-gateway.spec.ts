import { TtsError } from '../application/tts-gateway';
import { TRUNG_TIN_VOICE, VIENEU_HAT_DE, VieneuTtsGateway, vieneuOptionsFromEnv } from './vieneu.tts-gateway';

const pcm = (samples: number[]) => {
  const out = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => out.writeInt16LE(sample, index * 2));
  return out;
};

type Call = { url: string; init?: RequestInit };

function gatewayAnswering(...answers: (() => Response)[]) {
  const calls: Call[] = [];
  const fetch: typeof globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = answers.shift();
    if (!next) throw new Error('unexpected call');
    return next();
  };
  return { calls, gateway: new VieneuTtsGateway({ url: 'http://voice.test:8000', apiKey: 'secret', fetch }) };
}

describe('VieneuTtsGateway', () => {
  const audio = (samples: number[]) => () => new Response(new Uint8Array(pcm(samples)));

  it('offers Hạt Dẻ first, then Trung Tín', async () => {
    expect(await gatewayAnswering().gateway.voices()).toEqual([VIENEU_HAT_DE, TRUNG_TIN_VOICE]);
  });

  it('asks for the text in the voice enrolled for that code, with the key in a header', async () => {
    const { calls, gateway } = gatewayAnswering(audio([0]));
    await gateway.speak('Xin chào.', TRUNG_TIN_VOICE.code);

    const [{ url, init }] = calls;
    expect(url).toBe('http://voice.test:8000/v1/audio/speech');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret');
    expect(JSON.parse(String(init?.body))).toEqual({
      input: 'Xin chào.',
      voice: 'trung-tin',
      response_format: 'pcm',
      sample_rate: 24_000,
    });
  });

  it('wraps the samples in the WAV the app plays', async () => {
    const { gateway } = gatewayAnswering(audio([1000, -1000]));
    const spoken = await gateway.speak('Xin chào.', VIENEU_HAT_DE.code);

    expect(spoken.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(spoken.readUInt32LE(4)).toBe(spoken.length - 8);
    expect(spoken.readUInt16LE(22)).toBe(1);
    expect(spoken.readUInt32LE(24)).toBe(24_000);
    expect(spoken.readUInt32LE(28)).toBe(48_000);
    expect(spoken.readUInt16LE(32)).toBe(2);
    expect(spoken.readUInt16LE(34)).toBe(16);
    expect(spoken.readUInt32LE(40)).toBe(4);
    expect(spoken.subarray(44)).toEqual(pcm([1000, -1000]));
  });

  it('refuses empty audio', async () => {
    await expect(gatewayAnswering(audio([])).gateway.speak('Xin chào.', VIENEU_HAT_DE.code)).rejects.toThrow(TtsError);
  });

  it('refuses a voice it does not have, without calling the service', async () => {
    const { calls, gateway } = gatewayAnswering();
    await expect(gateway.speak('Xin chào.', 'nobody')).rejects.toThrow(TtsError);
    expect(calls).toEqual([]);
  });

  it('tries again when the queue is full and the service says to wait', async () => {
    const full = () => new Response('{}', { status: 429, headers: { 'retry-after': '0' } });
    const { calls, gateway } = gatewayAnswering(full, audio([0]));
    await gateway.speak('Xin chào.', VIENEU_HAT_DE.code);
    expect(calls).toHaveLength(2);
  });

  it('stops waiting at the deadline', async () => {
    const full = () => new Response('{}', { status: 429, headers: { 'retry-after': '10' } });
    const gateway = new VieneuTtsGateway({ url: 'http://voice.test', apiKey: 's', fetch: async () => full(), timeoutMs: 5 });
    await expect(gateway.speak('Xin chào.', VIENEU_HAT_DE.code)).rejects.toThrow('UPSTREAM_ERROR');
  });

  it('reports a refused request and an unreachable service the same way', async () => {
    const refused = () => new Response('secret text', { status: 500 });
    await expect(gatewayAnswering(refused).gateway.speak('Xin chào.', VIENEU_HAT_DE.code)).rejects.toThrow('UPSTREAM_ERROR');
    await expect(gatewayAnswering().gateway.speak('Xin chào.', VIENEU_HAT_DE.code)).rejects.toThrow('UPSTREAM_ERROR');
  });

  it('stays off unless both the address and the key are set', () => {
    expect(vieneuOptionsFromEnv({})).toBeNull();
    expect(vieneuOptionsFromEnv({ VIENEU_URL: 'http://voice.test' })).toBeNull();
    expect(vieneuOptionsFromEnv({ VIENEU_URL: 'http://voice.test', VIENEU_API_KEY: 'k' })).toEqual({
      url: 'http://voice.test',
      apiKey: 'k',
    });
  });
});
