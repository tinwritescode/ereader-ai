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
  status: 'READY',
  sourceChecksum: 'same-file',
  sourceKey: 'sources/same-file.epub',
  cover: { key: 'covers/same-file', mediaType: 'image/png' },
});

const chapter = (bookId: string, index: number): ChapterRecord => ({
  id: `${bookId}-${index}`,
  bookId,
  index,
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
