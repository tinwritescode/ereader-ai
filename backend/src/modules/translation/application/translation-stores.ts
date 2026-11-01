import { InMemoryTaskTable, TaskTable } from '../../../shared/tasks/task-table';
import { Block } from '../../books/domain/book';
import { BookTranslationTask } from '../domain/book-translation';
import { StyleSheet } from './translation-prompt';

export const BOOK_TRANSLATION_STORE = Symbol('BOOK_TRANSLATION_STORE');
export const CHAPTER_TRANSLATIONS = Symbol('CHAPTER_TRANSLATIONS');
export const STYLE_SHEETS = Symbol('STYLE_SHEETS');

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

/** One style sheet per book. The first one saved stays, so later chapters never contradict earlier ones. */
export interface StyleSheets {
  save(bookId: string, sheet: StyleSheet): Promise<void>;
  find(bookId: string): Promise<StyleSheet | null>;
}

/** For development and tests: forgotten on restart. */
export class InMemoryStyleSheets implements StyleSheets {
  private readonly sheets = new Map<string, StyleSheet>();

  async save(bookId: string, sheet: StyleSheet): Promise<void> {
    if (!this.sheets.has(bookId)) this.sheets.set(bookId, sheet);
  }

  async find(bookId: string): Promise<StyleSheet | null> {
    return this.sheets.get(bookId) ?? null;
  }
}
