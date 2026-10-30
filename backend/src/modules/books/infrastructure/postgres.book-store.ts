import { Pool } from 'pg';
import { BookStore, BookSummary } from '../application/book-store';
import { Block, BookCover, BookRecord, BookStatus, ChapterRecord } from '../domain/book';

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS books (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    title text NOT NULL,
    author text,
    language text,
    status text NOT NULL,
    source_checksum text NOT NULL,
    source_key text NOT NULL,
    cover jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, source_checksum)
  );
  CREATE TABLE IF NOT EXISTS chapters (
    id text PRIMARY KEY,
    book_id text NOT NULL REFERENCES books (id) ON DELETE CASCADE,
    index integer NOT NULL,
    label text NOT NULL,
    subtitle text,
    word_count integer NOT NULL,
    minutes integer NOT NULL,
    blocks jsonb NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chapters_of_book ON chapters (book_id, index)`;

type BookRow = {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  language: string | null;
  status: BookStatus;
  source_checksum: string;
  source_key: string;
  cover: BookCover | null;
};

type ChapterRow = {
  id: string;
  book_id: string;
  index: number;
  label: string;
  subtitle: string | null;
  word_count: number;
  minutes: number;
  blocks: Block[];
};

const SUMMARY = `
  SELECT books.*, count(chapters.id)::int AS chapter_count, coalesce(sum(chapters.minutes), 0)::int AS total_minutes
  FROM books LEFT JOIN chapters ON chapters.book_id = books.id`;

function toBook(row: BookRow): BookRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    author: row.author,
    language: row.language,
    status: row.status,
    sourceChecksum: row.source_checksum,
    sourceKey: row.source_key,
    cover: row.cover,
  };
}

function toSummary(row: BookRow & { chapter_count: number; total_minutes: number }): BookSummary {
  return { ...toBook(row), chapterCount: row.chapter_count, minutes: row.total_minutes };
}

function toChapter({ book_id, word_count, ...row }: ChapterRow): ChapterRecord {
  return { ...row, bookId: book_id, wordCount: word_count };
}

export class PostgresBookStore implements BookStore {
  private ready: Promise<unknown> | null = null;

  constructor(private readonly pool: Pool) {}

  async add(book: BookRecord, chapters: ChapterRecord[]) {
    await this.tables();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(
        `INSERT INTO books (id, user_id, title, author, language, status, source_checksum, source_key, cover)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, source_checksum) DO NOTHING`,
        [book.id, book.userId, book.title, book.author, book.language, book.status, book.sourceChecksum, book.sourceKey, book.cover],
      );
      for (const chapter of rowCount === 1 ? chapters : []) {
        await client.query(
          `INSERT INTO chapters (id, book_id, index, label, subtitle, word_count, minutes, blocks)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [chapter.id, chapter.bookId, chapter.index, chapter.label, chapter.subtitle, chapter.wordCount, chapter.minutes, JSON.stringify(chapter.blocks)],
        );
      }
      await client.query('COMMIT');
      if (rowCount === 1) return { book, created: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const existing = await this.findBySource(book.userId, book.sourceChecksum);
    if (!existing) throw new Error('Book vanished after a source conflict');
    return { book: existing, created: false };
  }

  async find(id: string) {
    await this.tables();
    const { rows } = await this.pool.query<BookRow>('SELECT * FROM books WHERE id = $1', [id]);
    return rows[0] ? toBook(rows[0]) : null;
  }

  async findBySource(userId: string, sourceChecksum: string) {
    await this.tables();
    const { rows } = await this.pool.query<BookRow>(
      'SELECT * FROM books WHERE user_id = $1 AND source_checksum = $2',
      [userId, sourceChecksum],
    );
    return rows[0] ? toBook(rows[0]) : null;
  }

  async list(userId: string) {
    await this.tables();
    const { rows } = await this.pool.query(
      `${SUMMARY} WHERE books.user_id = $1 GROUP BY books.id ORDER BY books.created_at`,
      [userId],
    );
    return rows.map(toSummary);
  }

  async summary(id: string) {
    await this.tables();
    const { rows } = await this.pool.query(`${SUMMARY} WHERE books.id = $1 GROUP BY books.id`, [id]);
    return rows[0] ? toSummary(rows[0]) : null;
  }

  async count(userId: string) {
    await this.tables();
    const { rows } = await this.pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM books WHERE user_id = $1',
      [userId],
    );
    return rows[0].count;
  }

  async chapters(bookId: string) {
    await this.tables();
    const { rows } = await this.pool.query<ChapterRow>(
      'SELECT * FROM chapters WHERE book_id = $1 ORDER BY index',
      [bookId],
    );
    return rows.map(toChapter);
  }

  async chapter(id: string) {
    await this.tables();
    const { rows } = await this.pool.query<ChapterRow>('SELECT * FROM chapters WHERE id = $1', [id]);
    return rows[0] ? toChapter(rows[0]) : null;
  }

  private tables(): Promise<unknown> {
    // A failed attempt is not kept, so the next call tries again.
    this.ready ??= this.pool.query(CREATE_TABLES).catch((error: unknown) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }
}
