import { Block } from '../../books/domain/book';
import { BookTranslationTask, partsOf, percentDone, putFirst, translationOrder } from './book-translation';

const chapter = (chapterId: string, words = 100) => ({ chapterId, label: chapterId, words });

const task = (over: Partial<BookTranslationTask> = {}): BookTranslationTask => ({
  id: 't',
  accountId: 'a',
  bookId: 'b',
  bookTitle: 'Book',
  remaining: [chapter('c1'), chapter('c2'), chapter('c3')],
  translated: [],
  current: null,
  state: { kind: 'running' },
  charged: true,
  createdAt: new Date(0),
  finishedAt: null,
  ...over,
});

describe('translationOrder', () => {
  const chapters = ['c1', 'c2', 'c3', 'c4'].map((id) => chapter(id));

  it('starts at the chapter being read, then goes back for the earlier ones', () => {
    expect(translationOrder({ chapters, startAt: 'c3', translated: [] }).map(({ chapterId }) => chapterId)).toEqual([
      'c3',
      'c4',
      'c1',
      'c2',
    ]);
  });

  it('starts at the beginning without a known chapter, and skips what is already translated', () => {
    expect(
      translationOrder({ chapters, startAt: 'missing', translated: ['c2', 'c4'] }).map(({ chapterId }) => chapterId),
    ).toEqual(['c1', 'c3']);
    expect(translationOrder({ chapters, startAt: null, translated: [] })[0].chapterId).toBe('c1');
  });
});

describe('putFirst', () => {
  it('puts a waiting chapter next, after the one being translated', () => {
    const moved = putFirst(task({ current: { done: 1, parts: 3 } }), 'c3');
    expect(moved.remaining.map(({ chapterId }) => chapterId)).toEqual(['c1', 'c3', 'c2']);
  });

  it('puts it at the head when nothing is under way', () => {
    const moved = putFirst(task({ state: { kind: 'queued' } }), 'c3');
    expect(moved.remaining.map(({ chapterId }) => chapterId)).toEqual(['c3', 'c1', 'c2']);
  });

  it('leaves the line alone for a chapter not in it', () => {
    const original = task();
    expect(putFirst(original, 'elsewhere')).toEqual(original);
  });
});

describe('percentDone', () => {
  it('weighs chapters by their words, counting the parts done of the current one', () => {
    const halfway = task({
      translated: [chapter('c0', 200)],
      remaining: [chapter('c1', 100), chapter('c2', 100)],
      current: { done: 1, parts: 2 },
    });
    expect(percentDone(halfway)).toBe(63);
  });

  it('is 100 when nothing remains, and 0 at the start', () => {
    expect(percentDone(task({ remaining: [], translated: [chapter('c1')] }))).toBe(100);
    expect(percentDone(task())).toBe(0);
  });
});

describe('partsOf', () => {
  const block = (blockId: string, words: number): Block => ({
    blockId,
    kind: 'paragraph',
    text: Array.from({ length: words }, () => 'w').join(' '),
  });

  it('groups blocks in order, up to the word budget, keeping a long block whole', () => {
    const parts = partsOf([block('a', 40), block('b', 50), block('c', 30), block('d', 200)], 100);
    expect(parts.map((part) => part.map(({ blockId }) => blockId))).toEqual([['a', 'b'], ['c'], ['d']]);
  });

  it('has no parts for an empty chapter', () => {
    expect(partsOf([], 100)).toEqual([]);
  });
});
