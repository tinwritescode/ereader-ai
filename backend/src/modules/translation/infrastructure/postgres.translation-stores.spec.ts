import { Pool } from 'pg';
import { BookTranslationTask } from '../domain/book-translation';
import { PostgresBookTranslationStore, PostgresChapterTranslations, PostgresStyleSheets } from './postgres.translation-stores';

const url = process.env.TEST_DATABASE_URL;

(url ? describe : describe.skip)('Postgres translation stores', () => {
  const pool = new Pool({ connectionString: url });

  afterAll(async () => {
    await pool.query(`DELETE FROM chapter_translations WHERE book_id = 'store-spec'`);
    await pool.query(`DELETE FROM translation_style_sheets WHERE book_id = 'store-spec'`);
    await pool.query(`DELETE FROM book_translation_tasks WHERE account_id = 'store-spec'`);
    await pool.end();
  });

  it('keeps translated chapters by book and replaces one translated again', async () => {
    const chapters = new PostgresChapterTranslations(pool);
    const block = (text: string) => ({ blockId: 'b1', kind: 'paragraph' as const, text });
    await chapters.save({ chapterId: 'spec-c1', bookId: 'store-spec', blocks: [block('Một.')] });
    await chapters.save({ chapterId: 'spec-c1', bookId: 'store-spec', blocks: [block('Một lần nữa.')] });
    await chapters.save({ chapterId: 'spec-c2', bookId: 'store-spec', blocks: [block('Hai.')] });

    expect(await chapters.find('spec-c1')).toEqual([block('Một lần nữa.')]);
    expect(await chapters.find('spec-missing')).toBeNull();
    expect((await chapters.translatedOf('store-spec')).sort()).toEqual(['spec-c1', 'spec-c2']);
  });

  it('keeps one style sheet per book, the first written', async () => {
    const sheets = new PostgresStyleSheets(pool);
    const sheet = (voice: string) => ({ voice, narrator: 'tôi', characters: [], address: [], terms: [] });
    expect(await sheets.find('store-spec')).toBeNull();
    await sheets.save('store-spec', sheet('Đầu tiên.'));
    await sheets.save('store-spec', sheet('Về sau.'));
    expect(await sheets.find('store-spec')).toEqual(sheet('Đầu tiên.'));
  });

  it('keeps a task whole, with its dates', async () => {
    const tasks = new PostgresBookTranslationStore(pool);
    const task: BookTranslationTask = {
      id: '00000000-0000-4000-8000-000000000101',
      accountId: 'store-spec',
      bookId: 'store-spec',
      bookTitle: 'Sách',
      remaining: [{ chapterId: 'c2', label: 'Hai', words: 10 }],
      translated: [{ chapterId: 'c1', label: 'Một', words: 20 }],
      current: { done: 1, parts: 3 },
      state: { kind: 'stopped', code: 'TRANSLATE_FAILED' },
      charged: false,
      createdAt: new Date('2026-10-31T00:00:00Z'),
      finishedAt: new Date('2026-10-31T01:00:00Z'),
    };
    await tasks.save(task);
    expect(await tasks.ofAccount('store-spec')).toEqual([task]);
    expect((await tasks.unfinished()).filter(({ accountId }) => accountId === 'store-spec')).toEqual([]);
  });
});
