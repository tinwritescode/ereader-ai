import { Module } from '@nestjs/common';
import { FormatAgentService } from './modules/processing/application/format-agent.service';
import { BooksModule, booksOptionsFromEnv } from './modules/books/books.module';
import { DigestService } from './modules/ai-reading/application/digest.service';
import { DigestController } from './modules/ai-reading/presentation/digest.controller';
import { llmOptionsFromEnv } from './shared/llm/llm-config';
import { LLM_GATEWAY } from './shared/llm/llm-gateway';
import { OpenAiCompatibleLlmGateway } from './shared/llm/openai-compatible.llm-gateway';

@Module({
  imports: [BooksModule.register(booksOptionsFromEnv(process.env))],
  controllers: [DigestController],
  providers: [
    DigestService,
    FormatAgentService,
    { provide: LLM_GATEWAY, useFactory: () => new OpenAiCompatibleLlmGateway(llmOptionsFromEnv(process.env)) },
  ],
  exports: [FormatAgentService],
})
export class AppModule {}
