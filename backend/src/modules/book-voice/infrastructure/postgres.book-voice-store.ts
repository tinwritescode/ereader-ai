import { Pool } from 'pg';
import { PostgresTaskTable } from '../../../shared/tasks/postgres.task-table';
import { BookVoiceTask } from '../domain/book-voice';

export class PostgresBookVoiceStore extends PostgresTaskTable<BookVoiceTask> {
  constructor(pool: Pool) {
    super(pool, 'book_voice_tasks', ({ createdAt, finishedAt, ...task }) => ({
      ...task,
      createdAt: new Date(createdAt),
      finishedAt: finishedAt ? new Date(finishedAt) : null,
    }));
  }
}
