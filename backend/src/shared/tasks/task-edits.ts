import { StoredTask, TaskTable } from './task-table';

/** Every change to a task goes through here, one at a time per task, so no write is lost. */
export class TaskEdits<T extends StoredTask> {
  private readonly edits = new Map<string, Promise<unknown>>();

  constructor(private readonly store: TaskTable<T>) {}

  serially<R>(id: string, change: () => Promise<R>): Promise<R> {
    const next = (this.edits.get(id) ?? Promise.resolve()).then(change);
    const settled = next.catch(() => undefined);
    this.edits.set(id, settled);
    void settled.then(() => {
      if (this.edits.get(id) === settled) this.edits.delete(id);
    });
    return next;
  }

  /** Applies [change] to the stored task; null once the task is gone. */
  edit({ id, accountId }: Pick<T, 'id' | 'accountId'>, change: (task: T) => T): Promise<T | null> {
    return this.serially(id, async () => {
      const task = (await this.store.ofAccount(accountId)).find((candidate) => candidate.id === id);
      if (!task) return null;
      const changed = change(task);
      await this.store.save(changed);
      return changed;
    });
  }
}
