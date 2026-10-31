import { Pool } from 'pg';
import { ChapterVoiceStore } from '../application/chapter-voice-store';
import { ChapterVoiceState, ChapterVoiceTask } from '../domain/chapter-voice';

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS chapter_voice_tasks (
    id uuid PRIMARY KEY,
    account_id text NOT NULL,
    task jsonb NOT NULL,
    state text NOT NULL,
    created_at timestamptz NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chapter_voice_tasks_of_account ON chapter_voice_tasks (account_id, created_at)`;

type TaskRow = { task: Omit<ChapterVoiceTask, 'createdAt' | 'finishedAt'> & { createdAt: string; finishedAt: string | null } };

function toTask({ task }: TaskRow): ChapterVoiceTask {
  const state: ChapterVoiceState = task.state;
  return { ...task, state, createdAt: new Date(task.createdAt), finishedAt: task.finishedAt ? new Date(task.finishedAt) : null };
}

export class PostgresChapterVoiceStore implements ChapterVoiceStore {
  private ready: Promise<unknown> | null = null;

  constructor(private readonly pool: Pool) {}

  async save(task: ChapterVoiceTask): Promise<void> {
    await this.table();
    await this.pool.query(
      `INSERT INTO chapter_voice_tasks (id, account_id, task, state, created_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET task = EXCLUDED.task, state = EXCLUDED.state`,
      [task.id, task.accountId, JSON.stringify(task), task.state.kind, task.createdAt],
    );
  }

  async setDone(id: string, done: number): Promise<void> {
    await this.table();
    await this.pool.query(`UPDATE chapter_voice_tasks SET task = jsonb_set(task, '{done}', $2::jsonb) WHERE id = $1`, [
      id,
      JSON.stringify(done),
    ]);
  }

  async remove(id: string): Promise<void> {
    await this.table();
    await this.pool.query('DELETE FROM chapter_voice_tasks WHERE id = $1', [id]);
  }

  async ofAccount(accountId: string): Promise<ChapterVoiceTask[]> {
    await this.table();
    const { rows } = await this.pool.query<TaskRow>(
      'SELECT task FROM chapter_voice_tasks WHERE account_id = $1 ORDER BY created_at',
      [accountId],
    );
    return rows.map(toTask);
  }

  async unfinished(): Promise<ChapterVoiceTask[]> {
    await this.table();
    const { rows } = await this.pool.query<TaskRow>(
      `SELECT task FROM chapter_voice_tasks WHERE state IN ('queued', 'running') ORDER BY created_at`,
    );
    return rows.map(toTask);
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
