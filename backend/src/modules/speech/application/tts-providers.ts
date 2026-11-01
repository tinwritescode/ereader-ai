import { CloudVoice } from '../domain/cloud-voice';
import { TtsError, TtsGateway } from './tts-gateway';

/** Several speech providers as one: the reader picks a voice, and the voice decides the provider. */
export class TtsProviders implements TtsGateway {
  constructor(private readonly providers: readonly TtsGateway[]) {}

  async voices(): Promise<CloudVoice[]> {
    return (await Promise.all(this.providers.map((provider) => provider.voices()))).flat();
  }

  async speak(text: string, voiceCode: string): Promise<Buffer> {
    for (const provider of this.providers) {
      if ((await provider.voices()).some(({ code }) => code === voiceCode)) return provider.speak(text, voiceCode);
    }
    throw new TtsError('UPSTREAM_ERROR');
  }
}
