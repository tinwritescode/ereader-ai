import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InMemoryAccountStore } from '../accounts/application/account-store';
import { usageMonth } from '../accounts/domain/plan';
import { testAccounts } from '../accounts/testing/fake-identity';
import { StorageGateway } from '../../shared/storage/storage-gateway';
import { InMemoryChapterVoiceStore } from './application/chapter-voice-store';
import { InMemorySpeechClipIndex } from './application/speech-clip-index';
import { TtsError, TtsGateway } from './application/tts-gateway';
import { CloudVoice } from './domain/cloud-voice';
import { SpeechModule } from './speech.module';

const hatDe: CloudVoice = { code: 'vieneu-clone', name: 'Hạt Dẻ', gender: 'female' };

class FakeTts implements TtsGateway {
  spoken: string[] = [];
  failOn: string | null = null;
  /** While set, every sentence waits for it. */
  gate: Promise<void> | null = null;

  async voices() {
    return [hatDe];
  }

  async speak(text: string, voiceCode: string) {
    await this.gate;
    if (text === this.failOn || voiceCode !== hatDe.code) throw new TtsError('UPSTREAM_ERROR');
    this.spoken.push(text);
    return Buffer.from('RIFF');
  }
}

class FakeStorage implements StorageGateway {
  objects = new Map<string, Buffer>();

  async put({ key, bytes }: { key: string; bytes: Buffer }) {
    this.objects.set(key, bytes);
  }

  async get(key: string) {
    return this.objects.get(key) ?? null;
  }
}

const job = (chapterId: string, sentences = ['Câu một.', 'Câu hai.']) => ({
  bookId: 'book-1',
  chapterId,
  bookTitle: 'Cuộc chiến sinh tồn',
  chapterLabel: 'Chương Hai',
  minutes: null,
  voiceCode: hatDe.code,
  sentences,
});

type Task = { id: string; state: string; done: number; total: number; position: number | null; code: string | null };

describe('chapter voice tasks', () => {
  let app: INestApplication;
  let tts: FakeTts;
  let accounts: InMemoryAccountStore;
  let store: InMemoryChapterVoiceStore;

  const start = async () => {
    const fakes = testAccounts();
    accounts = fakes.store;
    await accounts.upsert({ id: 'max-1', email: 'max@example.com' });
    await accounts.upsert({ id: 'max-2', email: 'other@example.com' });
    await accounts.setPlan('max-1', 'max');
    await accounts.setPlan('max-2', 'max');
    const moduleRef = await Test.createTestingModule({
      imports: [
        fakes.module,
        SpeechModule.register({ tts, storage: new FakeStorage(), index: new InMemorySpeechClipIndex(), chapterVoices: store }),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  };

  const server = () => app.getHttpServer();
  const post = (body: object, as = 'max-1') =>
    request(server()).post('/speech/tasks').set('Authorization', `Bearer ${as}`).send(body);
  const tasks = async (as = 'max-1'): Promise<Task[]> =>
    (await request(server()).get('/speech/tasks').set('Authorization', `Bearer ${as}`).expect(200)).body.tasks;
  const settled = async (as = 'max-1') => {
    for (let tries = 0; tries < 200; tries += 1) {
      const list = await tasks(as);
      if (list.every(({ state }) => state === 'done' || state === 'stopped')) return list;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    throw new Error('tasks never settled');
  };

  beforeEach(async () => {
    tts = new FakeTts();
    store = new InMemoryChapterVoiceStore();
    await start();
  });

  afterEach(() => app.close());

  it('is for the Max plan', async () => {
    await post(job('c1'), 'free-1')
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('PLAN_REQUIRED'));
  });

  it('refuses a voice nobody offers', async () => {
    await post({ ...job('c1'), voiceCode: 'nobody' }).expect(400);
  });

  it('prepares every sentence, so listening later reads from storage', async () => {
    await post(job('c1')).expect(201);
    const [task] = await settled();
    expect(task).toMatchObject({ state: 'done', done: 2, total: 2, voiceName: 'Hạt Dẻ', chapterLabel: 'Chương Hai' });

    await request(server())
      .post('/speech')
      .set('Authorization', 'Bearer max-1')
      .send({ text: 'Câu một.', voiceCode: hatDe.code })
      .expect(200);
    expect(tts.spoken).toHaveLength(2);
  });

  it('runs two tasks of an account at a time and queues the rest', async () => {
    let open = () => {};
    tts.gate = new Promise((resolve) => (open = resolve));
    await post(job('c1')).expect(201);
    await post(job('c2')).expect(201);
    await post(job('c3')).expect(201);
    expect((await tasks()).map(({ state, position }) => [state, position])).toEqual([
      ['running', null],
      ['running', null],
      ['queued', 1],
    ]);
    open();
    expect((await settled()).map(({ state }) => state)).toEqual(['done', 'done', 'done']);
  });

  it('answers with the task already under way for the same chapter and voice', async () => {
    let open = () => {};
    tts.gate = new Promise((resolve) => (open = resolve));
    const first = await post(job('c1')).expect(201);
    const second = await post(job('c1')).expect(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await tasks()).toHaveLength(1);
    // The same chapter in other words, its translation, is other work.
    const translated = await post(job('c1', ['Sentence one.'])).expect(201);
    expect(translated.body.id).not.toBe(first.body.id);
    open();
    await settled();
  });

  it('stops at a cancel and charges only what was made', async () => {
    let open = () => {};
    tts.gate = new Promise((resolve) => (open = resolve));
    const sentences = Array.from({ length: 40 }, (_, index) => `Câu số ${index}.`);
    const { body } = await post(job('c1', sentences)).expect(201);
    await request(server()).delete(`/speech/tasks/${body.id}`).set('Authorization', 'Bearer max-1').expect(204);
    open();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await tasks()).toEqual([]);
    expect(tts.spoken.length).toBeLessThan(40);
    const { vbeeSeconds } = await accounts.usage('max-1', usageMonth(new Date()));
    expect(vbeeSeconds).toBeLessThan(40);
  });

  it('stops at a failure and goes on from there without reading a sentence twice', async () => {
    tts.failOn = 'Câu hai.';
    const { body } = await post(job('c1')).expect(201);
    expect((await settled())[0]).toMatchObject({ state: 'stopped', code: 'SPEECH_FAILED' });

    tts.failOn = null;
    await request(server()).post(`/speech/tasks/${body.id}/resume`).set('Authorization', 'Bearer max-1').expect(201);
    expect((await settled())[0]).toMatchObject({ state: 'done', done: 2, code: null });
    expect(tts.spoken.filter((text) => text === 'Câu một.')).toHaveLength(1);
  });

  it('stops cleanly, charging nothing, on resuming a task whose voice is no longer offered', async () => {
    await post(job('c1')).expect(201);
    await settled();
    const [saved] = await store.ofAccount('max-1');
    const stopped = { kind: 'stopped', code: 'SPEECH_FAILED' } as const;
    await store.save({ ...saved, voiceCode: 'hn_female_ngochuyen_full_48k-fhg', state: stopped });
    const { vbeeSeconds: before } = await accounts.usage('max-1', usageMonth(new Date()));

    await request(server()).post(`/speech/tasks/${saved.id}/resume`).set('Authorization', 'Bearer max-1').expect(201);

    expect((await settled())[0]).toMatchObject({ state: 'stopped', code: 'SPEECH_FAILED' });
    expect((await accounts.usage('max-1', usageMonth(new Date()))).vbeeSeconds).toBe(before);
  });

  it('stops when the minutes of the plan run out', async () => {
    const month = usageMonth(new Date());
    await accounts.spend({ accountId: 'max-1', month, meter: 'vbeeSeconds', amount: 90_000, limit: 90_000 });
    await post(job('c1')).expect(201);
    expect((await settled())[0]).toMatchObject({ state: 'stopped', code: 'VBEE_LIMIT' });
  });

  it('keeps tasks between accounts', async () => {
    const { body } = await post(job('c1')).expect(201);
    await settled();
    expect(await tasks('max-2')).toEqual([]);
    await request(server()).delete(`/speech/tasks/${body.id}`).set('Authorization', 'Bearer max-2').expect(404);
  });

  it('finishes after a restart what was running when the server stopped', async () => {
    let open = () => {};
    tts.gate = new Promise((resolve) => (open = resolve));
    await post(job('c1')).expect(201);
    open();
    await settled();
    const stored = await store.ofAccount('max-1');
    await store.save({ ...stored[0], state: { kind: 'running' }, done: 0 });

    await app.close();
    await start();
    expect((await settled())[0]).toMatchObject({ state: 'done', done: 2 });
  });
});
