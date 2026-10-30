import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { LocalDiskStorageGateway } from '../../shared/storage/local-disk.storage-gateway';
import { BooksModule } from './books.module';
import { buildEpub, COVER_PNG } from './testing/epub-fixture';

const MAX_UPLOAD_BYTES = 64 * 1024;

describe('POST /books (EPUB import)', () => {
  let app: INestApplication;
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'books-e2e-'));
    const moduleRef = await Test.createTestingModule({
      imports: [BooksModule.register({ maxUploadBytes: MAX_UPLOAD_BYTES, storage: new LocalDiskStorageGateway(storageDir) })],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  const upload = (bytes: Buffer, fileName = 'book.epub', userId: string | null = 'user-1') => {
    const req = request(app.getHttpServer()).post('/books').attach('file', bytes, fileName);
    return userId === null ? req : req.field('userId', userId);
  };

  it('accepts an EPUB, reads its metadata, and stores the source', async () => {
    const epub = await buildEpub();

    const response = await upload(epub).expect(202);

    expect(response.body).toMatchObject({
      status: 'READY',
      chapterCount: 3,
      minutes: 9,
      title: 'Synthetic Book',
      author: 'Ada Writer',
      language: 'vi',
    });
    const stored = await readdir(join(storageDir, 'sources'));
    expect(stored).toHaveLength(1);
    await expect(readFile(join(storageDir, 'sources', stored[0]))).resolves.toEqual(epub);

    await request(app.getHttpServer())
      .get(`/books/${response.body.bookId}/status`)
      .query({ userId: 'user-1' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('READY'));
  });

  it.each(['epub3', 'epub2'] as const)('serves the cover of an %s book', async (cover) => {
    const created = await upload(await buildEpub({ cover })).expect(202);
    expect(created.body.hasCover).toBe(true);

    const response = await request(app.getHttpServer())
      .get(`/books/${created.body.bookId}/cover`)
      .query({ userId: 'user-1' })
      .expect(200);

    expect(response.headers['content-type']).toContain('image/png');
    expect(response.body).toEqual(COVER_PNG);
  });

  it('has no cover to serve for a book without one, or for another user', async () => {
    const plain = await upload(await buildEpub()).expect(202);
    expect(plain.body.hasCover).toBe(false);
    await request(app.getHttpServer())
      .get(`/books/${plain.body.bookId}/cover`)
      .query({ userId: 'user-1' })
      .expect(404);

    const covered = await upload(await buildEpub({ cover: 'epub3' })).expect(202);
    await request(app.getHttpServer())
      .get(`/books/${covered.body.bookId}/cover`)
      .query({ userId: 'user-2' })
      .expect(404);
  });

  it('returns the existing book when the same user uploads the same file again', async () => {
    const epub = await buildEpub();
    const first = await upload(epub).expect(202);

    const second = await upload(epub, 'renamed.epub').expect(200);

    expect(second.body.bookId).toBe(first.body.bookId);
  });

  it('creates a separate book for another user uploading the same file', async () => {
    const epub = await buildEpub();
    const first = await upload(epub).expect(202);

    const other = await upload(epub, 'book.epub', 'user-2').expect(202);

    expect(other.body.bookId).not.toBe(first.body.bookId);
  });

  it('rejects a file without the .epub extension', async () => {
    await upload(await buildEpub(), 'book.pdf')
      .expect(415)
      .expect({ code: 'UNSUPPORTED_TYPE' });
  });

  it('rejects a file that is not a zip', async () => {
    await upload(Buffer.from('plain text pretending'), 'book.epub')
      .expect(400)
      .expect({ code: 'EPUB_INVALID' });
  });

  it('rejects a zip whose mimetype is not application/epub+zip', async () => {
    await upload(await buildEpub({ mimetype: 'application/zip' }))
      .expect(400)
      .expect({ code: 'EPUB_INVALID' });
  });

  it('rejects a file over the upload limit', async () => {
    await upload(Buffer.alloc(MAX_UPLOAD_BYTES + 1), 'book.epub')
      .expect(413)
      .expect({ code: 'FILE_TOO_LARGE' });
  });

  it('rejects a request without a file', async () => {
    await request(app.getHttpServer())
      .post('/books')
      .field('userId', 'user-1')
      .expect(400)
      .expect({ code: 'FILE_REQUIRED' });
  });

  it('rejects a request without a userId', async () => {
    await upload(await buildEpub(), 'book.epub', null)
      .expect(400)
      .expect({ code: 'USER_ID_REQUIRED' });
  });

  const fixture = process.env.EPUB_FIXTURE;
  (fixture ? it : it.skip)('imports the real EPUB from EPUB_FIXTURE', async () => {
    if (!fixture) return;
    await app.close();
    const moduleRef = await Test.createTestingModule({
      imports: [BooksModule.register({ maxUploadBytes: 100 * 1024 * 1024, storage: new LocalDiskStorageGateway(storageDir) })],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const response = await upload(await readFile(fixture), 'real.epub').expect(202);

    expect(response.body.title).toEqual(expect.any(String));
    expect(response.body.title.length).toBeGreaterThan(0);
  });
});
