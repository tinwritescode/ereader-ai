import { Pool } from 'pg';
import { PostgresTaskTable } from '../../../shared/tasks/postgres.task-table';
import { Block } from '../../books/domain/book';
import { StyleSheet } from '../application/translation-prompt';
import { ChapterTranslation, ChapterTranslations, StyleSheets } from '../application/translation-stores';
import { BookTranslationTask } from '../domain/book-translation';

export class PostgresBookTranslationStore extends PostgresTaskTable<BookTranslationTask> {
  constructor(pool: Pool) {
    super(pool, 'book_translation_tasks', ({ createdAt, finishedAt, ...task }) => ({
      ...task,
      createdAt: new Date(createdAt),
      finishedAt: finishedAt ? new Date(finishedAt) : null,
    }));
  }
}

const CREATE_SHEETS_TABLE = `
  CREATE TABLE IF NOT EXISTS translation_style_sheets (
    book_id text PRIMARY KEY,
    sheet jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

export class PostgresStyleSheets implements StyleSheets {
  private ready: Promise<unknown> | null = null;

  constructor(private readonly pool: Pool) {}

  async save(bookId: string, sheet: StyleSheet): Promise<void> {
    await this.table();
    await this.pool.query(
      'INSERT INTO translation_style_sheets (book_id, sheet) VALUES ($1, $2) ON CONFLICT (book_id) DO NOTHING',
      [bookId, JSON.stringify(sheet)],
    );
  }

  async find(bookId: string): Promise<StyleSheet | null> {
    await this.table();
    const { rows } = await this.pool.query<{ sheet: StyleSheet }>(
      'SELECT sheet FROM translation_style_sheets WHERE book_id = $1',
      [bookId],
    );
    return rows[0]?.sheet ?? null;
  }

  private table(): Promise<unknown> {
    // A failed attempt is not kept, so the next call tries again.
    this.ready ??= this.pool.query(CREATE_SHEETS_TABLE).catch((error: unknown) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS chapter_translations (
    chapter_id text PRIMARY KEY,
    book_id text NOT NULL,
    blocks jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS chapter_translations_of_book ON chapter_translations (book_id)`;

export class PostgresChapterTranslations implements ChapterTranslations {
  private ready: Promise<unknown> | null = null;

  constructor(private readonly pool: Pool) {}

  async save({ chapterId, bookId, blocks }: ChapterTranslation): Promise<void> {
    await this.table();
    await this.pool.query(
      `INSERT INTO chapter_translations (chapter_id, book_id, blocks) VALUES ($1, $2, $3)
       ON CONFLICT (chapter_id) DO UPDATE SET blocks = EXCLUDED.blocks`,
      [chapterId, bookId, JSON.stringify(blocks)],
    );
  }

  async find(chapterId: string): Promise<Block[] | null> {
    await this.table();
    const { rows } = await this.pool.query<{ blocks: Block[] }>(
      'SELECT blocks FROM chapter_translations WHERE chapter_id = $1',
      [chapterId],
    );
    return rows[0]?.blocks ?? null;
  }

  async translatedOf(bookId: string): Promise<string[]> {
    await this.table();
    const { rows } = await this.pool.query<{ chapter_id: string }>(
      'SELECT chapter_id FROM chapter_translations WHERE book_id = $1',
      [bookId],
    );
    return rows.map(({ chapter_id }) => chapter_id);
  }

  private table(): Promise<unknown> {
    // A failed attempt is not kept, so the next call tries again.
    this.ready ??= this.pool.query(CREATE_TABLE).catch((error: unknown) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }
}
