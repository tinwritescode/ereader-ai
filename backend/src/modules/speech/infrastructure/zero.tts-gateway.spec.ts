import { TtsError } from '../application/tts-gateway';
import { ZERO_VOICES, ZeroTtsGateway, zeroOptionsFromEnv } from './zero.tts-gateway';
import { SAMPLE_RATE, wavOf } from './wav';

const MAI_CHI = 'zero2-maichi';

function gateway(answer: () => Response) {
  const calls: { url: string; key: string | null; body: unknown }[] = [];
  const fetchFake: typeof fetch = async (url, init) => {
    calls.push({
      url: String(url),
      key: new Headers(init?.headers).get('x-api-key'),
      body: JSON.parse(String(init?.body)),
    });
    return answer();
  };
  return { calls, zero: new ZeroTtsGateway({ url: 'https://zero.test', apiKey: 'secret', fetch: fetchFake }) };
}

const speech = () => new Response(new Uint8Array(wavOf(Buffer.alloc(100, 1))));

describe('ZeroTtsGateway', () => {
  it('offers the voices that ship with the model', async () => {
    const voices = await gateway(speech).zero.voices();
    expect(voices).toEqual(ZERO_VOICES);
    expect(voices.map(({ name }) => name)).toEqual(expect.arrayContaining(['Hạt Dẻ (Zero)', 'Mai Chi']));
  });

  it('asks the service to read the text in the chosen voice and hands back its WAV', async () => {
    const { calls, zero } = gateway(speech);
    const audio = await zero.speak('Có 3 con mèo.', MAI_CHI);
    expect(calls).toEqual([
      { url: 'https://zero.test/tts', key: 'secret', body: { text: 'Có 3 con mèo.', voice: 'maichi' } },
    ]);
    expect(audio.subarray(0, 4).toString('latin1')).toBe('RIFF');
  });

  it('leaves a breath of silence after the sentence, since the service trims its audio tight', async () => {
    const audio = await gateway(speech).zero.speak('Câu một.', MAI_CHI);
    const breath = (SAMPLE_RATE * 2 * 4) / 10;
    expect(audio.readUInt32LE(40)).toBe(100 + breath);
    expect(audio.subarray(44 + 100).every((byte) => byte === 0)).toBe(true);
  });

  it('stays silent on text with nothing to say, without calling the service', async () => {
    const { calls, zero } = gateway(speech);
    expect((await zero.speak('…', MAI_CHI)).length).toBeGreaterThan(44);
    expect(calls).toHaveLength(0);
  });

  it('rejects a voice it does not offer', async () => {
    await expect(gateway(speech).zero.speak('Chào.', 'gwen-hat-de')).rejects.toBeInstanceOf(TtsError);
  });

  it('turns a refused or unreadable answer into a speech error', async () => {
    const refused = gateway(() => new Response('no', { status: 401 })).zero;
    const notAudio = gateway(() => new Response('oops')).zero;
    await expect(refused.speak('Chào.', MAI_CHI)).rejects.toBeInstanceOf(TtsError);
    await expect(notAudio.speak('Chào.', MAI_CHI)).rejects.toBeInstanceOf(TtsError);
  });

  it('stays off until the service is configured', () => {
    expect(zeroOptionsFromEnv({})).toBeNull();
    expect(zeroOptionsFromEnv({ ZERO_TTS_URL: 'https://zero.test/', ZERO_TTS_API_KEY: 'k' })?.url).toBe(
      'https://zero.test',
    );
  });
});
