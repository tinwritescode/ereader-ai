import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CloudVoice } from './domain/cloud-voice';
import { TtsError, TtsGateway } from './application/tts-gateway';
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

describe('speech', () => {
  let app: INestApplication;
  let tts: FakeTts;

  const start = async (gateway: TtsGateway | null) => {
    const moduleRef = await Test.createTestingModule({ imports: [SpeechModule.register(gateway)] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  };

  beforeEach(async () => {
    tts = new FakeTts();
    await start(tts);
  });

  afterEach(() => app.close());

  it('lists the cloud voices', async () => {
    await request(app.getHttpServer())
      .get('/speech/voices')
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ voices: [ngocHuyen] }));
  });

  it('reads a sentence aloud as WAV', async () => {
    const response = await request(app.getHttpServer())
      .post('/speech')
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

  it('refuses a voice that is not offered', async () => {
    await request(app.getHttpServer())
      .post('/speech')
      .send({ text: 'Xin chào.', voiceCode: 'someone_else' })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('VOICE_UNKNOWN'));
    expect(tts.spoken).toEqual([]);
  });

  it('refuses empty or long text, which would spend credits on nothing or on a whole chapter', async () => {
    for (const text of ['   ', 'a'.repeat(301)]) {
      await request(app.getHttpServer())
        .post('/speech')
        .send({ text, voiceCode: ngocHuyen.code })
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('SPEECH_TEXT_INVALID'));
    }
  });

  it('reports a failed upstream call with a stable code', async () => {
    tts.failure = new TtsError('UPSTREAM_ERROR');
    await request(app.getHttpServer())
      .post('/speech')
      .send({ text: 'Xin chào.', voiceCode: ngocHuyen.code })
      .expect(502)
      .expect(({ body }) => expect(body.code).toBe('SPEECH_FAILED'));
  });

  it('offers no voices and refuses to speak when Vbee is not configured', async () => {
    await app.close();
    await start(null);
    await request(app.getHttpServer())
      .get('/speech/voices')
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ voices: [] }));
    await request(app.getHttpServer())
      .post('/speech')
      .send({ text: 'Xin chào.', voiceCode: ngocHuyen.code })
      .expect(503)
      .expect(({ body }) => expect(body.code).toBe('SPEECH_UNAVAILABLE'));
  });
});
