import { ChapterVoiceTask, isFinished } from '../domain/chapter-voice';

export const CHAPTER_VOICE_STORE = Symbol('CHAPTER_VOICE_STORE');

export interface ChapterVoiceStore {
  /** Adds the task, or replaces the one with its id. */
  save(task: ChapterVoiceTask): Promise<void>;
  setDone(id: string, done: number): Promise<void>;
  remove(id: string): Promise<void>;
  /** Oldest first. */
  ofAccount(accountId: string): Promise<ChapterVoiceTask[]>;
  /** Queued or running, across accounts: what a restart has to pick up. */
  unfinished(): Promise<ChapterVoiceTask[]>;
}

/** For development and tests: forgotten on restart. */
export class InMemoryChapterVoiceStore implements ChapterVoiceStore {
  private readonly tasks = new Map<string, ChapterVoiceTask>();

  async save(task: ChapterVoiceTask): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async setDone(id: string, done: number): Promise<void> {
    const task = this.tasks.get(id);
    if (task) this.tasks.set(id, { ...task, done });
  }

  async remove(id: string): Promise<void> {
    this.tasks.delete(id);
  }

  async ofAccount(accountId: string): Promise<ChapterVoiceTask[]> {
    return [...this.tasks.values()].filter((task) => task.accountId === accountId);
  }

  async unfinished(): Promise<ChapterVoiceTask[]> {
    return [...this.tasks.values()].filter((task) => !isFinished(task));
  }
}
