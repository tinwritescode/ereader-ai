import { Inject, Injectable } from '@nestjs/common';
import { Account } from '../../accounts/domain/plan';
import { HistoryFilter, ReadingSession, SessionReport } from '../domain/reading-session';
import { HISTORY_STORE, HistoryStore } from './history-store';

/** Every sitting with a chapter, kept on the account so any signed-in machine sees it. */
@Injectable()
export class ReadingHistoryService {
  constructor(@Inject(HISTORY_STORE) private readonly store: HistoryStore) {}

  /** While the account has paused its history, reports are dropped, not kept for later. */
  async record({ account, id, report }: { account: Account; id: string; report: SessionReport }): Promise<void> {
    if (await this.store.isPaused(account.id)) return;
    await this.store.record({ id, accountId: account.id, report, at: new Date() });
  }

  async list(account: Account, filter: HistoryFilter): Promise<{ recording: boolean; sessions: ReadingSession[] }> {
    const [paused, sessions] = await Promise.all([this.store.isPaused(account.id), this.store.list(account.id, filter)]);
    return { recording: !paused, sessions };
  }

  remove(account: Account, id: string): Promise<void> {
    return this.store.remove(account.id, id);
  }

  clear(account: Account): Promise<void> {
    return this.store.clear(account.id);
  }

  setRecording(account: Account, on: boolean): Promise<void> {
    return this.store.setPaused(account.id, !on);
  }
}
