import { Block } from '../../books/domain/book';
import { chapterLine } from '../../../shared/tasks/chapter-line';
import { BookTranslationTask, partsOf, passagesFrom, percentDone, putFirst } from './book-translation';

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

describe('chapterLine', () => {
  const chapters = ['c1', 'c2', 'c3', 'c4'].map((id) => chapter(id));

  it('starts at the chapter being read, then goes back for the earlier ones', () => {
    expect(chapterLine({ chapters, startAt: 'c3', skip: [] }).map(({ chapterId }) => chapterId)).toEqual([
      'c3',
      'c4',
      'c1',
      'c2',
    ]);
  });

  it('starts at the beginning without a known chapter, and skips what is already translated', () => {
    expect(
      chapterLine({ chapters, startAt: 'missing', skip: ['c2', 'c4'] }).map(({ chapterId }) => chapterId),
    ).toEqual(['c1', 'c3']);
    expect(chapterLine({ chapters, startAt: null, skip: [] })[0].chapterId).toBe('c1');
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

describe('passagesFrom', () => {
  const text = (words: number) => 'word '.repeat(words).trim();
  const block = (name: string, words: number): Block => ({ blockId: name, kind: 'paragraph', text: `${name} ${text(words - 1)}` });

  it('gives a short book whole', () => {
    expect(passagesFrom([block('a', 10), block('b', 10)], 100)).toHaveLength(2);
  });

  it('reads from all through a long book, not only its opening', () => {
    const book = Array.from({ length: 1_000 }, (_, index) => block(`p${index}`, 100));
    const passages = passagesFrom(book, 1_000);
    const words = passages.join(' ').split(' ').length;
    expect(words).toBeLessThanOrEqual(1_100);
    expect(passages[0]).toMatch(/^p0 /);
    expect(passages.at(-1)).toMatch(/^p9[0-9]{2} /);
  });

  it('never lets one giant paragraph take the whole sample', () => {
    const [passage] = passagesFrom([block('huge', 5_000)], 1_200);
    expect(passage.split(' ')).toHaveLength(100);
  });
});
