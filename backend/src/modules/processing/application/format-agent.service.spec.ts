import { FormatAgentService } from './format-agent.service';
import { LlmGateway } from '../../../shared/llm/llm-gateway';

describe('FormatAgentService', () => {
  it('validates structure and block coverage', async () => {
    const llm: LlmGateway = {
      model: 'test-model',
      complete: async (request) => ({
        value: request.outputSchema.parse({
          bookId: 'book-1',
          language: 'en',
          chapters: [{
            id: 'chapter-1',
            index: 0,
            title: 'Chapter 1',
            startBlockId: 'block-1',
            endBlockId: 'block-2',
            wordCount: 4,
            sections: [],
          }],
        }),
        usage: { inputTokens: 1, outputTokens: 1 },
      }),
    };
    const service = new FormatAgentService(llm);

    await expect(service.normalize('book-1', [
      { blockId: 'block-1', text: 'one two' },
      { blockId: 'block-2', text: 'three four' },
    ], 'en')).resolves.toMatchObject({ bookId: 'book-1' });
  });

  it('rejects unknown block references', async () => {
    const llm: LlmGateway = {
      model: 'test-model',
      complete: async (request) => ({
        value: request.outputSchema.parse({
          bookId: 'book-1', language: 'en', chapters: [{
            id: 'chapter-1', index: 0, title: 'Chapter 1',
            startBlockId: 'missing', endBlockId: 'block-1', wordCount: 1, sections: [],
          }],
        }),
        usage: { inputTokens: 1, outputTokens: 1 },
      }),
    };
    const service = new FormatAgentService(llm);

    await expect(service.normalize('book-1', [{ blockId: 'block-1', text: 'one' }], 'en'))
      .rejects.toThrow('NORMALIZATION_UNKNOWN_BLOCK:missing');
  });
});
