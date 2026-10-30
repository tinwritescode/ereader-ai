import { Module } from '@nestjs/common';
import { FormatAgentService } from './modules/processing/application/format-agent.service';
import { BooksModule, booksOptionsFromEnv } from './modules/books/books.module';
import { DigestService } from './modules/ai-reading/application/digest.service';
import { DigestController } from './modules/ai-reading/presentation/digest.controller';
import { llmOptionsFromEnv } from './shared/llm/llm-config';
import { LLM_GATEWAY } from './shared/llm/llm-gateway';
import { OpenAiCompatibleLlmGateway } from './shared/llm/openai-compatible.llm-gateway';
import { SpeechModule } from './modules/speech/speech.module';
import { VbeeTtsGateway, vbeeOptionsFromEnv } from './modules/speech/infrastructure/vbee.tts-gateway';

const vbee = vbeeOptionsFromEnv(process.env);

@Module({
  imports: [
    BooksModule.register(booksOptionsFromEnv(process.env)),
    SpeechModule.register(vbee ? new VbeeTtsGateway(vbee) : null),
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
