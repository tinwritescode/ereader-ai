import { InMemoryTaskTable, TaskTable } from '../../../shared/tasks/task-table';
import { Block } from '../../books/domain/book';
import { BookTranslationTask } from '../domain/book-translation';

export const BOOK_TRANSLATION_STORE = Symbol('BOOK_TRANSLATION_STORE');
export const CHAPTER_TRANSLATIONS = Symbol('CHAPTER_TRANSLATIONS');

export type BookTranslationStore = TaskTable<BookTranslationTask>;

/** For development and tests: forgotten on restart. */
export class InMemoryBookTranslationStore extends InMemoryTaskTable<BookTranslationTask> {}

export type ChapterTranslation = { chapterId: string; bookId: string; blocks: Block[] };

/** Translated chapters, kept with their book so a translation is made once. */
export interface ChapterTranslations {
  save(translation: ChapterTranslation): Promise<void>;
  /** The translated blocks, or null while the chapter has none. */
  find(chapterId: string): Promise<Block[] | null>;
  /** Ids of the book's translated chapters. */
  translatedOf(bookId: string): Promise<string[]>;
}

/** For development and tests: forgotten on restart. */
export class InMemoryChapterTranslations implements ChapterTranslations {
  private readonly chapters = new Map<string, ChapterTranslation>();

  async save(translation: ChapterTranslation): Promise<void> {
    this.chapters.set(translation.chapterId, translation);
  }

  async find(chapterId: string): Promise<Block[] | null> {
    return this.chapters.get(chapterId)?.blocks ?? null;
  }

  async translatedOf(bookId: string): Promise<string[]> {
    return [...this.chapters.values()].filter((chapter) => chapter.bookId === bookId).map(({ chapterId }) => chapterId);
  }
}
