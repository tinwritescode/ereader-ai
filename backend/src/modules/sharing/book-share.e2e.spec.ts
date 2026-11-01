import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { LocalDiskStorageGateway } from '../../shared/storage/local-disk.storage-gateway';
import { usageMonth } from '../accounts/domain/plan';
import { testAccounts } from '../accounts/testing/fake-identity';
import { BooksModule } from '../books/books.module';
import { Block } from '../books/domain/book';
import { buildEpub } from '../books/testing/epub-fixture';
import { InMemorySpeechClipIndex } from '../speech/application/speech-clip-index';
import { TTS_GATEWAY, TtsGateway } from '../speech/application/tts-gateway';
import { CloudVoice } from '../speech/domain/cloud-voice';
import { planSpeech } from '../speech/domain/speech-plan';
import { SpeechModule } from '../speech/speech.module';
import { CHAPTER_TRANSLATIONS, InMemoryChapterTranslations } from '../translation/application/translation-stores';
import { BookShareService } from './application/book-share.service';
import { InMemoryShareStore, SHARE_STORE } from './application/share-store';
import { BookShareController } from './presentation/book-share.controller';

const PASSWORD = 'mat-khau-1';
const FIRST_MACHINE = 'a'.repeat(43);
const SECOND_MACHINE = 'b'.repeat(43);
const HAT_DE: CloudVoice = { code: 'hat-de', name: 'Hạt Dẻ', gender: 'female' };
const NAM_AN: CloudVoice = { code: 'nam-an', name: 'Nam An', gender: 'male' };
const WAV = Buffer.from('RIFF....WAVEfmt ');

class FakeTts implements TtsGateway {
  spoken: string[] = [];

  async voices() {
    return [HAT_DE, NAM_AN];
  }

  async speak(text: string) {
    this.spoken.push(text);
    return WAV;
  }
}

describe('sharing a book through a link', () => {
  let app: INestApplication;
  let storageDir: string;
  let translations: InMemoryChapterTranslations;
  let tts: FakeTts;
  let fakes: ReturnType<typeof testAccounts>;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'share-e2e-'));
    translations = new InMemoryChapterTranslations();
    tts = new FakeTts();
    fakes = testAccounts();
    const storage = new LocalDiskStorageGateway(storageDir);
    const moduleRef = await Test.createTestingModule({
      imports: [
        fakes.module,
        BooksModule.register({ maxUploadBytes: 10 * 1024 * 1024, storage }),
        SpeechModule.register({ tts, storage, index: new InMemorySpeechClipIndex() }),
      ],
      controllers: [BookShareController],
      providers: [
        BookShareService,
        { provide: SHARE_STORE, useValue: new InMemoryShareStore() },
        { provide: CHAPTER_TRANSLATIONS, useValue: translations },
        { provide: TTS_GATEWAY, useValue: tts },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());
  const as = (id: string) => ({ Authorization: `Bearer ${id}` });
  const on = (device: string) => ({ 'x-share-device': device });

  const importBook = async (language = 'en') => {
    const { body } = await http().post('/books').set(as('owner')).attach('file', await buildEpub({ language }), 'book.epub');
    const { body: list } = await http().get(`/books/${body.bookId}/chapters`).set(as('owner')).expect(200);
    return { bookId: String(body.bookId), chapters: list.chapters.map(({ chapterId }: { chapterId: string }) => chapterId) as string[] };
  };

  const share = async (bookId: string) => {
    const { body } = await http().post(`/books/${bookId}/shares`).set(as('owner')).send({ password: PASSWORD }).expect(201);
    return { shareId: String(body.shareId), token: String(body.token) };
  };

  const open = (token: string, device: string, password = PASSWORD) =>
    http().post(`/shared/${token}/open`).send({ password, device });

  it('lets the first machine in with the password, and back in later without it', async () => {
    const { bookId, chapters } = await importBook();
    const { token } = await share(bookId);

    await open(token, FIRST_MACHINE).expect(204);

    const { body } = await http().get(`/shared/${token}`).set(on(FIRST_MACHINE)).expect(200);
    expect(body).toMatchObject({ bookId, title: expect.any(String), hasCover: expect.any(Boolean), chapterCount: chapters.length });
    expect(body.chapters.map(({ chapterId }: { chapterId: string }) => chapterId)).toEqual(chapters);
    await open(token, FIRST_MACHINE, 'forgotten').expect(204);
  });

  it('keeps every other machine out, even with the right password', async () => {
    const { bookId, chapters } = await importBook();
    const { token } = await share(bookId);
    await open(token, FIRST_MACHINE).expect(204);

    const refused = await open(token, SECOND_MACHINE).expect(403);
    expect(refused.body.code).toBe('SHARE_TAKEN');
    await http().get(`/shared/${token}`).set(on(SECOND_MACHINE)).expect(403);
    await http().get(`/shared/${token}/chapters/${chapters[0]}`).set(on(SECOND_MACHINE)).expect(403);
    await http().get(`/shared/${token}`).expect(403);
  });

  it('gives the link to one machine when two open it together', async () => {
    const { bookId } = await importBook();
    const { token } = await share(bookId);

    const answers = await Promise.all([open(token, FIRST_MACHINE), open(token, SECOND_MACHINE)]);

    expect(answers.map(({ status }) => status).sort()).toEqual([204, 403]);
  });

  it('shows nothing before the password, and a wrong password spends no claim', async () => {
    const { bookId, chapters } = await importBook();
    const { token } = await share(bookId);

    const locked = await http().get(`/shared/${token}`).set(on(FIRST_MACHINE)).expect(401);
    expect(locked.body.code).toBe('SHARE_LOCKED');
    await http().get(`/shared/${token}/chapters/${chapters[0]}`).set(on(FIRST_MACHINE)).expect(401);

    const wrong = await open(token, SECOND_MACHINE, 'not-it-at-all').expect(401);
    expect(wrong.body.code).toBe('SHARE_PASSWORD_WRONG');
    await open(token, FIRST_MACHINE).expect(204);
  });

  it('closes the link after ten tries, so a password cannot be guessed', async () => {
    const { bookId } = await importBook();
    const { token } = await share(bookId);

    for (let tries = 0; tries < 10; tries += 1) await open(token, FIRST_MACHINE, 'not-it-at-all').expect(401);

    const gone = await open(token, FIRST_MACHINE).expect(404);
    expect(gone.body.code).toBe('SHARE_GONE');
  });

  it('still works for the machine whose tenth try was right', async () => {
    const { bookId } = await importBook();
    const { token } = await share(bookId);

    for (let tries = 0; tries < 9; tries += 1) await open(token, FIRST_MACHINE, 'not-it-at-all').expect(401);
    await open(token, FIRST_MACHINE).expect(204);

    await http().get(`/shared/${token}`).set(on(FIRST_MACHINE)).expect(200);
  });

  it('knows no made-up link', async () => {
    const { body } = await open('made-up', FIRST_MACHINE).expect(404);
    expect(body.code).toBe('SHARE_GONE');
    await http().get('/shared/made-up').set(on(FIRST_MACHINE)).expect(404);
  });

  it('reads a chapter with its Vietnamese once there is one', async () => {
    const { bookId, chapters } = await importBook();
    const { token } = await share(bookId);
    await open(token, FIRST_MACHINE).expect(204);
    const read = (chapterId: string) => http().get(`/shared/${token}/chapters/${chapterId}`).set(on(FIRST_MACHINE)).expect(200);

    const before = await read(chapters[0]);
    expect(before.body.original.length).toBeGreaterThan(0);
    expect(before.body.vietnamese).toBeNull();

    const [block] = before.body.original;
    await translations.save({ chapterId: chapters[0], bookId, blocks: [{ ...block, text: 'Bản tiếng Việt' }] });

    const after = await read(chapters[0]);
    expect(after.body.vietnamese).toEqual([expect.objectContaining({ text: 'Bản tiếng Việt' })]);
  });

  it('opens only the shared book, not the owner\'s other books', async () => {
    const shared = await importBook();
    const other = await importBook('vi');
    const { token } = await share(shared.bookId);
    await open(token, FIRST_MACHINE).expect(204);

    await http().get(`/shared/${token}/chapters/${other.chapters[0]}`).set(on(FIRST_MACHINE)).expect(404);
  });

  it('gives a viewer no way to change the book', async () => {
    const { bookId, chapters } = await importBook();
    const { token } = await share(bookId);
    await open(token, FIRST_MACHINE).expect(204);
    const chapter = `/shared/${token}/chapters/${chapters[0]}`;
    const before = await http().get(chapter).set(on(FIRST_MACHINE)).expect(200);
    const edit = { blocks: [{ kind: 'paragraph', text: 'changed' }] };

    await http().post(chapter).set(on(FIRST_MACHINE)).send(edit).expect(404);
    await http().put(chapter).set(on(FIRST_MACHINE)).send(edit).expect(404);
    await http().patch(chapter).set(on(FIRST_MACHINE)).send(edit).expect(404);
    await http().delete(chapter).set(on(FIRST_MACHINE)).expect(404);
    await http().delete(`/shared/${token}`).set(on(FIRST_MACHINE)).expect(404);
    await http().get(`/books/${bookId}/chapters`).set(on(FIRST_MACHINE)).expect(401);

    const after = await http().get(chapter).set(on(FIRST_MACHINE)).expect(200);
    expect(after.body).toEqual(before.body);
  });

  describe('hearing a chapter', () => {
    const inHand = async () => {
      const { bookId, chapters } = await importBook();
      const { token } = await share(bookId);
      await open(token, FIRST_MACHINE).expect(204);
      const [chapterId] = chapters;
      const page = `/shared/${token}/chapters/${chapterId}`;
      const { body } = await http().get(page).set(on(FIRST_MACHINE)).expect(200);
      return { bookId, chapterId, page, blocks: body.original as Block[], sentences: planSpeech(body.original) };
    };
    const voice = async (sentences: string[], voiceCode = HAT_DE.code) => {
      for (const text of sentences) await http().post('/speech').set(as('owner')).send({ text, voiceCode }).expect(200);
      const spoken = tts.spoken.length;
      return () => expect(tts.spoken).toHaveLength(spoken);
    };
    const voices = async (page: string) => (await http().get(`${page}/voices`).set(on(FIRST_MACHINE)).expect(200)).body;
    const hear = (page: string, text: string, voiceCode = HAT_DE.code, device = FIRST_MACHINE) =>
      http().post(`${page}/speech`).set(on(device)).send({ text, voiceCode });

    it('offers no voice until the owner has heard the whole of a version', async () => {
      const { page, sentences } = await inHand();
      expect(await voices(page)).toEqual({ original: [], vietnamese: [] });

      await voice(sentences.slice(0, -1));
      expect(await voices(page)).toEqual({ original: [], vietnamese: [] });

      await voice(sentences.slice(-1));
      expect(await voices(page)).toEqual({ original: [HAT_DE], vietnamese: [] });
    });

    it('offers each version the voices it has', async () => {
      const { bookId, chapterId, page, blocks, sentences } = await inHand();
      const translated = blocks.map((block, index) => ({ ...block, text: `Câu dịch số ${index}.` }));
      await translations.save({ chapterId, bookId, blocks: translated });
      await voice(sentences, NAM_AN.code);
      await voice(planSpeech(translated));

      expect(await voices(page)).toEqual({ original: [NAM_AN], vietnamese: [HAT_DE] });
    });

    it('plays what is stored, at no cost to the owner', async () => {
      const { page, sentences } = await inHand();
      const nothingNewSpoken = await voice(sentences);
      const usage = () => fakes.store.usage('owner', usageMonth(new Date()));
      const spent = await usage();

      const { body, headers } = await hear(page, sentences[0]).expect(200);

      expect(headers['content-type']).toContain('audio/wav');
      expect(body).toEqual(WAV);
      nothingNewSpoken();
      expect(await usage()).toEqual(spent);
    });

    it('never reads a sentence aloud for a viewer', async () => {
      const { page, sentences } = await inHand();

      const { body } = await hear(page, sentences[0]).expect(404);

      expect(body.code).toBe('SPEECH_NOT_READY');
      expect(tts.spoken).toEqual([]);
    });

    it('never hears a voice the sentence was not read in', async () => {
      const { page, sentences } = await inHand();
      await voice(sentences, NAM_AN.code);

      await hear(page, sentences[0], HAT_DE.code).expect(404);
    });

    it('plays only the sentences of the chapter in the link', async () => {
      const { page } = await inHand();
      const elsewhere = 'A sentence from another book entirely.';
      await voice([elsewhere]);

      const { body } = await hear(page, elsewhere).expect(404);

      expect(body.code).toBe('SPEECH_NOT_READY');
    });

    it('keeps other machines from the voice too', async () => {
      const { page, sentences } = await inHand();
      await voice(sentences);

      await hear(page, sentences[0], HAT_DE.code, SECOND_MACHINE).expect(403);
      await http().get(`${page}/voices`).set(on(SECOND_MACHINE)).expect(403);
      await http().get(`${page}/voices`).expect(403);
    });

    it('turns away a request it cannot read', async () => {
      const { page } = await inHand();

      const { body } = await http().post(`${page}/speech`).set(on(FIRST_MACHINE)).send({ text: '' }).expect(400);

      expect(body.code).toBe('SHARE_REQUEST_INVALID');
    });
  });

  it('tells the owner which links are taken, and never shows a secret again', async () => {
    const { bookId } = await importBook();
    const taken = await share(bookId);
    const waiting = await share(bookId);
    await open(taken.token, FIRST_MACHINE).expect(204);

    const { body } = await http().get(`/books/${bookId}/shares`).set(as('owner')).expect(200);

    expect(body.shares).toEqual(
      expect.arrayContaining([
        { shareId: taken.shareId, createdAt: expect.any(String), opened: true },
        { shareId: waiting.shareId, createdAt: expect.any(String), opened: false },
      ]),
    );
  });

  it('lets the owner take a link back, whoever holds it', async () => {
    const { bookId } = await importBook();
    const { shareId, token } = await share(bookId);
    await open(token, FIRST_MACHINE).expect(204);

    await http().delete(`/shares/${shareId}`).set(as('owner')).expect(204);

    const gone = await http().get(`/shared/${token}`).set(on(FIRST_MACHINE)).expect(404);
    expect(gone.body.code).toBe('SHARE_GONE');
    expect((await http().get(`/books/${bookId}/shares`).set(as('owner')).expect(200)).body.shares).toEqual([]);
  });

  it('keeps the links to the owner of the book', async () => {
    const { bookId } = await importBook();
    const { shareId, token } = await share(bookId);

    await http().post(`/books/${bookId}/shares`).set(as('stranger')).send({ password: PASSWORD }).expect(404);
    await http().get(`/books/${bookId}/shares`).set(as('stranger')).expect(404);
    await http().delete(`/shares/${shareId}`).set(as('stranger')).expect(404);
    await http().post(`/books/${bookId}/shares`).send({ password: PASSWORD }).expect(401);
    await open(token, FIRST_MACHINE).expect(204);
  });

  it('turns away a password too short to protect anything, or a machine with no key', async () => {
    const { bookId } = await importBook();
    await http().post(`/books/${bookId}/shares`).set(as('owner')).send({ password: '123' }).expect(400);
    const { token } = await share(bookId);
    await open(token, 'short').expect(400);
  });
});
