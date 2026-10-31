import { DynamicModule, Module } from '@nestjs/common';
import { AccountSlots } from '../../shared/tasks/account-slots';
import { STORAGE_GATEWAY, StorageGateway } from '../../shared/storage/storage-gateway';
import { CHAPTER_VOICE_STORE, ChapterVoiceStore, InMemoryChapterVoiceStore } from './application/chapter-voice-store';
import { ChapterVoiceService } from './application/chapter-voice.service';
import { SPEECH_CLIP_INDEX, SpeechClipIndex } from './application/speech-clip-index';
import { SpeechService } from './application/speech.service';
import { TTS_GATEWAY, TtsGateway } from './application/tts-gateway';
import { ChapterVoiceController } from './presentation/chapter-voice.controller';
import { SpeechController } from './presentation/speech.controller';

export type SpeechModuleOptions = {
  /** Null leaves cloud voices off: the list is empty and reading aloud answers 503. */
  tts: TtsGateway | null;
  storage: StorageGateway;
  index: SpeechClipIndex;
  chapterVoices?: ChapterVoiceStore;
  /** Shared with every other kind of long task, so the per-account limit counts them all. */
  slots?: AccountSlots;
};

@Module({})
export class SpeechModule {
  static register({ tts, storage, index, chapterVoices = new InMemoryChapterVoiceStore(), slots = new AccountSlots() }: SpeechModuleOptions): DynamicModule {
    return {
      module: SpeechModule,
      exports: [SpeechService],
      controllers: [SpeechController, ChapterVoiceController],
      providers: [
        SpeechService,
        ChapterVoiceService,
        { provide: CHAPTER_VOICE_STORE, useValue: chapterVoices },
        { provide: AccountSlots, useValue: slots },
        { provide: STORAGE_GATEWAY, useValue: storage },
        { provide: SPEECH_CLIP_INDEX, useValue: index },
        ...(tts ? [{ provide: TTS_GATEWAY, useValue: tts }] : []),
      ],
    };
  }
}
