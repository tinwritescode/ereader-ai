import { Pool } from 'pg';
import { HistoryStore, SessionWrite } from '../application/history-store';
import { HISTORY_PAGE, HistoryFilter, ReadingSession, SessionReportSchema } from '../domain/reading-session';

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS reading_sessions (
    id uuid PRIMARY KEY,
    account_id text NOT NULL,
    book_id text NOT NULL,
    chapter_id text NOT NULL,
    chapter_label text NOT NULL,
    mode text NOT NULL,
    voice text,
    length text NOT NULL,
    minutes integer NOT NULL,
    block integer NOT NULL,
    "offset" integer NOT NULL,
    quote text,
    progress double precision NOT NULL,
    done boolean NOT NULL,
    started_at timestamptz NOT NULL,
    ended_at timestamptz NOT NULL
  );
  CREATE INDEX IF NOT EXISTS reading_sessions_account ON reading_sessions (account_id, ended_at DESC);
  CREATE TABLE IF NOT EXISTS reading_history_settings (
    account_id text PRIMARY KEY,
    paused boolean NOT NULL
  )`;

type SessionRow = {
  id: string;
  account_id: string;
  book_id: string;
  chapter_id: string;
  chapter_label: string;
  mode: string;
  voice: string | null;
  length: string;
  minutes: number;
  block: number;
  offset: number;
  quote: string | null;
  progress: number;
  done: boolean;
  started_at: Date;
  ended_at: Date;
};

/** Rows are read back through the report's schema, so a listen row without its voice never comes out. */
const toSession = (row: SessionRow): ReadingSession => ({
  ...SessionReportSchema.parse({
    mode: row.mode,
    ...(row.voice === null ? {} : { voice: row.voice }),
    bookId: row.book_id,
    chapterId: row.chapter_id,
    chapterLabel: row.chapter_label,
    length: row.length,
    minutes: row.minutes,
    block: row.block,
    offset: row.offset,
    quote: row.quote,
    progress: row.progress,
    done: row.done,
  }),
  id: row.id,
  accountId: row.account_id,
  startedAt: row.started_at,
  endedAt: row.ended_at,
});

export class PostgresHistoryStore implements HistoryStore {
  private ready: Promise<unknown> | null = null;

  constructor(private readonly pool: Pool) {}

  async record({ id, accountId, report, at }: SessionWrite): Promise<void> {
    await this.tables();
    const voice = report.mode === 'listen' ? report.voice : null;
    await this.pool.query(
      `INSERT INTO reading_sessions
         (id, account_id, book_id, chapter_id, chapter_label, mode, voice, length, minutes, block, "offset", quote, progress, done, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
       ON CONFLICT (id) DO UPDATE SET
         book_id = EXCLUDED.book_id, chapter_id = EXCLUDED.chapter_id, chapter_label = EXCLUDED.chapter_label,
         mode = EXCLUDED.mode, voice = EXCLUDED.voice, length = EXCLUDED.length, minutes = EXCLUDED.minutes,
         block = EXCLUDED.block, "offset" = EXCLUDED."offset", quote = EXCLUDED.quote, progress = EXCLUDED.progress,
         done = reading_sessions.done OR EXCLUDED.done, ended_at = EXCLUDED.ended_at
       WHERE reading_sessions.account_id = EXCLUDED.account_id`,
      [
        id,
        accountId,
        report.bookId,
        report.chapterId,
        report.chapterLabel,
        report.mode,
        voice,
        report.length,
        report.minutes,
        report.block,
        report.offset,
        report.quote,
        report.progress,
        report.done,
        at,
      ],
    );
  }

  async list(accountId: string, { mode, bookId }: HistoryFilter): Promise<ReadingSession[]> {
    await this.tables();
    const { rows } = await this.pool.query<SessionRow>(
      `SELECT * FROM reading_sessions
       WHERE account_id = $1 AND ($2::text IS NULL OR mode = $2) AND ($3::text IS NULL OR book_id = $3)
       ORDER BY ended_at DESC LIMIT $4`,
      [accountId, mode ?? null, bookId ?? null, HISTORY_PAGE],
    );
    return rows.map(toSession);
  }

  async remove(accountId: string, id: string): Promise<void> {
    await this.tables();
    await this.pool.query('DELETE FROM reading_sessions WHERE id = $1 AND account_id = $2', [id, accountId]);
  }

  async clear(accountId: string): Promise<void> {
    await this.tables();
    await this.pool.query('DELETE FROM reading_sessions WHERE account_id = $1', [accountId]);
  }

  async isPaused(accountId: string): Promise<boolean> {
    await this.tables();
    const { rows } = await this.pool.query<{ paused: boolean }>(
      'SELECT paused FROM reading_history_settings WHERE account_id = $1',
      [accountId],
    );
    return rows[0]?.paused ?? false;
  }

  async setPaused(accountId: string, paused: boolean): Promise<void> {
    await this.tables();
    await this.pool.query(
      `INSERT INTO reading_history_settings (account_id, paused) VALUES ($1, $2)
       ON CONFLICT (account_id) DO UPDATE SET paused = EXCLUDED.paused`,
      [accountId, paused],
    );
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
