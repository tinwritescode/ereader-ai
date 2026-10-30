import { Account, Meter, MonthlyUsage, NO_USAGE, PlanName } from '../domain/plan';

export const ACCOUNT_STORE = Symbol('ACCOUNT_STORE');

export type Spend = { accountId: string; month: string; meter: Meter; amount: number; limit: number };

export type AccountWithUsage = Account & { usage: MonthlyUsage };

export interface AccountStore {
  /** Creates the account on first sight, and keeps its email current. */
  upsert(identity: { id: string; email: string }): Promise<Account>;
  find(id: string): Promise<Account | null>;
  /** Makes the account the super admin. False when another account already is. */
  promote(id: string): Promise<boolean>;
  list(month: string): Promise<AccountWithUsage[]>;
  setPlan(id: string, plan: PlanName): Promise<Account | null>;
  requestPlan(id: string, plan: PlanName): Promise<void>;
  usage(id: string, month: string): Promise<MonthlyUsage>;
  /** Adds to a meter unless that would pass [Spend.limit], as one atomic step. */
  spend(spend: Spend): Promise<boolean>;
  refund(spend: Omit<Spend, 'limit'>): Promise<void>;
}

export class InMemoryAccountStore implements AccountStore {
  readonly accounts = new Map<string, Account>();
  private readonly meters = new Map<string, number>();

  async upsert({ id, email }: { id: string; email: string }): Promise<Account> {
    const account: Account = {
      ...(this.accounts.get(id) ?? { id, role: 'user', plan: 'free', requestedPlan: null }),
      email,
    };
    this.accounts.set(id, account);
    return account;
  }

  async find(id: string): Promise<Account | null> {
    return this.accounts.get(id) ?? null;
  }

  async promote(id: string): Promise<boolean> {
    const taken = [...this.accounts.values()].some((account) => account.role === 'super_admin' && account.id !== id);
    const account = this.accounts.get(id);
    if (taken || !account) return false;
    this.accounts.set(id, { ...account, role: 'super_admin', plan: 'max' });
    return true;
  }

  async list(month: string): Promise<AccountWithUsage[]> {
    return Promise.all(
      [...this.accounts.values()].map(async (account) => ({ ...account, usage: await this.usage(account.id, month) })),
    );
  }

  async setPlan(id: string, plan: PlanName): Promise<Account | null> {
    const account = this.accounts.get(id);
    if (!account) return null;
    const updated = { ...account, plan, requestedPlan: null };
    this.accounts.set(id, updated);
    return updated;
  }

  async requestPlan(id: string, plan: PlanName): Promise<void> {
    const account = this.accounts.get(id);
    if (account) this.accounts.set(id, { ...account, requestedPlan: plan });
  }

  async usage(id: string, month: string): Promise<MonthlyUsage> {
    return {
      digests: this.meters.get(`${id}/${month}/digests`) ?? NO_USAGE.digests,
      vbeeSeconds: this.meters.get(`${id}/${month}/vbeeSeconds`) ?? NO_USAGE.vbeeSeconds,
    };
  }

  async spend({ accountId, month, meter, amount, limit }: Spend): Promise<boolean> {
    const key = `${accountId}/${month}/${meter}`;
    const used = this.meters.get(key) ?? 0;
    if (used + amount > limit) return false;
    this.meters.set(key, used + amount);
    return true;
  }

  async refund({ accountId, month, meter, amount }: Omit<Spend, 'limit'>): Promise<void> {
    const key = `${accountId}/${month}/${meter}`;
    this.meters.set(key, Math.max(0, (this.meters.get(key) ?? 0) - amount));
  }
}
