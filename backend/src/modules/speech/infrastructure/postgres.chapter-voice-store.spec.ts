import { Pool } from 'pg';
import { ChapterVoiceTask } from '../domain/chapter-voice';
import { PostgresChapterVoiceStore } from './postgres.chapter-voice-store';

const task = (id: string, overrides: Partial<ChapterVoiceTask> = {}): ChapterVoiceTask => ({
  id,
  accountId: 'store-spec',
  bookId: 'b',
  chapterId: 'c',
  bookTitle: 'Sách',
  chapterLabel: 'Chương Một',
  minutes: null,
  voiceCode: 'vieneu-clone',
  voiceName: 'Hạt Dẻ',
  sentences: ['Câu một.'],
  state: { kind: 'queued' },
  done: 0,
  createdAt: new Date('2026-10-31T00:00:00Z'),
  finishedAt: null,
  ...overrides,
});

const url = process.env.TEST_DATABASE_URL;

(url ? describe : describe.skip)('PostgresChapterVoiceStore', () => {
  const pool = new Pool({ connectionString: url });
  const store = new PostgresChapterVoiceStore(pool);
  const first = '00000000-0000-4000-8000-000000000001';
  const second = '00000000-0000-4000-8000-000000000002';

  afterAll(async () => {
    await pool.query(`DELETE FROM chapter_voice_tasks WHERE account_id = 'store-spec'`);
    await pool.end();
  });

  it('keeps a task whole, oldest first, and replaces it by id', async () => {
    const finishedAt = new Date('2026-10-31T01:00:00Z');
    await store.save(task(second, { createdAt: new Date('2026-10-31T00:00:01Z') }));
    await store.save(task(first, { state: { kind: 'stopped', code: 'VBEE_LIMIT' }, finishedAt }));
    const [oldest, newest] = await store.ofAccount('store-spec');
    expect(oldest).toEqual(task(first, { state: { kind: 'stopped', code: 'VBEE_LIMIT' }, finishedAt }));
    expect(newest.id).toBe(second);
  });

  it('counts sentences and knows what a restart must pick up', async () => {
    await store.setDone(second, 7);
    const unfinished = (await store.unfinished()).filter(({ accountId }) => accountId === 'store-spec');
    expect(unfinished).toEqual([task(second, { done: 7, createdAt: new Date('2026-10-31T00:00:01Z') })]);
  });

  it('forgets a removed task', async () => {
    await store.remove(second);
    expect((await store.ofAccount('store-spec')).map(({ id }) => id)).toEqual([first]);
  });
});
