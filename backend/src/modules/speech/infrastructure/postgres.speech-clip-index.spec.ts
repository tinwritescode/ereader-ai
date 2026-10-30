import { Pool } from 'pg';
import { PostgresSpeechClipIndex } from './postgres.speech-clip-index';

// Runs against a real Postgres: TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/ereader_test.
const url = process.env.TEST_DATABASE_URL;

(url ? describe : describe.skip)('PostgresSpeechClipIndex', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    await pool.query('DROP TABLE IF EXISTS speech_clips');
  });

  afterAll(() => pool.end());

  it('finds a clip once it is added, and adding it again changes nothing', async () => {
    const index = new PostgresSpeechClipIndex(pool);
    const clip = { key: 'k1', voiceCode: 'voice-a', text: 'Xin chào.', objectKey: 'speech/voice-a/k1.wav', bytes: 10 };

    await expect(index.find('k1')).resolves.toBeNull();
    await index.add(clip);
    await index.add({ ...clip, objectKey: 'speech/other.wav' });

    await expect(index.find('k1')).resolves.toBe('speech/voice-a/k1.wav');
    const { rows } = await pool.query('SELECT voice_code, text, bytes FROM speech_clips');
    expect(rows).toEqual([{ voice_code: 'voice-a', text: 'Xin chào.', bytes: 10 }]);
  });
});
