import { Pool } from 'pg';
import { PostgresAccountStore } from './postgres.account-store';

// Runs against a real Postgres: TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/ereader_test.
const url = process.env.TEST_DATABASE_URL;

(url ? describe : describe.skip)('PostgresAccountStore', () => {
  let pool: Pool;
  let store: PostgresAccountStore;
  const month = '2026-11';

  beforeAll(() => {
    pool = new Pool({ connectionString: url });
  });

  beforeEach(async () => {
    await pool.query('DROP TABLE IF EXISTS account_usage, accounts');
    store = new PostgresAccountStore(pool);
  });

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS account_usage, accounts');
    await pool.end();
  });

  it('creates an account once, and keeps its plan when it comes back', async () => {
    await store.upsert({ id: 'a', email: 'old@example.com' });
    await store.setPlan('a', 'plus');
    expect(await store.upsert({ id: 'a', email: 'new@example.com' })).toEqual({
      id: 'a',
      email: 'new@example.com',
      role: 'user',
      plan: 'plus',
      requestedPlan: null,
    });
  });

  it('lets only one of many concurrent promotions win', async () => {
    const ids = ['a', 'b', 'c', 'd'];
    await Promise.all(ids.map((id) => store.upsert({ id, email: `${id}@example.com` })));
    const results = await Promise.all(ids.map((id) => store.promote(id)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('never spends past the limit, however many requests race for the last units', async () => {
    await store.upsert({ id: 'a', email: 'a@example.com' });
    const spend = { accountId: 'a', month, meter: 'digests', amount: 1, limit: 3 } as const;
    const results = await Promise.all(Array.from({ length: 10 }, () => store.spend(spend)));
    expect(results.filter(Boolean)).toHaveLength(3);
    expect((await store.usage('a', month)).digests).toBe(3);
  });

  it('refuses a first spend larger than the limit, and hands a refund back', async () => {
    await store.upsert({ id: 'a', email: 'a@example.com' });
    expect(await store.spend({ accountId: 'a', month, meter: 'vbeeSeconds', amount: 11, limit: 10 })).toBe(false);
    await store.spend({ accountId: 'a', month, meter: 'vbeeSeconds', amount: 4, limit: 10 });
    await store.refund({ accountId: 'a', month, meter: 'vbeeSeconds', amount: 3 });
    expect(await store.usage('a', month)).toEqual({ digests: 0, vbeeSeconds: 1, bookTranslations: 0 });
  });

  it('lists accounts with their usage, and records a plan request until it is decided', async () => {
    await store.upsert({ id: 'a', email: 'a@example.com' });
    await store.requestPlan('a', 'max');
    await store.spend({ accountId: 'a', month, meter: 'digests', amount: 2, limit: 10 });
    expect(await store.list(month)).toEqual([
      {
        id: 'a',
        email: 'a@example.com',
        role: 'user',
        plan: 'free',
        requestedPlan: 'max',
        usage: { digests: 2, vbeeSeconds: 0, bookTranslations: 0 },
      },
    ]);
    expect((await store.setPlan('a', 'max'))?.requestedPlan).toBeNull();
  });
});
