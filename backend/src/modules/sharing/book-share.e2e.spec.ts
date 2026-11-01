import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { LocalDiskStorageGateway } from '../../shared/storage/local-disk.storage-gateway';
import { testAccounts } from '../accounts/testing/fake-identity';
import { BooksModule } from '../books/books.module';
import { buildEpub } from '../books/testing/epub-fixture';
import { CHAPTER_TRANSLATIONS, InMemoryChapterTranslations } from '../translation/application/translation-stores';
import { BookShareService } from './application/book-share.service';
import { InMemoryShareStore, SHARE_STORE } from './application/share-store';
import { BookShareController } from './presentation/book-share.controller';

const PASSWORD = 'mat-khau-1';
const FIRST_MACHINE = 'a'.repeat(43);
const SECOND_MACHINE = 'b'.repeat(43);

describe('sharing a book through a link', () => {
  let app: INestApplication;
  let storageDir: string;
  let translations: InMemoryChapterTranslations;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'share-e2e-'));
    translations = new InMemoryChapterTranslations();
    const fakes = testAccounts();
    const moduleRef = await Test.createTestingModule({
      imports: [
        fakes.module,
        BooksModule.register({ maxUploadBytes: 10 * 1024 * 1024, storage: new LocalDiskStorageGateway(storageDir) }),
      ],
      controllers: [BookShareController],
      providers: [
        BookShareService,
        { provide: SHARE_STORE, useValue: new InMemoryShareStore() },
        { provide: CHAPTER_TRANSLATIONS, useValue: translations },
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
    expect(body).toMatchObject({ title: expect.any(String), chapters: expect.any(Array) });
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
