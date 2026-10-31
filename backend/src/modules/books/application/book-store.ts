import { BookRecord, ChapterRecord } from '../domain/book';
import { ChapterShape } from '../domain/book-reshape';

export const BOOK_STORE = Symbol('BOOK_STORE');

export type BookShape = {
  bookId: string;
  language: string;
  chapters: ChapterShape[];
  shapeVersion: number;
};

export type BookSummary = BookRecord & {
  chapterCount: number;
  minutes: number;
};

export interface BookStore {
  /** Keeps the book, or answers with the one this user already has from the same file. */
  add(book: BookRecord, chapters: ChapterRecord[]): Promise<{ book: BookRecord; created: boolean }>;
  find(id: string): Promise<BookRecord | null>;
  findBySource(userId: string, sourceChecksum: string): Promise<BookRecord | null>;
  list(userId: string): Promise<BookSummary[]>;
  summary(id: string): Promise<BookSummary | null>;
  count(userId: string): Promise<number>;
  chapters(bookId: string): Promise<ChapterRecord[]>;
  chapter(id: string): Promise<ChapterRecord | null>;
  /** Books read by an older version of the reader. */
  staleBefore(shapeVersion: number): Promise<BookRecord[]>;
  reshape(shape: BookShape): Promise<void>;
}

export class InMemoryBookStore implements BookStore {
  private readonly books = new Map<string, BookRecord>();
  private readonly chaptersByBook = new Map<string, ChapterRecord[]>();

  async add(book: BookRecord, chapters: ChapterRecord[]) {
    const existing = await this.findBySource(book.userId, book.sourceChecksum);
    if (existing) return { book: existing, created: false };
    this.books.set(book.id, book);
    this.chaptersByBook.set(book.id, chapters);
    return { book, created: true };
  }

  async find(id: string) {
    return this.books.get(id) ?? null;
  }

  async findBySource(userId: string, sourceChecksum: string) {
    return this.ofUser(userId).find((book) => book.sourceChecksum === sourceChecksum) ?? null;
  }

  async list(userId: string) {
    return this.ofUser(userId).map((book) => this.summarize(book));
  }

  async summary(id: string) {
    const book = this.books.get(id);
    return book ? this.summarize(book) : null;
  }

  async count(userId: string) {
    return this.ofUser(userId).length;
  }

  async chapters(bookId: string) {
    return this.chaptersByBook.get(bookId) ?? [];
  }

  async chapter(id: string) {
    return [...this.chaptersByBook.values()].flat().find((chapter) => chapter.id === id) ?? null;
  }

  async staleBefore(shapeVersion: number) {
    return [...this.books.values()].filter((book) => book.shapeVersion < shapeVersion);
  }

  async reshape({ bookId, language, chapters, shapeVersion }: BookShape) {
    const book = this.books.get(bookId);
    if (book) this.books.set(bookId, { ...book, language, shapeVersion });
    this.chaptersByBook.set(
      bookId,
      (this.chaptersByBook.get(bookId) ?? []).map((chapter) => ({
        ...chapter,
        ...chapters.find(({ id }) => id === chapter.id),
      })),
    );
  }

  private ofUser(userId: string) {
    return [...this.books.values()].filter((book) => book.userId === userId);
  }

  private summarize(book: BookRecord): BookSummary {
    const chapters = this.chaptersByBook.get(book.id) ?? [];
    return {
      ...book,
      chapterCount: chapters.filter(({ kind }) => kind === 'main').length,
      minutes: chapters.reduce((total, chapter) => total + chapter.minutes, 0),
    };
  }
}
