import { TtsError } from '../application/tts-gateway';
import { OMNIVOICE_HAT_DE, OmnivoiceTtsGateway, omnivoiceOptionsFromEnv } from './omnivoice.tts-gateway';

function wav({ rate = 24_000, channels = 1, bits = 16 } = {}): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(36, 4);
  header.write('WAVE', 8, 'latin1');
  header.write('fmt ', 12, 'latin1');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt16LE(bits, 34);
  header.write('data', 36, 'latin1');
  return header;
}

describe('OmnivoiceTtsGateway', () => {
  const answer = (body: Buffer, status = 200) => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetch: typeof globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(new Uint8Array(body), { status });
    };
    return { calls, gateway: new OmnivoiceTtsGateway({ url: 'https://voice.test', apiKey: 'secret', fetch }) };
  };

  it('offers the Hạt Dẻ voice', async () => {
    expect(await answer(wav()).gateway.voices()).toEqual([OMNIVOICE_HAT_DE]);
  });

  it('asks for the text in that voice, with the key in a header', async () => {
    const { calls, gateway } = answer(wav());
    expect(await gateway.speak('Xin chào.')).toEqual(wav());

    const [{ url, init }] = calls;
    expect(url).toBe('https://voice.test/tts');
    expect(new Headers(init?.headers).get('X-API-Key')).toBe('secret');
    const form = init?.body;
    if (!(form instanceof FormData)) throw new Error('expected a form');
    expect(Object.fromEntries(form)).toEqual({ language: 'Vietnamese', voice: 'hat_de', text: 'Xin chào.' });
  });

  it.each([
    ['another sample rate', wav({ rate: 44_100 })],
    ['stereo', wav({ channels: 2 })],
    ['another bit depth', wav({ bits: 32 })],
    ['something that is not a WAV', Buffer.from('{"detail":"no"}')],
  ])('refuses %s, which the app could not play', async (_, body) => {
    await expect(answer(body).gateway.speak('Xin chào.')).rejects.toThrow(TtsError);
  });

  it('reports a refused request without its message', async () => {
    await expect(answer(wav(), 500).gateway.speak('Xin chào.')).rejects.toThrow('UPSTREAM_ERROR');
  });

  it('reports an unreachable service the same way', async () => {
    const fetch: typeof globalThis.fetch = async () => {
      throw new Error('socket hang up');
    };
    const gateway = new OmnivoiceTtsGateway({ url: 'https://voice.test', apiKey: 'secret', fetch });
    await expect(gateway.speak('Xin chào.')).rejects.toThrow('UPSTREAM_ERROR');
  });

  it('stays off unless both the address and the key are set', () => {
    expect(omnivoiceOptionsFromEnv({})).toBeNull();
    expect(omnivoiceOptionsFromEnv({ OMNIVOICE_URL: 'https://voice.test' })).toBeNull();
    expect(omnivoiceOptionsFromEnv({ OMNIVOICE_URL: 'https://voice.test', OMNIVOICE_API_KEY: 'k' })).toEqual({
      url: 'https://voice.test',
      apiKey: 'k',
    });
  });
});
