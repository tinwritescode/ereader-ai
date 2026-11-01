import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Account } from '../../accounts/domain/plan';
import { BookService } from '../../books/application/book.service';
import { Block, ChapterRecord } from '../../books/domain/book';
import { CHAPTER_TRANSLATIONS, ChapterTranslations } from '../../translation/application/translation-stores';
import { BookShare, MAX_TRIES, isClosed } from '../domain/book-share';
import { hashOf, hashPassword, newToken, passwordMatches } from './share-secrets';
import { SHARE_STORE, ShareStore } from './share-store';

const gone = () => new NotFoundException({ code: 'SHARE_GONE' });
const taken = () => new ForbiddenException({ code: 'SHARE_TAKEN' });

export type SharedBook = { title: string; author: string | null; chapters: ChapterRecord[] };
export type SharedChapter = { chapter: ChapterRecord; vietnamese: Block[] | null };

/** Everything a viewer can do is here, and all of it reads: there is no way in to change a book. */
@Injectable()
export class BookShareService {
  constructor(
    @Inject(SHARE_STORE) private readonly store: ShareStore,
    @Inject(CHAPTER_TRANSLATIONS) private readonly translations: ChapterTranslations,
    private readonly books: BookService,
  ) {}

  /** The token is handed over here and never again: only its hash is kept. */
  async create(account: Account, bookId: string, password: string): Promise<{ share: BookShare; token: string }> {
    await this.books.status(account.id, bookId);
    const token = newToken();
    const share: BookShare = {
      id: randomUUID(),
      bookId,
      ownerId: account.id,
      tokenHash: hashOf(token),
      passwordHash: await hashPassword(password),
      holder: null,
      tries: 0,
      createdAt: new Date(),
    };
    await this.store.add(share);
    return { share, token };
  }

  async list(account: Account, bookId: string): Promise<BookShare[]> {
    await this.books.status(account.id, bookId);
    return this.store.ofBook(bookId);
  }

  async revoke(account: Account, id: string): Promise<void> {
    if (!(await this.store.remove(id, account.id))) throw gone();
  }

  /** The first machine to give the password takes the link for good; it needs no password after that. */
  async open({ token, password, device }: { token: string; password: string; device: string }): Promise<void> {
    const share = await this.live(token);
    const holder = hashOf(device);
    if (share.holder === holder) return;
    if (!(await this.store.spendTry(share.id, MAX_TRIES))) return this.settled(token, holder);
    if (!(await passwordMatches(password, share.passwordHash))) {
      throw new UnauthorizedException({ code: 'SHARE_PASSWORD_WRONG' });
    }
    if (!(await this.store.claim(share.id, holder))) return this.settled(token, holder);
  }

  async book(token: string, device: string | undefined): Promise<SharedBook> {
    const { ownerId, bookId } = await this.held(token, device);
    const [{ title, author }, chapters] = await Promise.all([
      this.books.status(ownerId, bookId),
      this.books.chapters(ownerId, bookId),
    ]);
    return { title, author, chapters };
  }

  async chapter(token: string, device: string | undefined, chapterId: string): Promise<SharedChapter> {
    const { ownerId, bookId } = await this.held(token, device);
    const chapter = await this.books.chapter(ownerId, chapterId);
    // The owner has other books; the link opens this one.
    if (chapter.bookId !== bookId) throw new NotFoundException({ code: 'CHAPTER_NOT_FOUND' });
    return { chapter, vietnamese: await this.translations.find(chapterId) };
  }

  /** Another request got there first: this machine's, or some other's. */
  private async settled(token: string, holder: string): Promise<void> {
    if ((await this.live(token)).holder !== holder) throw taken();
  }

  private async held(token: string, device: string | undefined): Promise<BookShare> {
    const share = await this.live(token);
    if (share.holder === null) throw new UnauthorizedException({ code: 'SHARE_LOCKED' });
    if (device === undefined || share.holder !== hashOf(device)) throw taken();
    return share;
  }

  private async live(token: string): Promise<BookShare> {
    const share = await this.store.byToken(hashOf(token));
    if (!share || isClosed(share)) throw gone();
    return share;
  }
}
