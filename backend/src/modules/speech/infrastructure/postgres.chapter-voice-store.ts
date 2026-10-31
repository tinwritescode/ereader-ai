import { Pool } from 'pg';
import { PostgresTaskTable } from '../../../shared/tasks/postgres.task-table';
import { ChapterVoiceStore } from '../application/chapter-voice-store';
import { ChapterVoiceTask } from '../domain/chapter-voice';

export class PostgresChapterVoiceStore extends PostgresTaskTable<ChapterVoiceTask> implements ChapterVoiceStore {
  constructor(pool: Pool) {
    super(pool, 'chapter_voice_tasks', ({ createdAt, finishedAt, ...task }) => ({
      ...task,
      createdAt: new Date(createdAt),
      finishedAt: finishedAt ? new Date(finishedAt) : null,
    }));
  }

  async setDone(id: string, done: number): Promise<void> {
    await this.created();
    await this.pool.query(`UPDATE chapter_voice_tasks SET task = jsonb_set(task, '{done}', $2::jsonb) WHERE id = $1`, [
      id,
      JSON.stringify(done),
    ]);
  }
}
