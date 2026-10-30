import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InMemoryAccountStore } from '../accounts/application/account-store';
import { usageMonth } from '../accounts/domain/plan';
import { testAccounts } from '../accounts/testing/fake-identity';
import { CloudVoice } from './domain/cloud-voice';
import { TtsError, TtsGateway } from './application/tts-gateway';
import { InMemorySpeechClipIndex } from './application/speech-clip-index';
import { StorageGateway } from '../../shared/storage/storage-gateway';
import { SpeechModule } from './speech.module';

const ngocHuyen: CloudVoice = { code: 'hn_female_ngochuyen_full_48k-fhg', name: 'HN - Ngọc Huyền', gender: 'female' };
const wav = Buffer.from('RIFF....WAVEfmt ');

class FakeTts implements TtsGateway {
  spoken: Array<{ text: string; voiceCode: string }> = [];
  failure: TtsError | null = null;

  async voices() {
    return [ngocHuyen];
  }

  async speak(text: string, voiceCode: string) {
    if (this.failure) throw this.failure;
    this.spoken.push({ text, voiceCode });
    return wav;
  }
}

class FakeStorage implements StorageGateway {
  objects = new Map<string, Buffer>();
  broken = false;

  async put({ key, bytes }: { key: string; bytes: Buffer }) {
    if (this.broken) throw new Error('storage down');
    this.objects.set(key, bytes);
  }

  async get(key: string) {
    if (this.broken) throw new Error('storage down');
    return this.objects.get(key) ?? null;
  }
}

describe('speech', () => {
  let app: INestApplication;
  let tts: FakeTts;
  let storage: FakeStorage;
  let accounts: InMemoryAccountStore;

  const start = async (gateway: TtsGateway | null) => {
    const fakes = testAccounts();
    accounts = fakes.store;
    const moduleRef = await Test.createTestingModule({
      imports: [fakes.module, SpeechModule.register({ tts: gateway, storage, index: new InMemorySpeechClipIndex() })],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  };

  beforeEach(async () => {
    tts = new FakeTts();
    storage = new FakeStorage();
    await start(tts);
  });

  afterEach(() => app.close());

  it('turns away a request without an access token', async () => {
    await request(app.getHttpServer())
      .post('/speech')
      .send({ text: 'Xin chào.', voiceCode: ngocHuyen.code })
      .expect(401);
  });

  it('stops at the Vbee minutes of the plan, and counts neither failures nor kept sentences', async () => {
    const say = (text: string) =>
      request(app.getHttpServer())
        .post('/speech')
        .set('Authorization', 'Bearer user-1')
        .send({ text, voiceCode: ngocHuyen.code });
    const month = usageMonth(new Date());
    await say('Xin chào.').expect(200);
    await say('Xin chào.').expect(200);
    expect((await accounts.usage('user-1', month)).vbeeSeconds).toBe(1);

    tts.failure = new TtsError('UPSTREAM_ERROR');
    await say('Câu này lỗi.').expect(502);
    expect((await accounts.usage('user-1', month)).vbeeSeconds).toBe(1);
    tts.failure = null;

    await accounts.spend({ accountId: 'user-1', month, meter: 'vbeeSeconds', amount: 1_799, limit: 1_800 });
    await say('Câu mới.')
      .expect(429)
      .expect(({ body }) => expect(body.code).toBe('VBEE_LIMIT'));
  });

  it('lists the cloud voices', async () => {
    await request(app.getHttpServer())
      .get('/speech/voices')
      .set('Authorization', 'Bearer user-1')
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ voices: [ngocHuyen] }));
  });

  it('reads a sentence aloud as WAV', async () => {
    const response = await request(app.getHttpServer())
      .post('/speech')
      .set('Authorization', 'Bearer user-1')
      .send({ text: '  Xin chào bạn.  ', voiceCode: ngocHuyen.code })
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200)
      .expect('content-type', 'audio/wav');

    expect(response.body).toEqual(wav);
    expect(tts.spoken).toEqual([{ text: 'Xin chào bạn.', voiceCode: ngocHuyen.code }]);
  });

  const speak = (text: string) =>
    request(app.getHttpServer())
      .post('/speech')
      .set('Authorization', 'Bearer user-1')
      .send({ text, voiceCode: ngocHuyen.code })
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  it('keeps each sentence it reads, and reads it again from storage without asking Vbee', async () => {
    await speak('Xin chào bạn.').expect(200);
    expect(storage.objects.size).toBe(1);

    const again = await speak(' Xin chào bạn. ').expect(200);

    expect(again.body).toEqual(wav);
    expect(tts.spoken).toHaveLength(1);
  });

  it('still reads aloud when storage is down', async () => {
    storage.broken = true;

    const response = await speak('Xin chào bạn.').expect(200);

    expect(response.body).toEqual(wav);
    expect(tts.spoken).toHaveLength(1);
  });

  it('refuses a voice that is not offered', async () => {
    await request(app.getHttpServer())
      .post('/speech')
      .set('Authorization', 'Bearer user-1')
      .send({ text: 'Xin chào.', voiceCode: 'someone_else' })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('VOICE_UNKNOWN'));
    expect(tts.spoken).toEqual([]);
  });

  it('refuses empty or long text, which would spend credits on nothing or on a whole chapter', async () => {
    for (const text of ['   ', 'a'.repeat(301)]) {
      await request(app.getHttpServer())
        .post('/speech')
      .set('Authorization', 'Bearer user-1')
        .send({ text, voiceCode: ngocHuyen.code })
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('SPEECH_TEXT_INVALID'));
    }
  });

  it('reports a failed upstream call with a stable code', async () => {
    tts.failure = new TtsError('UPSTREAM_ERROR');
    await request(app.getHttpServer())
      .post('/speech')
      .set('Authorization', 'Bearer user-1')
      .send({ text: 'Xin chào.', voiceCode: ngocHuyen.code })
      .expect(502)
      .expect(({ body }) => expect(body.code).toBe('SPEECH_FAILED'));
  });

  it('offers no voices and refuses to speak when Vbee is not configured', async () => {
    await app.close();
    await start(null);
    await request(app.getHttpServer())
      .get('/speech/voices')
      .set('Authorization', 'Bearer user-1')
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ voices: [] }));
    await request(app.getHttpServer())
      .post('/speech')
      .set('Authorization', 'Bearer user-1')
      .send({ text: 'Xin chào.', voiceCode: ngocHuyen.code })
      .expect(503)
      .expect(({ body }) => expect(body.code).toBe('SPEECH_UNAVAILABLE'));
  });
});
