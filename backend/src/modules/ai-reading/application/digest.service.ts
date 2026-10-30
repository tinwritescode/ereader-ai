import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { LLM_GATEWAY, LlmGateway } from '../../../shared/llm/llm-gateway';
import { countWords } from '../../../shared/reading-time';
import { DigestRequest, DigestResult } from '../domain/digest';
import { DigestPart, planDigest } from '../domain/digest-plan';
import { DIGEST_PROMPT_VERSION, DigestOutputSchema, digestInstructions } from './digest-prompt';

// About 4k tokens of Vietnamese per call, well inside the 10k input budget of one job.
const MAX_PART_WORDS = 1_500;
const MAX_INPUT_TOKENS = 10_000;
// Parts of a long chapter run side by side, but not all at once.
const PART_CONCURRENCY = 4;

type Digest = Pick<DigestResult, 'cacheKey' | 'targetWords' | 'content'>;

@Injectable()
export class DigestService {
  // Holds the pending promise too, so identical requests in flight share one LLM run.
  private readonly cache = new Map<string, Promise<Digest>>();

  constructor(@Inject(LLM_GATEWAY) private readonly llm: LlmGateway) {}

  async create(request: DigestRequest, paragraphs: readonly string[]): Promise<DigestResult> {
    const cacheKey = this.cacheKey(request, paragraphs);
    const existing = this.cache.get(cacheKey);
    if (existing) return { ...(await existing), cached: true };

    const pending = this.shorten(request, paragraphs, cacheKey);
    this.cache.set(cacheKey, pending);
    try {
      return { ...(await pending), cached: false };
    } catch {
      this.cache.delete(cacheKey);
      throw new BadGatewayException({ code: 'DIGEST_FAILED' });
    }
  }

  private cacheKey(request: DigestRequest, paragraphs: readonly string[]): string {
    const chapterContentHash = createHash('sha256').update(paragraphs.join('\n\n')).digest('hex');
    return createHash('sha256')
      .update([
        chapterContentHash,
        request.targetLang,
        request.targetMinutes,
        request.wpm,
        DIGEST_PROMPT_VERSION,
        this.llm.model,
      ].join(':'))
      .digest('hex');
  }

  private async shorten(request: DigestRequest, paragraphs: readonly string[], cacheKey: string): Promise<Digest> {
    const targetWords = request.targetMinutes * request.wpm;
    const parts = planDigest({ paragraphs, targetWords, maxPartWords: MAX_PART_WORDS });
    const shortened = await mapInBatches(parts, PART_CONCURRENCY, (part, index) =>
      this.shortenPart({ part, index, partCount: parts.length, targetLang: request.targetLang }),
    );
    return { cacheKey, targetWords, content: shortened.flat().join('\n\n') };
  }

  private async shortenPart({ part, index, partCount, targetLang }: {
    part: DigestPart;
    index: number;
    partCount: number;
    targetLang: string;
  }): Promise<string[]> {
    const completion = await this.llm.complete({
      promptVersion: DIGEST_PROMPT_VERSION,
      instructions: digestInstructions({
        targetLang,
        sourceWords: part.paragraphs.reduce((total, paragraph) => total + countWords(paragraph), 0),
        targetWords: part.targetWords,
        part: index + 1,
        partCount,
      }),
      input: { paragraphs: part.paragraphs },
      outputSchema: DigestOutputSchema,
      maxInputTokens: MAX_INPUT_TOKENS,
      // Room for reasoning tokens, which reasoning models count against this limit.
      maxOutputTokens: part.targetWords * 4 + 2_000,
    });
    return completion.value.paragraphs;
  }
}

async function mapInBatches<T, R>(items: readonly T[], size: number, map: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += size) {
    const batch = items.slice(start, start + size);
    results.push(...(await Promise.all(batch.map((item, offset) => map(item, start + offset)))));
  }
  return results;
}
