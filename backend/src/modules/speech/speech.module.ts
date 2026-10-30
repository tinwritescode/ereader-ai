import { DynamicModule, Module } from '@nestjs/common';
import { STORAGE_GATEWAY, StorageGateway } from '../../shared/storage/storage-gateway';
import { SPEECH_CLIP_INDEX, SpeechClipIndex } from './application/speech-clip-index';
import { SpeechService } from './application/speech.service';
import { TTS_GATEWAY, TtsGateway } from './application/tts-gateway';
import { SpeechController } from './presentation/speech.controller';

export type SpeechModuleOptions = {
  /** Null leaves cloud voices off: the list is empty and reading aloud answers 503. */
  tts: TtsGateway | null;
  storage: StorageGateway;
  index: SpeechClipIndex;
};

@Module({})
export class SpeechModule {
  static register({ tts, storage, index }: SpeechModuleOptions): DynamicModule {
    return {
      module: SpeechModule,
      controllers: [SpeechController],
      providers: [
        SpeechService,
        { provide: STORAGE_GATEWAY, useValue: storage },
        { provide: SPEECH_CLIP_INDEX, useValue: index },
        ...(tts ? [{ provide: TTS_GATEWAY, useValue: tts }] : []),
      ],
    };
  }
}
