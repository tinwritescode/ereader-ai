import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { countWords, readingMinutes } from '../../../shared/reading-time';
import { STORAGE_GATEWAY, StorageGateway } from '../../../shared/storage/storage-gateway';
import { BookImportResult, BookRecord, ChapterRecord } from '../domain/book';
import { EpubChapter, readEpub } from './epub-reader';

export type ImportBookCommand = {
  userId: string;
  fileName: string;
  bytes: Buffer;
};

export type BookSummary = BookRecord & {
  chapterCount: number;
  minutes: number;
};

@Injectable()
export class BookService {
  private readonly books = new Map<string, BookRecord>();
  private readonly chaptersByBook = new Map<string, ChapterRecord[]>();

  constructor(@Inject(STORAGE_GATEWAY) private readonly storage: StorageGateway) {}

  async importEpub({ userId, fileName, bytes }: ImportBookCommand): Promise<BookImportResult> {
    if (extname(fileName).toLowerCase() !== '.epub') {
      return { kind: 'rejected', code: 'UNSUPPORTED_TYPE' };
    }
    const epub = await readEpub(bytes);
    if (epub.kind === 'invalid') {
      return { kind: 'rejected', code: 'EPUB_INVALID' };
    }
    const sourceChecksum = createHash('sha256').update(bytes).digest('hex');
    const sourceKey = `sources/${sourceChecksum}.epub`;
    // Content-addressed key: a retried or concurrent upload rewrites the same object.
    await this.storage.put({ key: sourceKey, bytes });

    // No await between this lookup and the insert, so duplicates cannot race past it.
    const existing = this.findBySource(userId, sourceChecksum);
    if (existing) {
      return { kind: 'existing', book: existing };
    }
    // Chapters are split during import for now; the BullMQ normalize job replaces this step later.
    const { metadata, chapters } = epub.book;
    const book: BookRecord = {
      id: randomUUID(),
      userId,
      title: metadata.title ?? fileName.slice(0, -'.epub'.length),
      author: metadata.author,
      language: metadata.language,
      status: 'READY',
      sourceChecksum,
      sourceKey,
    };
    this.books.set(book.id, book);
    this.chaptersByBook.set(book.id, chapters.map((chapter, index) => toChapterRecord(book.id, index, chapter)));
    return { kind: 'created', book };
  }

  list(userId: string): BookSummary[] {
    return [...this.books.values()].filter((book) => book.userId === userId).map((book) => this.summarize(book));
  }

  summarize(book: BookRecord): BookSummary {
    const chapters = this.chaptersByBook.get(book.id) ?? [];
    return {
      ...book,
      chapterCount: chapters.length,
      minutes: chapters.reduce((total, chapter) => total + chapter.minutes, 0),
    };
  }

  status(userId: string, id: string): BookRecord {
    const book = this.books.get(id);
    if (!book || book.userId !== userId) {
      throw new NotFoundException('BOOK_NOT_FOUND');
    }
    return book;
  }

  chapters(userId: string, bookId: string): ChapterRecord[] {
    return this.chaptersByBook.get(this.status(userId, bookId).id) ?? [];
  }

  chapter(userId: string, chapterId: string): ChapterRecord {
    const chapter = [...this.chaptersByBook.values()].flat().find((candidate) => candidate.id === chapterId);
    if (!chapter || this.books.get(chapter.bookId)?.userId !== userId) {
      throw new NotFoundException('CHAPTER_NOT_FOUND');
    }
    return chapter;
  }

  private findBySource(userId: string, sourceChecksum: string): BookRecord | undefined {
    return [...this.books.values()].find(
      (book) => book.userId === userId && book.sourceChecksum === sourceChecksum,
    );
  }
}

function toChapterRecord(bookId: string, index: number, { label, subtitle, blocks }: EpubChapter): ChapterRecord {
  const id = `${bookId}-c${index}`;
  const wordCount = blocks.reduce((total, block) => total + countWords(block.text), 0);
  return {
    id,
    bookId,
    index,
    label,
    subtitle,
    wordCount,
    minutes: readingMinutes(wordCount),
    blocks: blocks.map((block, blockIndex) => ({ blockId: `${id}-b${blockIndex}`, ...block })),
  };
}
