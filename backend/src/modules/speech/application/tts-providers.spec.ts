import { CloudVoice } from '../domain/cloud-voice';
import { TtsError, TtsGateway } from './tts-gateway';
import { TtsProviders } from './tts-providers';

const provider = (code: string, name: string): TtsGateway => ({
  voices: async (): Promise<CloudVoice[]> => [{ code, name, gender: 'female' }],
  speak: async (text) => Buffer.from(`${code}:${text}`),
});

describe('TtsProviders', () => {
  const tts = new TtsProviders([provider('a', 'A'), provider('b', 'B')]);

  it('offers every provider its voices', async () => {
    expect((await tts.voices()).map(({ code }) => code)).toEqual(['a', 'b']);
  });

  it('hands a sentence to the provider of the chosen voice', async () => {
    expect((await tts.speak('câu', 'b')).toString()).toBe('b:câu');
  });

  it('refuses a voice nobody has', async () => {
    await expect(tts.speak('câu', 'c')).rejects.toBeInstanceOf(TtsError);
  });
});
