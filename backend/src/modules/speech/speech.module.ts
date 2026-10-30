import { DynamicModule, Module } from '@nestjs/common';
import { TTS_GATEWAY, TtsGateway } from './application/tts-gateway';
import { SpeechController } from './presentation/speech.controller';

@Module({})
export class SpeechModule {
  /** A null gateway leaves cloud voices off: the list is empty and reading aloud answers 503. */
  static register(gateway: TtsGateway | null): DynamicModule {
    return {
      module: SpeechModule,
      controllers: [SpeechController],
      providers: gateway ? [{ provide: TTS_GATEWAY, useValue: gateway }] : [],
    };
  }
}
