import { CloudVoice } from '../domain/cloud-voice';
import { RoutedTtsGateway } from './routed-tts-gateway';
import { TtsError, TtsGateway } from './tts-gateway';

const provider = (voices: CloudVoice[] | Error, audio = 'audio'): TtsGateway => ({
  voices: async () => {
    if (voices instanceof Error) throw voices;
    return voices;
  },
  speak: async () => Buffer.from(audio),
});

const hatDe = { code: 'hat-de', name: 'Hạt Dẻ', gender: 'female' as const };
const ngocHuyen = { code: 'ngoc-huyen', name: 'Ngọc Huyền', gender: 'female' as const };

describe('RoutedTtsGateway', () => {
  it('offers the voices of every provider, in order', async () => {
    const tts = new RoutedTtsGateway([provider([hatDe]), provider([ngocHuyen])]);
    expect(await tts.voices()).toEqual([hatDe, ngocHuyen]);
  });

  it('sends a sentence to the provider of its voice', async () => {
    const tts = new RoutedTtsGateway([provider([hatDe], 'modal'), provider([ngocHuyen], 'vbee')]);
    expect((await tts.speak('Xin chào.', ngocHuyen.code)).toString()).toBe('vbee');
    expect((await tts.speak('Xin chào.', hatDe.code)).toString()).toBe('modal');
  });

  it('keeps the other voices when one provider is down', async () => {
    const tts = new RoutedTtsGateway([provider(new TtsError('UPSTREAM_ERROR')), provider([ngocHuyen], 'vbee')]);
    expect(await tts.voices()).toEqual([ngocHuyen]);
    expect((await tts.speak('Xin chào.', ngocHuyen.code)).toString()).toBe('vbee');
  });

  it('fails when every provider is down', async () => {
    const down = new TtsError('UPSTREAM_ERROR');
    await expect(new RoutedTtsGateway([provider(down), provider(down)]).voices()).rejects.toThrow(TtsError);
  });

  it('fails for a voice nobody offers', async () => {
    await expect(new RoutedTtsGateway([provider([hatDe])]).speak('Xin chào.', 'ghost')).rejects.toThrow(TtsError);
  });
});
