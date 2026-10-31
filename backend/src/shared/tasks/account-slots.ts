export type SlotJob = {
  id: string;
  accountId: string;
  /** Older jobs go first, whatever order they were handed in. */
  queuedAt: Date;
  /** Settles when the job no longer needs its slot. */
  run: () => Promise<void>;
};

/**
 * Long tasks of every kind share these: an account runs a few at once and the rest wait.
 * Keeps one account from filling the GPU and the LLM quota, and the bill with them.
 */
export class AccountSlots {
  private waiting: SlotJob[] = [];
  /** Job id to account id. */
  private readonly running = new Map<string, string>();

  constructor(private readonly perAccount = 2) {}

  enqueue(job: SlotJob): void {
    if (this.running.has(job.id) || this.waiting.some(({ id }) => id === job.id)) return;
    const after = this.waiting.findIndex(({ queuedAt }) => queuedAt.getTime() > job.queuedAt.getTime());
    this.waiting.splice(after === -1 ? this.waiting.length : after, 0, job);
    this.fill(job.accountId);
  }

  /** Takes a job out of line; a running one stops through its own means. */
  withdraw(id: string): void {
    this.waiting = this.waiting.filter((job) => job.id !== id);
  }

  /** Place in the account's line, from 1; null when running or unknown. */
  position(id: string): number | null {
    const job = this.waiting.find((candidate) => candidate.id === id);
    if (!job) return null;
    return this.waiting.filter(({ accountId }) => accountId === job.accountId).indexOf(job) + 1;
  }

  private fill(accountId: string): void {
    while (this.runningFor(accountId) < this.perAccount) {
      const job = this.waiting.find((candidate) => candidate.accountId === accountId);
      if (!job) return;
      this.withdraw(job.id);
      this.running.set(job.id, accountId);
      void job
        .run()
        .catch(() => undefined)
        .finally(() => {
          this.running.delete(job.id);
          this.fill(accountId);
        });
    }
  }

  private runningFor(accountId: string): number {
    return [...this.running.values()].filter((id) => id === accountId).length;
  }
}
