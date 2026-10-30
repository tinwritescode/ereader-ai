import { z } from 'zod';

export const NormalizedSectionSchema = z.object({
  title: z.string().min(1),
  level: z.union([z.literal(2), z.literal(3)]),
  startBlockId: z.string().min(1),
});

export const NormalizedChapterSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  title: z.string().min(1),
  startBlockId: z.string().min(1),
  endBlockId: z.string().min(1),
  wordCount: z.number().int().nonnegative(),
  sections: z.array(NormalizedSectionSchema),
});

export const NormalizedBookSchema = z.object({
  bookId: z.string().min(1),
  language: z.string().min(2),
  chapters: z.array(NormalizedChapterSchema),
});

export type NormalizedBook = z.infer<typeof NormalizedBookSchema>;

export type TextBlock = {
  blockId: string;
  text: string;
};

export function validateCoverage(
  blocks: readonly TextBlock[],
  normalized: NormalizedBook,
): void {
  const blockIds = new Set(blocks.map((block) => block.blockId));
  if (blockIds.size !== blocks.length) {
    throw new Error('NORMALIZATION_DUPLICATE_BLOCK_ID');
  }
  const blockIndex = new Map(blocks.map((block, index) => [block.blockId, index]));
  const covered = new Set<string>();
  let previousEnd = -1;

  for (const chapter of normalized.chapters) {
    const start = blockIndex.get(chapter.startBlockId);
    const end = blockIndex.get(chapter.endBlockId);
    if (start === undefined) {
      throw new Error(`NORMALIZATION_UNKNOWN_BLOCK:${chapter.startBlockId}`);
    }
    if (end === undefined) {
      throw new Error(`NORMALIZATION_UNKNOWN_BLOCK:${chapter.endBlockId}`);
    }
    if (start > end || start !== previousEnd + 1) {
      throw new Error('NORMALIZATION_NON_CONTIGUOUS_COVERAGE');
    }
    for (let index = start; index <= end; index += 1) {
      covered.add(blocks[index].blockId);
    }
    for (const section of chapter.sections) {
      const sectionIndex = blockIndex.get(section.startBlockId);
      if (sectionIndex === undefined) {
        throw new Error(`NORMALIZATION_UNKNOWN_BLOCK:${section.startBlockId}`);
      }
      if (sectionIndex < start || sectionIndex > end) {
        throw new Error('NORMALIZATION_SECTION_OUTSIDE_CHAPTER');
      }
    }
    previousEnd = end;
  }

  if (normalized.chapters.some((chapter, index) => chapter.index !== index)) {
    throw new Error('NORMALIZATION_INVALID_CHAPTER_ORDER');
  }

  if (covered.size !== blocks.length) {
    throw new Error('NORMALIZATION_INCOMPLETE_COVERAGE');
  }
}
