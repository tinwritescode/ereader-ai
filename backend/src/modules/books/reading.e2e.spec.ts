import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { DigestService } from '../ai-reading/application/digest.service';
import { DigestController } from '../ai-reading/presentation/digest.controller';
import { LLM_GATEWAY, LlmError } from '../../shared/llm/llm-gateway';
import { ScriptedLlmGateway } from '../../shared/llm/testing/scripted-llm.gateway';
import { BooksModule } from './books.module';
import { buildEpub } from './testing/epub-fixture';

describe('Reading an imported book', () => {
  let app: INestApplication;
  let storageDir: string;
  let llm: ScriptedLlmGateway;

  beforeEach(async () => {
    llm = new ScriptedLlmGateway(() => ({ paragraphs: ['Ý chính thứ nhất.', 'Ý chính thứ hai.'] }));
    storageDir = await mkdtemp(join(tmpdir(), 'reading-e2e-'));
    const moduleRef = await Test.createTestingModule({
      imports: [BooksModule.register({ maxUploadBytes: 100 * 1024 * 1024, storageDir })],
      controllers: [DigestController],
      providers: [DigestService, { provide: LLM_GATEWAY, useValue: llm }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());

  const importBook = async (bytes: Buffer, userId = 'user-1') => {
    const response = await http().post('/books').field('userId', userId).attach('file', bytes, 'book.epub').expect(202);
    return response.body.bookId as string;
  };

  const chaptersOf = async (bookId: string, userId = 'user-1') =>
    (await http().get(`/books/${bookId}/chapters`).query({ userId }).expect(200)).body.chapters;

  it('lists only the books of the asking user', async () => {
    const bookId = await importBook(await buildEpub());
    await importBook(await buildEpub({ title: 'Other' }), 'user-2');

    const response = await http().get('/books').query({ userId: 'user-1' }).expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({ bookId, title: 'Synthetic Book', status: 'READY', chapterCount: 3, minutes: 9 }),
    ]);
  });

  it('splits chapters by the table of contents, including a chapter that starts mid-file', async () => {
    const chapters = await chaptersOf(await importBook(await buildEpub()));

    expect(chapters).toEqual([
      expect.objectContaining({ index: 0, label: 'Chương Một', subtitle: 'TIÊU ĐỀ MỘT', minutes: 3 }),
      expect.objectContaining({ index: 1, label: 'Chương Hai', subtitle: null, minutes: 1 }),
      expect.objectContaining({ index: 2, label: 'Chương Ba', subtitle: null, minutes: 5 }),
    ]);
  });

  it('returns the body of one chapter as blocks, without its title headings', async () => {
    const [first, second] = await chaptersOf(await importBook(await buildEpub()));

    const one = (await http().get(`/chapters/${first.chapterId}`).query({ userId: 'user-1' }).expect(200)).body;
    const two = (await http().get(`/chapters/${second.chapterId}`).query({ userId: 'user-1' }).expect(200)).body;

    expect(one.blocks.map((block: { kind: string }) => block.kind)).toEqual(['paragraph', 'paragraph']);
    expect(one.blocks[1].text).toMatch(/một & hết$/);
    expect(two.blocks).toEqual([
      expect.objectContaining({ kind: 'paragraph', text: expect.stringMatching(/^hai hai/) }),
    ]);
  });

  it('hides a chapter from another user', async () => {
    const [first] = await chaptersOf(await importBook(await buildEpub()));

    await http().get(`/chapters/${first.chapterId}`).query({ userId: 'user-2' }).expect(404);
  });

  it('falls back to one chapter per spine file when the EPUB has no navigation document', async () => {
    const chapters = await chaptersOf(await importBook(await buildEpub({ withNav: false })));

    expect(chapters.map((chapter: { label: string }) => chapter.label)).toEqual(['Phần 1', 'Chương Một', 'Chương Ba']);
  });

  const digest = (chapterId: string) =>
    http().post(`/chapters/${chapterId}/digest`).query({ userId: 'user-1' }).send({ targetLang: 'vi', targetMinutes: 3 });

  it('shortens a chapter with the LLM, keeping the paragraph breaks it returns', async () => {
    const longest = (await chaptersOf(await importBook(await buildEpub())))[2];

    const response = await digest(longest.chapterId).expect(201);

    expect(response.body).toMatchObject({
      content: 'Ý chính thứ nhất.\n\nÝ chính thứ hai.',
      targetWords: 600,
      cached: false,
    });
    expect(llm.requests).toHaveLength(1);
    const [request] = llm.requests;
    expect(request.instructions).toContain('about 60% of the input, which has 1000 words. Never exceed 600 words');
    expect(request.instructions).toContain('"vi"');
    expect(request.input).toEqual({ paragraphs: [expect.stringMatching(/^ba ba/), expect.stringMatching(/^ba ba/)] });
  });

  it('answers a repeated request from the cache without calling the LLM again', async () => {
    const longest = (await chaptersOf(await importBook(await buildEpub())))[2];

    await digest(longest.chapterId).expect(201);
    const again = await digest(longest.chapterId).expect(201);

    expect(again.body.cached).toBe(true);
    expect(llm.requests).toHaveLength(1);
  });

  it('shares one LLM call between identical requests in flight', async () => {
    const longest = (await chaptersOf(await importBook(await buildEpub())))[2];

    const [first, second] = await Promise.all([digest(longest.chapterId), digest(longest.chapterId)]);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.body.content).toBe(first.body.content);
    expect(llm.requests).toHaveLength(1);
  });

  it('reports DIGEST_FAILED when the LLM fails, and tries again on the next request', async () => {
    const longest = (await chaptersOf(await importBook(await buildEpub())))[2];
    const answer = llm.answer;
    llm.answer = () => {
      throw new LlmError('INVALID_OUTPUT');
    };

    await digest(longest.chapterId).expect(502).expect({ code: 'DIGEST_FAILED' });

    llm.answer = answer;
    await digest(longest.chapterId).expect(201);
  });

  const fixture = process.env.EPUB_FIXTURE;
  (fixture ? it : it.skip)('reads the chapters of the real EPUB from EPUB_FIXTURE', async () => {
    if (!fixture) return;
    const chapters = await chaptersOf(await importBook(await readFile(fixture)));

    const labels = chapters.map((chapter: { label: string }) => chapter.label);
    expect(labels).toEqual(expect.arrayContaining(['Chương Một', 'Chương Hai', 'Chương Ba Mươi Ba']));
    const two = chapters.find((chapter: { label: string }) => chapter.label === 'Chương Hai');
    expect(two.subtitle).toBe('THÁI ĐỘ ĐẦU CƠ LÀ CỐT YẾU');
    expect(two.minutes).toBeGreaterThan(0);
  });
});
