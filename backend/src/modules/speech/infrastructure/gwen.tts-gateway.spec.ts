import { TtsError } from '../application/tts-gateway';
import { GWEN_HAT_DE, GwenTtsGateway, gwenOptionsFromEnv } from './gwen.tts-gateway';
import { wavOf } from './wav';

const REFERENCE = { audio: Buffer.from('clip'), text: 'Lời trong clip.' };

function gateway(answer: (text: string) => Response) {
  const calls: { url: string; key: string | null; form: FormData }[] = [];
  const fetchFake: typeof fetch = async (url, init) => {
    if (!(init?.body instanceof FormData)) throw new Error('expected a form');
    calls.push({ url: String(url), key: new Headers(init.headers).get('x-api-key'), form: init.body });
    return answer(String(init.body.get('text')));
  };
  return { calls, gwen: new GwenTtsGateway({ url: 'https://gwen.test', apiKey: 'secret', reference: REFERENCE, fetch: fetchFake }) };
}

const speech = (bytes: number) => new Response(new Uint8Array(wavOf(Buffer.alloc(bytes, 1))));

describe('GwenTtsGateway', () => {
  it('offers Hạt Dẻ as its own voice', async () => {
    expect((await gateway(() => speech(2)).gwen.voices()).map(({ code }) => code)).toEqual([GWEN_HAT_DE.code]);
  });

  it('sends the clip and its transcript, with numbers spelled out', async () => {
    const { calls, gwen } = gateway(() => speech(2));
    const audio = await gwen.speak('Có 3 con mèo.', GWEN_HAT_DE.code);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: 'https://gwen.test/tts', key: 'secret' });
    expect(calls[0].form.get('text')).toBe('Có ba con mèo.');
    expect(calls[0].form.get('ref_text')).toBe(REFERENCE.text);
    expect(calls[0].form.get('ref_audio')).toBeInstanceOf(Blob);
    expect(audio.subarray(0, 4).toString('latin1')).toBe('RIFF');
  });

  it('reads a long sentence in pieces and joins them into one clip', async () => {
    const { calls, gwen } = gateway(() => speech(100));
    const audio = await gwen.speak(`${'chữ '.repeat(60)}cuối, ${'chữ '.repeat(10)}`.trim(), GWEN_HAT_DE.code);
    expect(calls).toHaveLength(2);
    for (const { form } of calls) expect(String(form.get('text')).length).toBeLessThanOrEqual(200);
    expect(audio.readUInt32LE(40)).toBeGreaterThan(200);
  });

  it('stays silent on text with nothing to say, without calling the service', async () => {
    const { calls, gwen } = gateway(() => speech(2));
    expect((await gwen.speak('…', GWEN_HAT_DE.code)).length).toBeGreaterThan(44);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['a refused call', () => new Response('no', { status: 401 })],
    ['an answer with no audio', () => new Response('not a wav')],
  ])('fails with a kind only on %s', async (_, answer) => {
    await expect(gateway(answer).gwen.speak('Một câu.', GWEN_HAT_DE.code)).rejects.toBeInstanceOf(TtsError);
  });

  it('refuses a voice it does not have', async () => {
    await expect(gateway(() => speech(2)).gwen.speak('Một câu.', 'vieneu-clone')).rejects.toBeInstanceOf(TtsError);
  });

  it('is off until the service is configured', () => {
    expect(gwenOptionsFromEnv({})).toBeNull();
  });
});
