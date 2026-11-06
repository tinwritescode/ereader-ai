import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { testAccounts } from '../accounts/testing/fake-identity';
import { HISTORY_STORE, InMemoryHistoryStore } from './application/history-store';
import { ReadingHistoryService } from './application/reading-history.service';
import { ReadingHistoryController } from './presentation/reading-history.controller';

const READ = {
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

const LISTEN = { ...READ, mode: 'listen', chapterId: 'ch-2', chapterLabel: 'Chương Hai', length: 'original', minutes: 12, voice: 'Hạt Dẻ' };

type Listed = { recording: boolean; sessions: Array<Record<string, unknown>> };

describe('reading and listening history', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [testAccounts().module],
      controllers: [ReadingHistoryController],
      providers: [ReadingHistoryService, { provide: HISTORY_STORE, useValue: new InMemoryHistoryStore() }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(() => app.close());

  const http = () => request(app.getHttpServer());
  const as = (id: string) => ({ Authorization: `Bearer ${id}` });
  const report = (id: string, body: object, who = 'reader') =>
    http().put(`/history/sessions/${id}`).set(as(who)).send(body);
  const list = async (query = '', who = 'reader'): Promise<Listed> =>
    (await http().get(`/history${query}`).set(as(who)).expect(200)).body;

  it('keeps a session with the words it stopped on', async () => {
    const id = randomUUID();
    await report(id, READ).expect(204);

    const { recording, sessions } = await list();

    expect(recording).toBe(true);
    expect(sessions).toEqual([
      expect.objectContaining({ sessionId: id, ...READ, startedAt: expect.any(String), endedAt: expect.any(String) }),
    ]);
  });

  it('moves one session on when it is reported again, and keeps it done once finished', async () => {
    const id = randomUUID();
    await report(id, READ).expect(204);
    await report(id, { ...READ, block: 9, quote: 'xong', progress: 1, done: true }).expect(204);
    await report(id, { ...READ, block: 2, progress: 0.1, done: false }).expect(204);

    const { sessions } = await list();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ block: 2, progress: 0.1, done: true });
    expect(Date.parse(String(sessions[0]?.endedAt))).toBeGreaterThanOrEqual(Date.parse(String(sessions[0]?.startedAt)));
  });

  it('lists the latest session first, and filters by mode and by book', async () => {
    const first = randomUUID();
    const second = randomUUID();
    await report(first, READ).expect(204);
    await report(second, LISTEN).expect(204);
    await report(randomUUID(), { ...READ, bookId: 'loeb' }).expect(204);
    await report(first, { ...READ, block: 5 }).expect(204);

    const all = await list();
    expect(all.sessions.map(({ sessionId }) => sessionId)[0]).toBe(first);
    expect(all.sessions).toHaveLength(3);

    const heard = await list('?mode=listen');
    expect(heard.sessions).toEqual([expect.objectContaining({ sessionId: second, voice: 'Hạt Dẻ' })]);

    const kieu = await list('?bookId=kieu');
    expect(kieu.sessions.map(({ bookId }) => bookId)).toEqual(['kieu', 'kieu']);
  });

  it("shows and removes only the account's own sessions", async () => {
    const mine = randomUUID();
    await report(mine, READ).expect(204);
    await report(mine, { ...READ, block: 99 }, 'stranger').expect(204);

    expect((await list('', 'stranger')).sessions).toEqual([]);
    await http().delete(`/history/sessions/${mine}`).set(as('stranger')).expect(204);
    expect((await list()).sessions).toEqual([expect.objectContaining({ sessionId: mine, block: 4 })]);

    await http().delete(`/history/sessions/${mine}`).set(as('reader')).expect(204);
    expect((await list()).sessions).toEqual([]);
  });

  it('clears the whole history', async () => {
    await report(randomUUID(), READ).expect(204);
    await report(randomUUID(), LISTEN).expect(204);
    await report(randomUUID(), READ, 'stranger').expect(204);

    await http().delete('/history').set(as('reader')).expect(204);

    expect((await list()).sessions).toEqual([]);
    expect((await list('', 'stranger')).sessions).toHaveLength(1);
  });

  it('records nothing while paused, and again once turned back on', async () => {
    await http().put('/history/recording').set(as('reader')).send({ on: false }).expect(204);
    await report(randomUUID(), READ).expect(204);

    expect(await list()).toEqual({ recording: false, sessions: [] });

    await http().put('/history/recording').set(as('reader')).send({ on: true }).expect(204);
    await report(randomUUID(), READ).expect(204);

    expect(await list()).toEqual({ recording: true, sessions: [expect.objectContaining({ mode: 'read' })] });
  });

  it('refuses a listen session without its voice, and a bad id or filter', async () => {
    const { voice: _voice, ...voiceless } = LISTEN;
    await report(randomUUID(), voiceless).expect(400, { code: 'HISTORY_REPORT_INVALID' });
    await report('not-a-uuid', READ).expect(400, { code: 'HISTORY_REPORT_INVALID' });
    await http().get('/history?mode=sing').set(as('reader')).expect(400, { code: 'HISTORY_FILTER_INVALID' });
    await http().put('/history/recording').set(as('reader')).send({ on: 'yes' }).expect(400, { code: 'HISTORY_RECORDING_INVALID' });
  });

  it('asks to sign in', async () => {
    await http().get('/history').expect(401);
    await http().put(`/history/sessions/${randomUUID()}`).send(READ).expect(401);
  });
});
