import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { BookShare } from '../domain/book-share';
import { PostgresShareStore } from './postgres.share-store';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('PostgresShareStore', () => {
  const pool = new Pool({ connectionString: url });
  const store = new PostgresShareStore(pool);
  const bookId = `book-${randomUUID()}`;

  const share = (): BookShare => ({
    id: randomUUID(),
    bookId,
    ownerId: 'owner',
    tokenHash: randomUUID(),
    passwordHash: 'salt:key',
    holder: null,
    tries: 0,
    createdAt: new Date(),
  });

  afterAll(async () => {
    await pool.query('DELETE FROM book_shares WHERE book_id = $1', [bookId]);
    await pool.end();
  });

  it('finds a link by its token and by its book', async () => {
    const added = share();
    await store.add(added);

    expect(await store.byToken(added.tokenHash)).toEqual(added);
    expect(await store.ofBook(bookId)).toContainEqual(added);
    expect(await store.byToken('none')).toBeNull();
  });

  it('gives a link to one of many machines claiming together', async () => {
    const added = share();
    await store.add(added);

    const claims = await Promise.all(['a', 'b', 'c', 'd'].map((holder) => store.claim(added.id, holder)));

    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it('spends no more tries than allowed, however many come at once', async () => {
    const added = share();
    await store.add(added);

    const tries = await Promise.all(Array.from({ length: 8 }, () => store.spendTry(added.id, 5)));

    expect(tries.filter(Boolean)).toHaveLength(5);
    expect((await store.byToken(added.tokenHash))?.tries).toBe(5);
  });

  it('spends no try of a link a machine holds', async () => {
    const added = share();
    await store.add(added);
    await store.claim(added.id, 'a');

    expect(await store.spendTry(added.id, 5)).toBe(false);
  });

  it('removes a link for its owner only', async () => {
    const added = share();
    await store.add(added);

    expect(await store.remove(added.id, 'stranger')).toBe(false);
    expect(await store.remove(added.id, 'owner')).toBe(true);
    expect(await store.byToken(added.tokenHash)).toBeNull();
  });
});
