import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { SessionReport } from '../domain/reading-session';
import { PostgresHistoryStore } from './postgres.history-store';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('PostgresHistoryStore', () => {
  const pool = new Pool({ connectionString: url });
  const store = new PostgresHistoryStore(pool);
  const reader = `reader-${randomUUID()}`;
  const stranger = `stranger-${randomUUID()}`;

  const read: SessionReport = {
    mode: 'read',
    bookId: 'kieu',
    chapterId: 'ch-1',
    chapterLabel: 'Chương Một',
    length: 'shortened',
    minutes: 6,
    block: 4,
    offset: 0,
    quote: 'Kiều càng sắc sảo mặn mà',
    progress: 0.4,
    done: false,
  };
  const listen: SessionReport = { ...read, mode: 'listen', bookId: 'loeb', voice: 'Hạt Dẻ', quote: null };
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 6, 21, minute));

  afterAll(async () => {
    await pool.query('DELETE FROM reading_sessions WHERE account_id = ANY($1)', [[reader, stranger]]);
    await pool.query('DELETE FROM reading_history_settings WHERE account_id = ANY($1)', [[reader, stranger]]);
    await pool.end();
  });

  beforeEach(() => store.clear(reader));

  it('keeps a session as it was reported, a listen with its voice', async () => {
    const id = randomUUID();
    const heard = randomUUID();
    await store.record({ id, accountId: reader, report: read, at: at(0) });
    await store.record({ id: heard, accountId: reader, report: listen, at: at(1) });

    expect(await store.list(reader, {})).toEqual([
      { ...listen, id: heard, accountId: reader, startedAt: at(1), endedAt: at(1) },
      { ...read, id, accountId: reader, startedAt: at(0), endedAt: at(0) },
    ]);
    expect(await store.list(reader, { mode: 'listen' })).toHaveLength(1);
    expect(await store.list(reader, { bookId: 'kieu' })).toHaveLength(1);
  });

  it('moves a session on, keeps its start, and keeps it done once finished', async () => {
    const id = randomUUID();
    await store.record({ id, accountId: reader, report: read, at: at(0) });
    await store.record({ id, accountId: reader, report: { ...read, done: true, progress: 1 }, at: at(5) });
    await store.record({ id, accountId: reader, report: { ...read, block: 1, progress: 0.1 }, at: at(9) });

    expect(await store.list(reader, {})).toEqual([
      { ...read, block: 1, progress: 0.1, done: true, id, accountId: reader, startedAt: at(0), endedAt: at(9) },
    ]);
  });

  it("leaves another account's session as it is", async () => {
    const id = randomUUID();
    await store.record({ id, accountId: reader, report: read, at: at(0) });
    await store.record({ id, accountId: stranger, report: { ...read, block: 99 }, at: at(3) });
    await store.remove(stranger, id);
    await store.clear(stranger);

    expect(await store.list(reader, {})).toEqual([expect.objectContaining({ id, block: 4, endedAt: at(0) })]);
    expect(await store.list(stranger, {})).toEqual([]);

    await store.remove(reader, id);
    expect(await store.list(reader, {})).toEqual([]);
  });

  it('remembers a pause, and lifts it', async () => {
    expect(await store.isPaused(reader)).toBe(false);
    await store.setPaused(reader, true);
    await store.setPaused(reader, true);
    expect(await store.isPaused(reader)).toBe(true);
    await store.setPaused(reader, false);
    expect(await store.isPaused(reader)).toBe(false);
  });
});
