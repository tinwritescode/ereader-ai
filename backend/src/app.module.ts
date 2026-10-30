import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { FormatAgentService } from './modules/processing/application/format-agent.service';
import { BooksModule, booksOptionsFromEnv } from './modules/books/books.module';
import { DigestService } from './modules/ai-reading/application/digest.service';
import { DigestController } from './modules/ai-reading/presentation/digest.controller';
import { InMemorySpeechClipIndex } from './modules/speech/application/speech-clip-index';
import { PostgresSpeechClipIndex } from './modules/speech/infrastructure/postgres.speech-clip-index';
import { VbeeTtsGateway, vbeeOptionsFromEnv } from './modules/speech/infrastructure/vbee.tts-gateway';
import { SpeechModule } from './modules/speech/speech.module';
import { llmOptionsFromEnv } from './shared/llm/llm-config';
import { LLM_GATEWAY } from './shared/llm/llm-gateway';
import { OpenAiCompatibleLlmGateway } from './shared/llm/openai-compatible.llm-gateway';
import { storageFromEnv } from './shared/storage/storage-config';

const storage = storageFromEnv(process.env);
const vbee = vbeeOptionsFromEnv(process.env);
const databaseUrl = process.env.DATABASE_URL;

@Module({
  imports: [
    BooksModule.register(booksOptionsFromEnv(process.env, storage)),
    SpeechModule.register({
      tts: vbee ? new VbeeTtsGateway(vbee) : null,
      storage,
      index: databaseUrl
        ? new PostgresSpeechClipIndex(new Pool({ connectionString: databaseUrl }))
        : new InMemorySpeechClipIndex(),
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
