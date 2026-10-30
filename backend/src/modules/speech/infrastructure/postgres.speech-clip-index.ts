import { Pool } from 'pg';
import { SpeechClip, SpeechClipIndex } from '../application/speech-clip-index';

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS speech_clips (
    key text PRIMARY KEY,
    voice_code text NOT NULL,
    text text NOT NULL,
    object_key text NOT NULL,
    bytes integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

export class PostgresSpeechClipIndex implements SpeechClipIndex {
  private ready: Promise<unknown> | null = null;

  constructor(private readonly pool: Pool) {}

  async find(key: string): Promise<string | null> {
    await this.table();
    const { rows } = await this.pool.query<{ object_key: string }>(
      'SELECT object_key FROM speech_clips WHERE key = $1',
      [key],
    );
    return rows[0]?.object_key ?? null;
  }

  async add(clip: SpeechClip): Promise<void> {
    await this.table();
    await this.pool.query(
      `INSERT INTO speech_clips (key, voice_code, text, object_key, bytes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO NOTHING`,
      [clip.key, clip.voiceCode, clip.text, clip.objectKey, clip.bytes],
    );
  }

  private table(): Promise<unknown> {
    // A failed attempt is not kept, so the next call tries again.
    this.ready ??= this.pool.query(CREATE_TABLE).catch((error: unknown) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }
}
