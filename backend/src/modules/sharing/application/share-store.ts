import { BookShare } from '../domain/book-share';

export const SHARE_STORE = Symbol('SHARE_STORE');

export interface ShareStore {
  add(share: BookShare): Promise<void>;
  byToken(tokenHash: string): Promise<BookShare | null>;
  ofBook(bookId: string): Promise<BookShare[]>;
  /** Spends one try of a link no machine holds yet; false when none is left. */
  spendTry(id: string, maxTries: number): Promise<boolean>;
  /** Gives the link to [holder] unless a machine already has it; two at once get one winner. */
  claim(id: string, holder: string): Promise<boolean>;
  remove(id: string, ownerId: string): Promise<boolean>;
}

export class InMemoryShareStore implements ShareStore {
  private readonly shares = new Map<string, BookShare>();

  async add(share: BookShare): Promise<void> {
    this.shares.set(share.id, share);
  }

  async byToken(tokenHash: string): Promise<BookShare | null> {
    return [...this.shares.values()].find((share) => share.tokenHash === tokenHash) ?? null;
  }

  async ofBook(bookId: string): Promise<BookShare[]> {
    return [...this.shares.values()].filter((share) => share.bookId === bookId);
  }

  async spendTry(id: string, maxTries: number): Promise<boolean> {
    const share = this.shares.get(id);
    if (!share || share.holder !== null || share.tries >= maxTries) return false;
    this.shares.set(id, { ...share, tries: share.tries + 1 });
    return true;
  }

  async claim(id: string, holder: string): Promise<boolean> {
    const share = this.shares.get(id);
    if (!share || share.holder !== null) return false;
    this.shares.set(id, { ...share, holder });
    return true;
  }

  async remove(id: string, ownerId: string): Promise<boolean> {
    if (this.shares.get(id)?.ownerId !== ownerId) return false;
    return this.shares.delete(id);
  }
}
