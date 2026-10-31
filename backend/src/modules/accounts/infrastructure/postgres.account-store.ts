import { Pool } from 'pg';
import { AccountStore, AccountWithUsage, Spend } from '../application/account-store';
import { Account, Meter, MonthlyUsage, PLAN_NAMES, PlanName, Role } from '../domain/plan';

const UNIQUE_VIOLATION = '23505';

// The partial index is what makes "only one super admin" true under concurrent sign-ins.
const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS accounts (
    id text PRIMARY KEY,
    email text NOT NULL,
    role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'super_admin')),
    plan text NOT NULL DEFAULT 'free' CHECK (plan IN (${PLAN_NAMES.map((plan) => `'${plan}'`).join(', ')})),
    requested_plan text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS one_super_admin ON accounts ((true)) WHERE role = 'super_admin';
  CREATE TABLE IF NOT EXISTS account_usage (
    account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    month text NOT NULL,
    meter text NOT NULL,
    used integer NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, month, meter)
  )`;

type AccountRow = { id: string; email: string; role: Role; plan: PlanName; requested_plan: PlanName | null };

const COLUMNS = 'id, email, role, plan, requested_plan';

function toAccount({ id, email, role, plan, requested_plan }: AccountRow): Account {
  return { id, email, role, plan, requestedPlan: requested_plan };
}

function toUsage(rows: { meter: Meter; used: number }[]): MonthlyUsage {
  const used = (meter: Meter) => rows.find((row) => row.meter === meter)?.used ?? 0;
  return { digests: used('digests'), vbeeSeconds: used('vbeeSeconds'), bookTranslations: used('bookTranslations') };
}

export class PostgresAccountStore implements AccountStore {
  private ready: Promise<unknown> | null = null;

  constructor(private readonly pool: Pool) {}

  async upsert({ id, email }: { id: string; email: string }): Promise<Account> {
    await this.tables();
    const { rows } = await this.pool.query<AccountRow>(
      `INSERT INTO accounts (id, email) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
       RETURNING ${COLUMNS}`,
      [id, email],
    );
    return toAccount(rows[0]);
  }

  async find(id: string): Promise<Account | null> {
    await this.tables();
    const { rows } = await this.pool.query<AccountRow>(`SELECT ${COLUMNS} FROM accounts WHERE id = $1`, [id]);
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async promote(id: string): Promise<boolean> {
    await this.tables();
    try {
      const { rowCount } = await this.pool.query(
        `UPDATE accounts SET role = 'super_admin', plan = 'max' WHERE id = $1`,
        [id],
      );
      return rowCount === 1;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === UNIQUE_VIOLATION) return false;
      throw error;
    }
  }

  async list(month: string): Promise<AccountWithUsage[]> {
    await this.tables();
    const accounts = await this.pool.query<AccountRow>(`SELECT ${COLUMNS} FROM accounts ORDER BY created_at`);
    const usage = await this.pool.query<{ account_id: string; meter: Meter; used: number }>(
      'SELECT account_id, meter, used FROM account_usage WHERE month = $1',
      [month],
    );
    return accounts.rows.map((row) => ({
      ...toAccount(row),
      usage: toUsage(usage.rows.filter((entry) => entry.account_id === row.id)),
    }));
  }

  async setPlan(id: string, plan: PlanName): Promise<Account | null> {
    await this.tables();
    const { rows } = await this.pool.query<AccountRow>(
      `UPDATE accounts SET plan = $2, requested_plan = NULL WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, plan],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async requestPlan(id: string, plan: PlanName): Promise<void> {
    await this.tables();
    await this.pool.query('UPDATE accounts SET requested_plan = $2 WHERE id = $1', [id, plan]);
  }

  async usage(id: string, month: string): Promise<MonthlyUsage> {
    await this.tables();
    const { rows } = await this.pool.query<{ meter: Meter; used: number }>(
      'SELECT meter, used FROM account_usage WHERE account_id = $1 AND month = $2',
      [id, month],
    );
    return toUsage(rows);
  }

  async spend({ accountId, month, meter, amount, limit }: Spend): Promise<boolean> {
    if (amount > limit) return false;
    await this.tables();
    // One statement, so two requests at the last unit cannot both pass.
    const { rowCount } = await this.pool.query(
      `INSERT INTO account_usage AS usage (account_id, month, meter, used) VALUES ($1, $2, $3, $4)
       ON CONFLICT (account_id, month, meter) DO UPDATE SET used = usage.used + EXCLUDED.used
       WHERE usage.used + EXCLUDED.used <= $5`,
      [accountId, month, meter, amount, limit],
    );
    return rowCount === 1;
  }

  async refund({ accountId, month, meter, amount }: Omit<Spend, 'limit'>): Promise<void> {
    await this.tables();
    await this.pool.query(
      `UPDATE account_usage SET used = GREATEST(0, used - $4)
       WHERE account_id = $1 AND month = $2 AND meter = $3`,
      [accountId, month, meter, amount],
    );
  }

  private tables(): Promise<unknown> {
    // A failed attempt is not kept, so the next call tries again.
    this.ready ??= this.pool.query(CREATE_TABLES).catch((error: unknown) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }
}
