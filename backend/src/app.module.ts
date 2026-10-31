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
import { PostgresSpeechClipIndex } from './modules/speech/infrastructure/postgres.speech-clip-index';
import { RoutedTtsGateway } from './modules/speech/application/routed-tts-gateway';
import { TtsGateway } from './modules/speech/application/tts-gateway';
import { OmnivoiceTtsGateway, omnivoiceOptionsFromEnv } from './modules/speech/infrastructure/omnivoice.tts-gateway';
import { VieneuTtsGateway, vieneuOptionsFromEnv } from './modules/speech/infrastructure/vieneu.tts-gateway';
import { VbeeTtsGateway, vbeeOptionsFromEnv } from './modules/speech/infrastructure/vbee.tts-gateway';
import { SpeechModule } from './modules/speech/speech.module';
import { llmOptionsFromEnv } from './shared/llm/llm-config';
import { LLM_GATEWAY } from './shared/llm/llm-gateway';
import { OpenAiCompatibleLlmGateway } from './shared/llm/openai-compatible.llm-gateway';
import { storageFromEnv } from './shared/storage/storage-config';

const storage = storageFromEnv(process.env);
const vbee = vbeeOptionsFromEnv(process.env);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

const omnivoice = omnivoiceOptionsFromEnv(process.env);
const vieneu = vieneuOptionsFromEnv(process.env);
const ttsProviders: TtsGateway[] = [
  ...(vieneu ? [new VieneuTtsGateway(vieneu)] : []),
  ...(omnivoice ? [new OmnivoiceTtsGateway(omnivoice)] : []),
  ...(vbee ? [new VbeeTtsGateway(vbee)] : []),
];

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
      tts: ttsProviders.length > 0 ? new RoutedTtsGateway(ttsProviders) : null,
      storage,
      index: pool ? new PostgresSpeechClipIndex(pool) : new InMemorySpeechClipIndex(),
    }),
  ],
  controllers: [DigestController],
  providers: [
    DigestService,
    FormatAgentService,
    { provide: LLM_GATEWAY, useFactory: () => new OpenAiCompatibleLlmGateway(llmOptionsFromEnv(process.env)) },
  ],
  exports: [FormatAgentService],
})
export class AppModule {}
