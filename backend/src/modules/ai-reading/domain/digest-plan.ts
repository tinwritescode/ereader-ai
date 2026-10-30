import { countWords } from '../../../shared/reading-time';

/** One LLM call: a run of consecutive paragraphs and how many words its shortened form should have. */
export type DigestPart = {
  paragraphs: string[];
  targetWords: number;
};

// Below this a part comes back as a fragment rather than prose.
const MIN_PART_TARGET_WORDS = 30;

/**
 * Splits a chapter into parts small enough for one call, at paragraph breaks where possible.
 * Each part gets a share of the target proportional to its length, so the joined result keeps the chapter's balance.
 */
export function planDigest({ paragraphs, targetWords, maxPartWords }: {
  paragraphs: readonly string[];
  targetWords: number;
  maxPartWords: number;
}): DigestPart[] {
  const runs = paragraphs.flatMap((paragraph) => splitLongParagraph(paragraph, maxPartWords));
  const parts: string[][] = [];
  let current: string[] = [];
  let currentWords = 0;
  for (const run of runs) {
    const runWords = countWords(run);
    if (current.length > 0 && currentWords + runWords > maxPartWords) {
      parts.push(current);
      current = [];
      currentWords = 0;
    }
    current.push(run);
    currentWords += runWords;
  }
  if (current.length > 0) parts.push(current);

  const totalWords = runs.reduce((total, run) => total + countWords(run), 0);
  return parts.map((part) => ({
    paragraphs: part,
    targetWords: Math.max(
      MIN_PART_TARGET_WORDS,
      Math.round((targetWords * part.reduce((total, run) => total + countWords(run), 0)) / totalWords),
    ),
  }));
}

function splitLongParagraph(paragraph: string, maxWords: number): string[] {
  const words = paragraph.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return [paragraph];
  const runs: string[] = [];
  for (let start = 0; start < words.length; start += maxWords) {
    runs.push(words.slice(start, start + maxWords).join(' '));
  }
  return runs;
}
