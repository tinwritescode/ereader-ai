import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { z } from 'zod';
import { FormatAgentService } from './modules/processing/application/format-agent.service';
import { AccountsModule } from './modules/accounts/accounts.module';
import { InMemoryAccountStore } from './modules/accounts/application/account-store';
import { PostgresAccountStore } from './modules/accounts/infrastructure/postgres.account-store';
import { WorkosIdentityGateway, workosOptionsFromEnv } from './modules/accounts/infrastructure/workos.identity-gateway';
import { InMemoryBookStore } from './modules/books/application/book-store';
import { PostgresBookStore } from './modules/books/infrastructure/postgres.book-store';
import { BooksModule, booksOptionsFromEnv } from './modules/books/books.module';
import { DigestService } from './modules/ai-reading/application/digest.service';
import { DigestController } from './modules/ai-reading/presentation/digest.controller';
import { InMemorySpeechClipIndex } from './modules/speech/application/speech-clip-index';
import { PostgresChapterVoiceStore } from './modules/speech/infrastructure/postgres.chapter-voice-store';
import { PostgresSpeechClipIndex } from './modules/speech/infrastructure/postgres.speech-clip-index';
import { RoutedTtsGateway } from './modules/speech/application/routed-tts-gateway';
import { TTS_GATEWAY, TtsGateway } from './modules/speech/application/tts-gateway';
import { VieneuTtsGateway, vieneuOptionsFromEnv } from './modules/speech/infrastructure/vieneu.tts-gateway';
import { VbeeTtsGateway, vbeeOptionsFromEnv } from './modules/speech/infrastructure/vbee.tts-gateway';
import { SpeechModule } from './modules/speech/speech.module';
import { llmOptionsFromEnv } from './shared/llm/llm-config';
import { LLM_GATEWAY } from './shared/llm/llm-gateway';
import { OpenAiCompatibleLlmGateway } from './shared/llm/openai-compatible.llm-gateway';
import { storageFromEnv } from './shared/storage/storage-config';
import { AccountSlots } from './shared/tasks/account-slots';
import { BOOK_VOICE_STORE, InMemoryBookVoiceStore } from './modules/book-voice/application/book-voice-store';
import { BookVoiceService } from './modules/book-voice/application/book-voice.service';
import { PostgresBookVoiceStore } from './modules/book-voice/infrastructure/postgres.book-voice-store';
import { BookVoiceController } from './modules/book-voice/presentation/book-voice.controller';
import { BookTranslationService } from './modules/translation/application/book-translation.service';
import {
  BOOK_TRANSLATION_STORE,
  CHAPTER_TRANSLATIONS,
  InMemoryBookTranslationStore,
  InMemoryChapterTranslations,
} from './modules/translation/application/translation-stores';
import {
  PostgresBookTranslationStore,
  PostgresChapterTranslations,
} from './modules/translation/infrastructure/postgres.translation-stores';
import { BookTranslationController } from './modules/translation/presentation/book-translation.controller';

const storage = storageFromEnv(process.env);
const vbee = vbeeOptionsFromEnv(process.env);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

// Voice and translation tasks share one per-account limit.
const slots = new AccountSlots();

const vieneu = vieneuOptionsFromEnv(process.env);
const ttsProviders: TtsGateway[] = [
  ...(vieneu ? [new VieneuTtsGateway(vieneu)] : []),
  ...(vbee ? [new VbeeTtsGateway(vbee)] : []),
];
const tts = ttsProviders.length > 0 ? new RoutedTtsGateway(ttsProviders) : null;

@Module({
  imports: [
    AccountsModule.register({
      store: pool ? new PostgresAccountStore(pool) : new InMemoryAccountStore(),
      identity: new WorkosIdentityGateway(workosOptionsFromEnv(process.env)),
      superAdminEmail: z.string().email().parse(process.env.SUPER_ADMIN_EMAIL),
    }),
    BooksModule.register({
      ...booksOptionsFromEnv(process.env, storage),
      store: pool ? new PostgresBookStore(pool) : new InMemoryBookStore(),
    }),
    SpeechModule.register({
      tts,
      storage,
      index: pool ? new PostgresSpeechClipIndex(pool) : new InMemorySpeechClipIndex(),
      ...(pool ? { chapterVoices: new PostgresChapterVoiceStore(pool) } : {}),
      slots,
    }),
  ],
  controllers: [DigestController, BookTranslationController, BookVoiceController],
  providers: [
    DigestService,
    FormatAgentService,
    BookTranslationService,
    BookVoiceService,
    { provide: TTS_GATEWAY, useValue: tts },
    { provide: BOOK_VOICE_STORE, useValue: pool ? new PostgresBookVoiceStore(pool) : new InMemoryBookVoiceStore() },
    { provide: AccountSlots, useValue: slots },
    { provide: BOOK_TRANSLATION_STORE, useValue: pool ? new PostgresBookTranslationStore(pool) : new InMemoryBookTranslationStore() },
    { provide: CHAPTER_TRANSLATIONS, useValue: pool ? new PostgresChapterTranslations(pool) : new InMemoryChapterTranslations() },
    { provide: LLM_GATEWAY, useFactory: () => new OpenAiCompatibleLlmGateway(llmOptionsFromEnv(process.env)) },
  ],
  exports: [FormatAgentService],
})
export class AppModule {}
