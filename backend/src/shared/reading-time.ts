/** Architecture baseline: 200 words per minute for Vietnamese. */
export const DEFAULT_WORDS_PER_MINUTE = 200;

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Whole minutes, never 0, so every chapter shows a length. */
export function readingMinutes(wordCount: number, wordsPerMinute = DEFAULT_WORDS_PER_MINUTE): number {
  return Math.max(1, Math.round(wordCount / wordsPerMinute));
}
