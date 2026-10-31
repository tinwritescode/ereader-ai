import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { LLM_GATEWAY, LlmCompletionRequest, LlmError } from '../../shared/llm/llm-gateway';
import { ScriptedLlmGateway } from '../../shared/llm/testing/scripted-llm.gateway';
import { LocalDiskStorageGateway } from '../../shared/storage/local-disk.storage-gateway';
import { AccountSlots } from '../../shared/tasks/account-slots';
import { InMemoryAccountStore } from '../accounts/application/account-store';
import { usageMonth } from '../accounts/domain/plan';
import { testAccounts } from '../accounts/testing/fake-identity';
import { BooksModule } from '../books/books.module';
import { buildEpub } from '../books/testing/epub-fixture';
import { BookTranslationService } from './application/book-translation.service';
import {
  BOOK_TRANSLATION_STORE,
  CHAPTER_TRANSLATIONS,
  InMemoryBookTranslationStore,
  InMemoryChapterTranslations,
} from './application/translation-stores';
import { BookTranslationController } from './presentation/book-translation.controller';

type Input = { blocks: { id: string; text: string }[] };
type Task = {
  id: string;
  state: string;
  code: string | null;
  done: number;
  total: number;
  percent: number;
  waiting: string[];
  current: { chapterId: string; percent: number } | null;
};

const hasBlocks = (input: unknown): input is Input =>
  typeof input === 'object' && input !== null && 'blocks' in input && Array.isArray(input.blocks);

/** Answers each block with its text marked as translated. */
const translate = (request: LlmCompletionRequest<unknown>) => {
  if (!hasBlocks(request.input)) throw new Error('unexpected input');
  return { blocks: request.input.blocks.map(({ id, text }) => ({ id, text: `VI ${text}` })) };
};

describe('translating a whole book', () => {
  let app: INestApplication;
  let storageDir: string;
  let llm: ScriptedLlmGateway;
  let accounts: InMemoryAccountStore;
  let store: InMemoryBookTranslationStore;
  let translations: InMemoryChapterTranslations;
  /** While set, every model call waits for it. */
  let gate: Promise<void> | null;

  const start = async () => {
    const fakes = testAccounts();
    accounts = fakes.store;
    await accounts.upsert({ id: 'max-1', email: 'max@example.com' });
    await accounts.upsert({ id: 'free-1', email: 'free@example.com' });
    await accounts.setPlan('max-1', 'max');
    const moduleRef = await Test.createTestingModule({
      imports: [fakes.module, BooksModule.register({ maxUploadBytes: 10 * 1024 * 1024, storage: new LocalDiskStorageGateway(storageDir) })],
      controllers: [BookTranslationController],
      providers: [
        BookTranslationService,
        { provide: LLM_GATEWAY, useValue: llm },
        { provide: BOOK_TRANSLATION_STORE, useValue: store },
        { provide: CHAPTER_TRANSLATIONS, useValue: translations },
        { provide: AccountSlots, useValue: new AccountSlots() },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  };

  beforeEach(async () => {
    gate = null;
    llm = new ScriptedLlmGateway(async (request) => {
      await gate;
      return translate(request);
    });
    storageDir = await mkdtemp(join(tmpdir(), 'translation-e2e-'));
    store = new InMemoryBookTranslationStore();
    translations = new InMemoryChapterTranslations();
    await start();
  });

  afterEach(async () => {
    await app.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());
  const as = (id: string) => ({ Authorization: `Bearer ${id}` });

  const importBook = async (userId = 'max-1', language = 'en') => {
    const { body } = await http().post('/books').set(as(userId)).attach('file', await buildEpub({ language }), 'book.epub').expect(202);
    const { body: list } = await http().get(`/books/${body.bookId}/chapters`).set(as(userId)).expect(200);
    return { bookId: String(body.bookId), chapters: list.chapters.map(({ chapterId }: { chapterId: string }) => chapterId) };
  };

  const tasks = async (userId = 'max-1'): Promise<Task[]> =>
    (await http().get('/translations/tasks').set(as(userId)).expect(200)).body.tasks;

  const settled = async (userId = 'max-1') => {
    for (let tries = 0; tries < 100; tries += 1) {
      const all = await tasks(userId);
      if (all.every(({ state }) => state === 'done' || state === 'stopped')) return all;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('tasks never settled');
  };

  const used = async (id = 'max-1') => (await accounts.usage(id, usageMonth(new Date()))).bookTranslations;

  it('translates every chapter from the one being read, keeping each block in its place', async () => {
    const { bookId, chapters } = await importBook();
    const { body } = await http().post(`/books/${bookId}/translation`).set(as('max-1')).send({ startChapterId: chapters[1] }).expect(201);
    expect(body).toMatchObject({ kind: 'bookTranslation', total: 3, waiting: [chapters[1], chapters[2], chapters[0]] });

    const [task] = await settled();
    expect(task).toMatchObject({ state: 'done', done: 3, total: 3, percent: 100, waiting: [] });
    expect(await used()).toBe(1);

    const { body: original } = await http().get(`/chapters/${chapters[0]}`).set(as('max-1')).expect(200);
    const { body: translated } = await http().get(`/chapters/${chapters[0]}/translation`).set(as('max-1')).expect(200);
    expect(translated.blocks).toEqual(
      original.blocks.map((block: { text: string }) => ({ ...block, text: `VI ${block.text}` })),
    );
    const { body: book } = await http().get(`/books/${bookId}/translation`).set(as('max-1')).expect(200);
    expect([...book.translated].sort()).toEqual([...chapters].sort());
    expect(book.task).toMatchObject({ state: 'done' });

    await http().post(`/books/${bookId}/translation`).set(as('max-1')).send({}).expect(409);
  });

  it('is for Max, for books not already in Vietnamese, and for the owner only', async () => {
    const { bookId } = await importBook('free-1');
    await http().post(`/books/${bookId}/translation`).set(as('free-1')).send({}).expect(403);

    const vietnamese = await importBook('max-1', 'vi');
    await http().post(`/books/${vietnamese.bookId}/translation`).set(as('max-1')).send({}).expect(400);
    await http().post(`/books/${bookId}/translation`).set(as('max-1')).send({}).expect(404);
    expect(await used()).toBe(0);
  });

  it('says a chapter is not ready until it is translated', async () => {
    const { bookId, chapters } = await importBook();
    let open = () => undefined as void;
    gate = new Promise((resolve) => (open = resolve));
    await http().post(`/books/${bookId}/translation`).set(as('max-1')).send({}).expect(201);
    await http().get(`/chapters/${chapters[0]}/translation`).set(as('max-1')).expect(404);
    const [running] = await tasks();
    expect(running).toMatchObject({ state: 'running', current: { chapterId: chapters[0], percent: 0 } });
    open();
    await settled();
    await http().get(`/chapters/${chapters[0]}/translation`).set(as('max-1')).expect(200);
  });

  it('answers a second request for the same book with the task under way, without a second charge', async () => {
    const { bookId } = await importBook();
    gate = new Promise(() => undefined);
    const first = await http().post(`/books/${bookId}/translation`).set(as('max-1')).send({}).expect(201);
    const second = await http().post(`/books/${bookId}/translation`).set(as('max-1')).send({}).expect(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await used()).toBe(1);
  });

  it('moves a waiting chapter up when the reader opens it', async () => {
    const { bookId, chapters } = await importBook();
    gate = new Promise(() => undefined);
    const { body } = await http().post(`/books/${bookId}/translation`).set(as('max-1')).send({}).expect(201);
    const { body: moved } = await http()
      .post(`/translations/tasks/${body.id}/first`)
      .set(as('max-1'))
      .send({ chapterId: chapters[2] })
      .expect(201);
    expect(moved.waiting).toEqual([chapters[0], chapters[2], chapters[1]]);
  });

  it('tries again when the model drops a block', async () => {
    const { bookId } = await importBook();
    let calls = 0;
    llm.answer = (request) => {
      calls += 1;
      const answer = translate(request);
      return calls === 1 ? { blocks: answer.blocks.slice(1).length ? answer.blocks.slice(1) : [{ id: 'x', text: 'y' }] } : answer;
    };
    await http().post(`/books/${bookId}/translation`).set(as('max-1')).send({}).expect(201);
    expect((await settled())[0].state).toBe('done');
  });

  it('stops when the model keeps failing, hands the month back, and goes on for free', async () => {
    const { bookId, chapters } = await importBook();
    llm.answer = (request) => {
      if (hasBlocks(request.input) && request.input.blocks.some(({ text }) => text.startsWith('hai'))) {
        throw new LlmError('UPSTREAM_ERROR');
      }
      return translate(request);
    };
    await http().post(`/books/${bookId}/translation`).set(as('max-1')).send({}).expect(201);
    const [stopped] = await settled();
    expect(stopped).toMatchObject({ state: 'stopped', code: 'TRANSLATE_FAILED', done: 1, waiting: [chapters[1], chapters[2]] });
    expect(await used()).toBe(0);
    await http().get(`/chapters/${chapters[0]}/translation`).set(as('max-1')).expect(200);

    llm.answer = translate;
    const { body: again } = await http().post(`/books/${bookId}/translation`).set(as('max-1')).send({}).expect(201);
    expect(again.id).toBe(stopped.id);
    expect((await settled())[0]).toMatchObject({ state: 'done', done: 3 });
    expect(await used()).toBe(0);
  });

  it('cancelling keeps what is translated and the month stays used', async () => {
    const { bookId, chapters } = await importBook();
    llm.answer = async (request) => {
      if (hasBlocks(request.input) && request.input.blocks.some(({ text }) => text.startsWith('hai'))) {
        await new Promise(() => undefined);
      }
      return translate(request);
    };
    const { body } = await http().post(`/books/${bookId}/translation`).set(as('max-1')).send({}).expect(201);
    for (let tries = 0; tries < 100 && !(await translations.find(chapters[0])); tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await http().delete(`/translations/tasks/${body.id}`).set(as('max-1')).expect(204);
    expect(await tasks()).toEqual([]);
    await http().get(`/chapters/${chapters[0]}/translation`).set(as('max-1')).expect(200);
    expect(await used()).toBe(1);
  });

  it('picks up an interrupted task after a restart', async () => {
    const { bookId, chapters } = await importBook();
    await store.save({
      id: '00000000-0000-4000-8000-000000000009',
      accountId: 'max-1',
      bookId,
      bookTitle: 'Synthetic Book',
      remaining: chapters.map((chapterId: string) => ({ chapterId, label: chapterId, words: 10 })),
      translated: [],
      current: { done: 1, parts: 2 },
      state: { kind: 'running' },
      charged: true,
      createdAt: new Date(),
      finishedAt: null,
    });
    // What a fresh process does on boot, against the same stores.
    await app.get(BookTranslationService).onApplicationBootstrap();
    expect((await settled())[0]).toMatchObject({ state: 'done', done: 3 });
  });
});
