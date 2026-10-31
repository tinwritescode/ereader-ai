import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { LocalDiskStorageGateway } from '../../shared/storage/local-disk.storage-gateway';
import { AccountSlots } from '../../shared/tasks/account-slots';
import { InMemoryAccountStore } from '../accounts/application/account-store';
import { usageMonth } from '../accounts/domain/plan';
import { testAccounts } from '../accounts/testing/fake-identity';
import { BooksModule } from '../books/books.module';
import { buildEpub } from '../books/testing/epub-fixture';
import { InMemorySpeechClipIndex } from '../speech/application/speech-clip-index';
import { TTS_GATEWAY, TtsError, TtsGateway } from '../speech/application/tts-gateway';
import { CloudVoice } from '../speech/domain/cloud-voice';
import { planSpeech } from '../speech/domain/speech-plan';
import { SpeechModule } from '../speech/speech.module';
import { CHAPTER_TRANSLATIONS, InMemoryChapterTranslations } from '../translation/application/translation-stores';
import { BOOK_VOICE_STORE, InMemoryBookVoiceStore } from './application/book-voice-store';
import { BookVoiceService } from './application/book-voice.service';
import { BookVoiceController } from './presentation/book-voice.controller';

const hatDe: CloudVoice = { code: 'vieneu-clone', name: 'Hạt Dẻ', gender: 'female' };

class FakeTts implements TtsGateway {
  spoken: string[] = [];
  failing = false;
  gate: Promise<void> | null = null;

  async voices() {
    return [hatDe];
  }

  async speak(text: string, voiceCode: string) {
    await this.gate;
    if (this.failing || voiceCode !== hatDe.code) throw new TtsError('UPSTREAM_ERROR');
    this.spoken.push(text);
    return Buffer.from('RIFF');
  }
}

type Task = {
  id: string;
  state: string;
  code: string | null;
  done: number;
  total: number;
  percent: number;
  waiting: string[];
  voiced: string[];
};

describe('voicing a whole book', () => {
  let app: INestApplication;
  let storageDir: string;
  let tts: FakeTts;
  let accounts: InMemoryAccountStore;
  let store: InMemoryBookVoiceStore;
  let translations: InMemoryChapterTranslations;

  const start = async () => {
    const fakes = testAccounts();
    accounts = fakes.store;
    await accounts.upsert({ id: 'max-1', email: 'max@example.com' });
    await accounts.upsert({ id: 'free-1', email: 'free@example.com' });
    await accounts.setPlan('max-1', 'max');
    const storage = new LocalDiskStorageGateway(storageDir);
    const moduleRef = await Test.createTestingModule({
      imports: [
        fakes.module,
        BooksModule.register({ maxUploadBytes: 10 * 1024 * 1024, storage }),
        SpeechModule.register({ tts, storage, index: new InMemorySpeechClipIndex() }),
      ],
      controllers: [BookVoiceController],
      providers: [
        BookVoiceService,
        { provide: TTS_GATEWAY, useValue: tts },
        { provide: BOOK_VOICE_STORE, useValue: store },
        { provide: CHAPTER_TRANSLATIONS, useValue: translations },
        { provide: AccountSlots, useValue: new AccountSlots() },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  };

  beforeEach(async () => {
    tts = new FakeTts();
    storageDir = await mkdtemp(join(tmpdir(), 'book-voice-e2e-'));
    store = new InMemoryBookVoiceStore();
    translations = new InMemoryChapterTranslations();
    await start();
  });

  afterEach(async () => {
    await app.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());
  const as = (id: string) => ({ Authorization: `Bearer ${id}` });

  const importBook = async (language = 'vi', userId = 'max-1') => {
    const { body } = await http().post('/books').set(as(userId)).attach('file', await buildEpub({ language }), 'book.epub').expect(202);
    const { body: list } = await http().get(`/books/${body.bookId}/chapters`).set(as(userId)).expect(200);
    return { bookId: String(body.bookId), chapters: list.chapters.map(({ chapterId }: { chapterId: string }) => chapterId) };
  };

  const tasks = async (userId = 'max-1'): Promise<Task[]> =>
    (await http().get('/voices/tasks').set(as(userId)).expect(200)).body.tasks;

  const settled = async () => {
    for (let tries = 0; tries < 200; tries += 1) {
      const all = await tasks();
      if (all.every(({ state }) => state === 'done' || state === 'stopped')) return all;
      await new Promise((resolve) => setTimeout(resolve, 3));
    }
    throw new Error('tasks never settled');
  };

  const voice = (bookId: string, body: object = {}) =>
    http().post(`/books/${bookId}/voice`).set(as('max-1')).send({ voiceCode: hatDe.code, ...body });

  const sentencesOf = async (chapterId: string) => {
    const { body } = await http().get(`/chapters/${chapterId}`).set(as('max-1')).expect(200);
    return planSpeech(body.blocks);
  };

  const seconds = async () => (await accounts.usage('max-1', usageMonth(new Date()))).vbeeSeconds;

  it('reads every chapter from the one being read, the same sentences the app asks for', async () => {
    const { bookId, chapters } = await importBook();
    const { body } = await voice(bookId, { startChapterId: chapters[1] }).expect(201);
    expect(body).toMatchObject({ kind: 'bookVoice', voiceName: 'Hạt Dẻ', total: 3, waiting: [chapters[1], chapters[2], chapters[0]] });

    const [task] = await settled();
    expect(task).toMatchObject({ state: 'done', done: 3, total: 3, percent: 100, waiting: [] });
    expect(task.voiced).toEqual([chapters[1], chapters[2], chapters[0]]);

    const all = (await Promise.all(chapters.map(sentencesOf))).flat();
    expect([...new Set(tts.spoken)].sort()).toEqual([...new Set(all)].sort());
  });

  it('says how long the book will take before starting', async () => {
    const { bookId, chapters } = await importBook();
    const { body } = await http().get(`/books/${bookId}/voice`).set(as('max-1')).expect(200);
    expect(body).toMatchObject({ chapters: chapters.length, skipped: 0, task: null });
    expect(body.minutes).toBeGreaterThan(0);
  });

  it('is for Max readers', async () => {
    const { bookId } = await importBook('vi', 'free-1');
    await http().post(`/books/${bookId}/voice`).set(as('free-1')).send({ voiceCode: hatDe.code }).expect(403);
  });

  it('refuses a voice it does not know', async () => {
    const { bookId } = await importBook();
    await voice(bookId, { voiceCode: 'nobody' }).expect(400);
  });

  it('reads the translation of a foreign book, and skips chapters not translated', async () => {
    const { bookId, chapters } = await importBook('en');
    await voice(bookId).expect(409);

    const block = { blockId: 'b1', kind: 'paragraph' as const, text: 'Bản dịch chương một.' };
    await translations.save({ chapterId: chapters[0], bookId, blocks: [block] });

    const { body: standing } = await http().get(`/books/${bookId}/voice`).set(as('max-1')).expect(200);
    expect(standing).toMatchObject({ chapters: 1, skipped: 2 });

    const { body } = await voice(bookId).expect(201);
    expect(body.total).toBe(1);
    await settled();
    expect(tts.spoken).toEqual(['Bản dịch chương một.']);
  });

  it('returns the task under way instead of starting another', async () => {
    const { bookId } = await importBook();
    tts.gate = new Promise(() => undefined);
    const { body: first } = await voice(bookId).expect(201);
    const { body: again } = await voice(bookId).expect(201);
    expect(again.id).toBe(first.id);
  });

  it('stops when the minutes run out, and goes on after', async () => {
    const { bookId, chapters } = await importBook();
    const limit = 1_500 * 60;
    const spend = { accountId: 'max-1', month: usageMonth(new Date()), meter: 'vbeeSeconds' as const, amount: limit - 1 };
    await accounts.spend({ ...spend, limit });
    await voice(bookId).expect(201);

    const [stopped] = await settled();
    expect(stopped).toMatchObject({ state: 'stopped', code: 'VBEE_LIMIT' });

    await accounts.refund(spend);
    await http().post(`/voices/tasks/${stopped.id}/resume`).set(as('max-1')).expect(201);
    const [task] = await settled();
    expect(task).toMatchObject({ state: 'done', done: chapters.length });
  });

  it('does not read or charge sentences it already has', async () => {
    const { bookId } = await importBook();
    await voice(bookId).expect(201);
    await settled();
    const [spent, read] = [await seconds(), tts.spoken.length];
    expect(spent).toBeGreaterThan(0);

    await voice(bookId).expect(201);
    await settled();
    expect(await seconds()).toBe(spent);
    expect(tts.spoken.length).toBe(read);
  });

  it('stops cleanly, charging nothing, on resuming a task whose voice is no longer offered', async () => {
    const { bookId } = await importBook();
    await voice(bookId).expect(201);
    const [{ id }] = await settled();
    const [saved] = await store.ofAccount('max-1');
    await store.save({
      ...saved,
      voiceCode: 'hn_female_ngochuyen_full_48k-fhg',
      remaining: saved.voiced,
      voiced: [],
      state: { kind: 'stopped', code: 'SPEECH_FAILED' },
    });
    const before = await seconds();

    await http().post(`/voices/tasks/${id}/resume`).set(as('max-1')).expect(201);

    expect((await settled())[0]).toMatchObject({ state: 'stopped', code: 'SPEECH_FAILED' });
    expect(await seconds()).toBe(before);
  });

  it('stops on a voice failure, keeping what is done', async () => {
    const { bookId } = await importBook();
    tts.failing = true;
    await voice(bookId).expect(201);
    const [task] = await settled();
    expect(task).toMatchObject({ state: 'stopped', code: 'SPEECH_FAILED' });
  });

  it('forgets a cancelled task', async () => {
    const { bookId } = await importBook();
    tts.gate = new Promise(() => undefined);
    const { body } = await voice(bookId).expect(201);
    await http().delete(`/voices/tasks/${body.id}`).set(as('max-1')).expect(204);
    expect(await tasks()).toEqual([]);
  });

  it('picks unfinished tasks up again after a restart', async () => {
    const { bookId } = await importBook();
    let open: () => void = () => undefined;
    tts.gate = new Promise((resolve) => { open = resolve; });
    await voice(bookId).expect(201);
    await app.get(BookVoiceService).onApplicationBootstrap();
    open();
    tts.gate = null;
    const [task] = await settled();
    expect(task.state).toBe('done');
  });
});
