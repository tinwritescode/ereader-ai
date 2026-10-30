import { Inject, Injectable } from '@nestjs/common';
import { LLM_GATEWAY, LlmGateway } from '../../../shared/llm/llm-gateway';
import {
  NormalizedBook,
  NormalizedBookSchema,
  TextBlock,
  validateCoverage,
} from '../domain/normalized-book';

@Injectable()
export class FormatAgentService {
  constructor(@Inject(LLM_GATEWAY) private readonly llm: LlmGateway) {}

  async normalize(
    bookId: string,
    blocks: readonly TextBlock[],
    language: string,
  ): Promise<NormalizedBook> {
    const completion = await this.llm.complete({
      promptVersion: 'normalize-v1',
      instructions: 'Group the blocks into chapters and sections. Return JSON matching the normalized book schema.',
      input: { bookId, language, blocks },
      outputSchema: NormalizedBookSchema,
      maxInputTokens: 10_000,
      maxOutputTokens: 2_000,
    });

    const parsed = completion.value;
    if (parsed.bookId !== bookId) {
      throw new Error('NORMALIZATION_BOOK_ID_MISMATCH');
    }
    validateCoverage(blocks, parsed);
    return parsed;
  }
}
