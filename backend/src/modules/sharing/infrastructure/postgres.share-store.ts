import { Pool } from 'pg';
import { ShareStore } from '../application/share-store';
import { BookShare } from '../domain/book-share';

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS book_shares (
    id text PRIMARY KEY,
    book_id text NOT NULL,
    owner_id text NOT NULL,
    token_hash text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    holder text,
    tries integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL
  );
  CREATE INDEX IF NOT EXISTS book_shares_book ON book_shares (book_id)`;

type ShareRow = {
  id: string;
  book_id: string;
  owner_id: string;
  token_hash: string;
  password_hash: string;
  holder: string | null;
  tries: number;
  created_at: Date;
};

const toShare = (row: ShareRow): BookShare => ({
  id: row.id,
  bookId: row.book_id,
  ownerId: row.owner_id,
  tokenHash: row.token_hash,
  passwordHash: row.password_hash,
  holder: row.holder,
  tries: row.tries,
  createdAt: row.created_at,
});

export class PostgresShareStore implements ShareStore {
  private ready: Promise<unknown> | null = null;

  constructor(private readonly pool: Pool) {}

  async add({ id, bookId, ownerId, tokenHash, passwordHash, holder, tries, createdAt }: BookShare): Promise<void> {
    await this.table();
    await this.pool.query(
      `INSERT INTO book_shares (id, book_id, owner_id, token_hash, password_hash, holder, tries, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, bookId, ownerId, tokenHash, passwordHash, holder, tries, createdAt],
    );
  }

  async byToken(tokenHash: string): Promise<BookShare | null> {
    await this.table();
    const { rows } = await this.pool.query<ShareRow>('SELECT * FROM book_shares WHERE token_hash = $1', [tokenHash]);
    const [row] = rows;
    return row ? toShare(row) : null;
  }

  async ofBook(bookId: string): Promise<BookShare[]> {
    await this.table();
    const { rows } = await this.pool.query<ShareRow>('SELECT * FROM book_shares WHERE book_id = $1 ORDER BY created_at', [bookId]);
    return rows.map(toShare);
  }

  async spendTry(id: string, maxTries: number): Promise<boolean> {
    await this.table();
    const { rowCount } = await this.pool.query(
      'UPDATE book_shares SET tries = tries + 1 WHERE id = $1 AND holder IS NULL AND tries < $2',
      [id, maxTries],
    );
    return rowCount === 1;
  }

  async claim(id: string, holder: string): Promise<boolean> {
    await this.table();
    const { rowCount } = await this.pool.query('UPDATE book_shares SET holder = $2 WHERE id = $1 AND holder IS NULL', [id, holder]);
    return rowCount === 1;
  }

  async remove(id: string, ownerId: string): Promise<boolean> {
    await this.table();
    const { rowCount } = await this.pool.query('DELETE FROM book_shares WHERE id = $1 AND owner_id = $2', [id, ownerId]);
    return rowCount === 1;
  }

  private table(): Promise<unknown> {
    // A failed attempt is not kept, so the next call tries again.
    this.ready ??= this.pool.query(CREATE_TABLE).catch((error: unknown) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }
}
