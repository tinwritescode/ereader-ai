import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { BookVoiceTask } from '../domain/book-voice';
import { PostgresBookVoiceStore } from './postgres.book-voice-store';

const url = process.env.TEST_DATABASE_URL;

(url ? describe : describe.skip)('PostgresBookVoiceStore', () => {
  const pool = new Pool({ connectionString: url });

  afterAll(async () => {
    await pool.query(`DELETE FROM book_voice_tasks WHERE account_id = 'store-spec'`);
    await pool.end();
  });

  it('keeps a task whole, with its dates', async () => {
    const tasks = new PostgresBookVoiceStore(pool);
    const task: BookVoiceTask = {
      id: randomUUID(),
      accountId: 'store-spec',
      bookId: 'b',
      bookTitle: 'Sách',
      voiceCode: 'v',
      voiceName: 'Giọng',
      source: 'translation',
      remaining: [{ chapterId: 'c1', label: 'Một', words: 10 }],
      voiced: [],
      current: { done: 1, parts: 4 },
      state: { kind: 'stopped', code: 'VBEE_LIMIT' },
      createdAt: new Date(1_000),
      finishedAt: new Date(2_000),
    };
    await tasks.save(task);
    expect(await tasks.ofAccount('store-spec')).toEqual([task]);
  });
});
