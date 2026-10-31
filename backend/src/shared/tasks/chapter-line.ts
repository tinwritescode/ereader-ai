/** A chapter waiting in a whole-book task. */
export type ChapterInLine = { chapterId: string; label: string; words: number };

/** From the chapter being read to the end, then the chapters before it; leaves out [skip]. */
export function chapterLine({ chapters, startAt, skip }: {
  chapters: readonly ChapterInLine[];
  startAt: string | null;
  skip: readonly string[];
}): ChapterInLine[] {
  const start = Math.max(0, chapters.findIndex(({ chapterId }) => chapterId === startAt));
  return [...chapters.slice(start), ...chapters.slice(0, start)].filter(({ chapterId }) => !skip.includes(chapterId));
}

/** Share of a whole-book task's words done, 0 to 100; [current] is how far the head of [remaining] is. */
export function shareDone({ remaining, finished, current }: {
  remaining: readonly ChapterInLine[];
  finished: readonly ChapterInLine[];
  current: { done: number; parts: number } | null;
}): number {
  const words = (chapters: readonly ChapterInLine[]) => chapters.reduce((total, chapter) => total + chapter.words, 0);
  const total = words(remaining) + words(finished);
  if (total === 0) return 100;
  const head = remaining[0];
  const underWay = head && current ? (head.words * current.done) / current.parts : 0;
  return Math.round((100 * (words(finished) + underWay)) / total);
}
