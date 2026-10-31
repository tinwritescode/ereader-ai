import { Pool } from 'pg';
import { BookRecord, ChapterRecord } from '../domain/book';
import { PostgresBookStore } from './postgres.book-store';

// Runs against a real Postgres: TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/ereader_test.
const url = process.env.TEST_DATABASE_URL;

const book = (id: string, userId = 'user-1'): BookRecord => ({
  id,
  userId,
  title: 'Sách',
  author: null,
  language: 'vi',
  shapeVersion: 1,
  status: 'READY',
  sourceChecksum: 'same-file',
  sourceKey: 'sources/same-file.epub',
  cover: { key: 'covers/same-file', mediaType: 'image/png' },
});

const chapter = (bookId: string, index: number): ChapterRecord => ({
  id: `${bookId}-${index}`,
  bookId,
  index,
  kind: 'main',
  label: `Chương ${index}`,
  subtitle: null,
  wordCount: 100,
  minutes: 2,
  blocks: [{ blockId: 'b1', kind: 'paragraph', text: 'Một câu.' }],
});

(url ? describe : describe.skip)('PostgresBookStore', () => {
  let pool: Pool;
  let store: PostgresBookStore;

  beforeAll(() => {
    pool = new Pool({ connectionString: url });
  });

  beforeEach(async () => {
    await pool.query('DROP TABLE IF EXISTS chapters, books');
    store = new PostgresBookStore(pool);
  });

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS chapters, books');
    await pool.end();
  });

  it('keeps a book with its chapters in order, and sums them up', async () => {
    await store.add(book('b1'), [chapter('b1', 1), chapter('b1', 0)]);
    expect(await store.find('b1')).toEqual(book('b1'));
    expect((await store.chapters('b1')).map(({ index }) => index)).toEqual([0, 1]);
    expect(await store.chapter('b1-1')).toEqual(chapter('b1', 1));
    expect(await store.list('user-1')).toEqual([{ ...book('b1'), chapterCount: 2, minutes: 4 }]);
    expect(await store.count('user-1')).toBe(1);
  });

  it('reshapes a stale book, leaving front matter out of its chapter count', async () => {
    await store.add({ ...book('b1'), shapeVersion: 0 }, [chapter('b1', 0), chapter('b1', 1)]);
    expect((await store.staleBefore(1)).map(({ id }) => id)).toEqual(['b1']);
    await store.reshape({
      bookId: 'b1',
      language: 'en',
      shapeVersion: 1,
      chapters: [{ id: 'b1-0', label: 'Giới thiệu', subtitle: null, kind: 'front' }],
    });
    expect(await store.staleBefore(1)).toEqual([]);
    expect(await store.find('b1')).toMatchObject({ language: 'en', shapeVersion: 1 });
    expect(await store.chapter('b1-0')).toMatchObject({ label: 'Giới thiệu', kind: 'front' });
    expect(await store.chapter('b1-1')).toMatchObject({ label: 'Chương 1', kind: 'main' });
    expect((await store.summary('b1'))?.chapterCount).toBe(1);
  });

  it('adds the new columns to tables made before them, with books due a reshape', async () => {
    await store.add(book('b1'), [chapter('b1', 0)]);
    await pool.query('ALTER TABLE books DROP COLUMN shape_version; ALTER TABLE chapters DROP COLUMN kind');
    const reopened = new PostgresBookStore(pool);
    expect((await reopened.staleBefore(1)).map(({ id }) => id)).toEqual(['b1']);
    expect(await reopened.chapter('b1-0')).toMatchObject({ kind: 'main' });
  });

  it('answers with the kept book when the same file arrives twice at once', async () => {
    const results = await Promise.all(['b1', 'b2'].map((id) => store.add(book(id), [chapter(id, 0)])));
    expect(results.filter(({ created }) => created)).toHaveLength(1);
    expect(results[0].book.id).toBe(results[1].book.id);
    expect(await store.count('user-1')).toBe(1);
  });

  it('keeps a separate copy of the same file for another user', async () => {
    await store.add(book('b1'), []);
    await store.add(book('b2', 'user-2'), []);
    expect(await store.findBySource('user-2', 'same-file')).toMatchObject({ id: 'b2' });
    expect(await store.list('user-2')).toEqual([{ ...book('b2', 'user-2'), chapterCount: 0, minutes: 0 }]);
  });
});
