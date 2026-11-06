import { HISTORY_PAGE, HistoryFilter, ReadingSession, SessionReport, matches, reportedAgain } from '../domain/reading-session';

export const HISTORY_STORE = Symbol('HISTORY_STORE');

export type SessionWrite = { id: string; accountId: string; report: SessionReport; at: Date };

export interface HistoryStore {
  /** Starts the session at [at], or moves it on when the account already has it; another account's id changes nothing. */
  record(write: SessionWrite): Promise<void>;
  /** The newest sessions first. */
  list(accountId: string, filter: HistoryFilter): Promise<ReadingSession[]>;
  remove(accountId: string, id: string): Promise<void>;
  clear(accountId: string): Promise<void>;
  isPaused(accountId: string): Promise<boolean>;
  setPaused(accountId: string, paused: boolean): Promise<void>;
}

export class InMemoryHistoryStore implements HistoryStore {
  private readonly sessions = new Map<string, ReadingSession>();
  private readonly paused = new Set<string>();

  async record({ id, accountId, report, at }: SessionWrite): Promise<void> {
    const session = this.sessions.get(id);
    if (session && session.accountId !== accountId) return;
    // Re-adding keeps the map in the order sessions were last heard from.
    this.sessions.delete(id);
    this.sessions.set(id, session ? reportedAgain({ session, report, at }) : { ...report, id, accountId, startedAt: at, endedAt: at });
  }

  async list(accountId: string, filter: HistoryFilter): Promise<ReadingSession[]> {
    return [...this.sessions.values()]
      .reverse()
      .filter((session) => session.accountId === accountId && matches(session, filter))
      .slice(0, HISTORY_PAGE);
  }

  async remove(accountId: string, id: string): Promise<void> {
    if (this.sessions.get(id)?.accountId === accountId) this.sessions.delete(id);
  }

  async clear(accountId: string): Promise<void> {
    for (const [id, session] of this.sessions) if (session.accountId === accountId) this.sessions.delete(id);
  }

  async isPaused(accountId: string): Promise<boolean> {
    return this.paused.has(accountId);
  }

  async setPaused(accountId: string, paused: boolean): Promise<void> {
    if (paused) this.paused.add(accountId);
    else this.paused.delete(accountId);
  }
}
