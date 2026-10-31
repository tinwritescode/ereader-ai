import { Pool } from 'pg';
import { StoredTask, TaskTable } from './task-table';

/** The task as it comes back from jsonb, with its dates as strings. */
export type RawTask<T extends StoredTask> = Omit<T, 'createdAt' | 'finishedAt'> & { createdAt: string; finishedAt: string | null };

type TaskRow<T extends StoredTask> = { task: RawTask<T> };

/** Keeps each task whole as jsonb, beside the columns its queries need. */
export class PostgresTaskTable<T extends StoredTask> implements TaskTable<T> {
  private ready: Promise<unknown> | null = null;

  /** [table] is a name fixed in code, never input; [revive] turns the stored dates back into dates. */
  constructor(
    protected readonly pool: Pool,
    protected readonly table: string,
    private readonly revive: (raw: RawTask<T>) => T,
  ) {}

  async save(task: T): Promise<void> {
    await this.created();
    await this.pool.query(
      `INSERT INTO ${this.table} (id, account_id, task, state, created_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET task = EXCLUDED.task, state = EXCLUDED.state`,
      [task.id, task.accountId, JSON.stringify(task), task.state.kind, task.createdAt],
    );
  }

  async remove(id: string): Promise<void> {
    await this.created();
    await this.pool.query(`DELETE FROM ${this.table} WHERE id = $1`, [id]);
  }

  async ofAccount(accountId: string): Promise<T[]> {
    await this.created();
    const { rows } = await this.pool.query<TaskRow<T>>(
      `SELECT task FROM ${this.table} WHERE account_id = $1 ORDER BY created_at`,
      [accountId],
    );
    return rows.map(({ task }) => this.revive(task));
  }

  async unfinished(): Promise<T[]> {
    await this.created();
    const { rows } = await this.pool.query<TaskRow<T>>(
      `SELECT task FROM ${this.table} WHERE state IN ('queued', 'running') ORDER BY created_at`,
    );
    return rows.map(({ task }) => this.revive(task));
  }

  protected created(): Promise<unknown> {
    // A failed attempt is not kept, so the next call tries again.
    this.ready ??= this.pool
      .query(
        `CREATE TABLE IF NOT EXISTS ${this.table} (
           id uuid PRIMARY KEY,
           account_id text NOT NULL,
           task jsonb NOT NULL,
           state text NOT NULL,
           created_at timestamptz NOT NULL
         );
         CREATE INDEX IF NOT EXISTS ${this.table}_of_account ON ${this.table} (account_id, created_at)`,
      )
      .catch((error: unknown) => {
        this.ready = null;
        throw error;
      });
    return this.ready;
  }
}
