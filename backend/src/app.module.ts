import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { z } from 'zod';
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
import { TTS_GATEWAY } from './modules/speech/application/tts-gateway';
import { TtsProviders } from './modules/speech/application/tts-providers';
import { VieneuTtsGateway, vieneuOptionsFromEnv } from './modules/speech/infrastructure/vieneu.tts-gateway';
import { ZeroTtsGateway, zeroOptionsFromEnv } from './modules/speech/infrastructure/zero.tts-gateway';
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
import { BookShareService } from './modules/sharing/application/book-share.service';
import { InMemoryShareStore, SHARE_STORE } from './modules/sharing/application/share-store';
import { PostgresShareStore } from './modules/sharing/infrastructure/postgres.share-store';
import { BookShareController } from './modules/sharing/presentation/book-share.controller';
import { BookTranslationService } from './modules/translation/application/book-translation.service';
import {
  BOOK_TRANSLATION_STORE,
  CHAPTER_TRANSLATIONS,
  InMemoryBookTranslationStore,
  InMemoryChapterTranslations,
  InMemoryStyleSheets,
  STYLE_SHEETS,
} from './modules/translation/application/translation-stores';
import {
  PostgresBookTranslationStore,
  PostgresChapterTranslations,
  PostgresStyleSheets,
} from './modules/translation/infrastructure/postgres.translation-stores';
import { BookTranslationController } from './modules/translation/presentation/book-translation.controller';

const storage = storageFromEnv(process.env);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

// Voice and translation tasks share one per-account limit.
const slots = new AccountSlots();

const vieneu = vieneuOptionsFromEnv(process.env);
const zero = zeroOptionsFromEnv(process.env);
const ttsProviders = [...(vieneu ? [new VieneuTtsGateway(vieneu)] : []), ...(zero ? [new ZeroTtsGateway(zero)] : [])];
const tts = ttsProviders.length > 0 ? new TtsProviders(ttsProviders) : null;

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
  controllers: [DigestController, BookTranslationController, BookVoiceController, BookShareController],
  providers: [
    DigestService,
    BookTranslationService,
    BookShareService,
    BookVoiceService,
    { provide: TTS_GATEWAY, useValue: tts },
    { provide: BOOK_VOICE_STORE, useValue: pool ? new PostgresBookVoiceStore(pool) : new InMemoryBookVoiceStore() },
    { provide: AccountSlots, useValue: slots },
    { provide: BOOK_TRANSLATION_STORE, useValue: pool ? new PostgresBookTranslationStore(pool) : new InMemoryBookTranslationStore() },
    { provide: CHAPTER_TRANSLATIONS, useValue: pool ? new PostgresChapterTranslations(pool) : new InMemoryChapterTranslations() },
    { provide: SHARE_STORE, useValue: pool ? new PostgresShareStore(pool) : new InMemoryShareStore() },
    { provide: STYLE_SHEETS, useValue: pool ? new PostgresStyleSheets(pool) : new InMemoryStyleSheets() },
    { provide: LLM_GATEWAY, useFactory: () => new OpenAiCompatibleLlmGateway(llmOptionsFromEnv(process.env)) },
  ],
})
export class AppModule {}
