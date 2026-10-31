import { CloudVoice } from '../domain/cloud-voice';
import { TtsError, TtsGateway } from './tts-gateway';

/** Offers the voices of several providers as one, and sends each sentence to the provider of its voice. */
export class RoutedTtsGateway implements TtsGateway {
  constructor(private readonly providers: TtsGateway[]) {}

  async voices(): Promise<CloudVoice[]> {
    const listed = await Promise.allSettled(this.providers.map((provider) => provider.voices()));
    const offered = listed.flatMap((list) => (list.status === 'fulfilled' ? [list.value] : []));
    // One provider being down must not take the other's voices away.
    if (offered.length === 0) throw new TtsError('UPSTREAM_ERROR');
    return offered.flat();
  }

  async speak(text: string, voiceCode: string): Promise<Buffer> {
    for (const provider of this.providers) {
      const voices = await provider.voices().catch((): CloudVoice[] => []);
      if (voices.some((voice) => voice.code === voiceCode)) return provider.speak(text, voiceCode);
    }
    throw new TtsError('UPSTREAM_ERROR');
  }
}
