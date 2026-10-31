import { InMemoryTaskTable, TaskTable } from '../../../shared/tasks/task-table';
import { ChapterVoiceTask } from '../domain/chapter-voice';

export const CHAPTER_VOICE_STORE = Symbol('CHAPTER_VOICE_STORE');

export interface ChapterVoiceStore extends TaskTable<ChapterVoiceTask> {
  setDone(id: string, done: number): Promise<void>;
}

/** For development and tests: forgotten on restart. */
export class InMemoryChapterVoiceStore extends InMemoryTaskTable<ChapterVoiceTask> implements ChapterVoiceStore {
  async setDone(id: string, done: number): Promise<void> {
    const task = this.tasks.get(id);
    if (task) this.tasks.set(id, { ...task, done });
  }
}
