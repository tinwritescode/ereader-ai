import { z } from 'zod';
import { countWords } from '../../../shared/reading-time';
import { ChapterInLine, shareDone } from '../../../shared/tasks/chapter-line';
import { Block } from '../../books/domain/book';

export const BookTranslationRequestSchema = z.object({
  /** The chapter being read, translated first; the start of the book when absent. */
  startChapterId: z.string().min(1).nullable().default(null),
});

export const PutFirstRequestSchema = z.object({ chapterId: z.string().min(1) });

export type BookTranslationState =
  | { kind: 'queued' }
  | { kind: 'running' }
  | { kind: 'done' }
  | { kind: 'stopped'; code: 'TRANSLATE_FAILED' };

/** Translates the chapters of one book into Vietnamese, one chapter at a time. */
export type BookTranslationTask = {
  id: string;
  accountId: string;
  bookId: string;
  bookTitle: string;
  /** Still to translate, in the order they will be done; the head is the one under way. */
  remaining: ChapterInLine[];
  /** Translated by this task, in the order they were done. */
  translated: ChapterInLine[];
  /** Parts done of the head of [remaining], while it is being translated. */
  current: { done: number; parts: number } | null;
  state: BookTranslationState;
  /** Whether this task still holds one of the month's book translations; a failure hands it back once. */
  charged: boolean;
  createdAt: Date;
  finishedAt: Date | null;
};

export function isFinished({ state }: Pick<BookTranslationTask, 'state'>): boolean {
  return state.kind === 'done' || state.kind === 'stopped';
}

/** Moves a waiting chapter to the front of the line, behind the one already being translated. */
export function putFirst(task: BookTranslationTask, chapterId: string): BookTranslationTask {
  const wanted = task.remaining.find((chapter) => chapter.chapterId === chapterId);
  if (!wanted) return task;
  const keep = task.current ? 1 : 0;
  if (task.remaining.indexOf(wanted) < keep) return task;
  const rest = task.remaining.filter((chapter) => chapter !== wanted);
  return { ...task, remaining: [...rest.slice(0, keep), wanted, ...rest.slice(keep)] };
}

/** Share of the task's words translated, 0 to 100. */
export function percentDone({ remaining, translated, current }: BookTranslationTask): number {
  return shareDone({ remaining, finished: translated, current });
}

/** Runs of consecutive blocks for one model call each; a block longer than the budget goes alone, whole. */
export function partsOf(blocks: readonly Block[], maxWords: number): Block[][] {
  const parts: Block[][] = [];
  let words = 0;
  for (const block of blocks) {
    const size = countWords(block.text);
    const last = parts.at(-1);
    if (last && words + size <= maxWords) {
      last.push(block);
      words += size;
    } else {
      parts.push([block]);
      words = size;
    }
  }
  return parts;
}
