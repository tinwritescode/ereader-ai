/** What every kind of long task keeps, so one table shape can hold them all. */
export type StoredTask = {
  id: string;
  accountId: string;
  state: { kind: string };
  createdAt: Date;
  finishedAt: Date | null;
};

export interface TaskTable<T extends StoredTask> {
  /** Adds the task, or replaces the one with its id. */
  save(task: T): Promise<void>;
  remove(id: string): Promise<void>;
  /** Oldest first. */
  ofAccount(accountId: string): Promise<T[]>;
  /** Queued or running, across accounts: what a restart has to pick up. */
  unfinished(): Promise<T[]>;
}

const UNFINISHED = ['queued', 'running'];

/** For development and tests: forgotten on restart. */
export class InMemoryTaskTable<T extends StoredTask> implements TaskTable<T> {
  protected readonly tasks = new Map<string, T>();

  async save(task: T): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async remove(id: string): Promise<void> {
    this.tasks.delete(id);
  }

  async ofAccount(accountId: string): Promise<T[]> {
    return [...this.tasks.values()].filter((task) => task.accountId === accountId);
  }

  async unfinished(): Promise<T[]> {
    return [...this.tasks.values()].filter((task) => UNFINISHED.includes(task.state.kind));
  }
}
