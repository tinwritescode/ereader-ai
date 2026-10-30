import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { countWords, readingMinutes } from '../../../shared/reading-time';
import { STORAGE_GATEWAY, StorageGateway } from '../../../shared/storage/storage-gateway';
import { BookCover, BookImportResult, BookRecord, ChapterRecord } from '../domain/book';
import { BOOK_STORE, BookStore, BookSummary } from './book-store';
import { EpubChapter, EpubCover, readEpub } from './epub-reader';

export type ImportBookCommand = {
  userId: string;
  fileName: string;
  bytes: Buffer;
  maxBooks: number;
};

@Injectable()
export class BookService {
  constructor(
    @Inject(STORAGE_GATEWAY) private readonly storage: StorageGateway,
    @Inject(BOOK_STORE) private readonly store: BookStore,
  ) {}

  async importEpub({ userId, fileName, bytes, maxBooks }: ImportBookCommand): Promise<BookImportResult> {
    if (extname(fileName).toLowerCase() !== '.epub') {
      return { kind: 'rejected', code: 'UNSUPPORTED_TYPE' };
    }
    const epub = await readEpub(bytes);
    if (epub.kind === 'invalid') {
      return { kind: 'rejected', code: 'EPUB_INVALID' };
    }
    const sourceChecksum = createHash('sha256').update(bytes).digest('hex');
    const existing = await this.store.findBySource(userId, sourceChecksum);
    if (existing) {
      return { kind: 'existing', book: existing };
    }
    if ((await this.store.count(userId)) >= maxBooks) {
      return { kind: 'rejected', code: 'BOOK_LIMIT' };
    }
    const sourceKey = `sources/${sourceChecksum}.epub`;
    // Content-addressed keys: a retried or concurrent upload rewrites the same objects.
    await this.storage.put({ key: sourceKey, bytes });
    const { metadata, chapters, cover } = epub.book;
    const book: BookRecord = {
      id: randomUUID(),
      userId,
      title: metadata.title ?? fileName.slice(0, -'.epub'.length),
      author: metadata.author,
      language: metadata.language,
      status: 'READY',
      sourceChecksum,
      sourceKey,
      cover: await this.storeCover(sourceChecksum, cover),
    };
    // Chapters are split during import for now; the BullMQ normalize job replaces this step later.
    const stored = await this.store.add(book, chapters.map((chapter, index) => toChapterRecord(book.id, index, chapter)));
    return { kind: stored.created ? 'created' : 'existing', book: stored.book };
  }

  list(userId: string): Promise<BookSummary[]> {
    return this.store.list(userId);
  }

  async summarize(book: BookRecord): Promise<BookSummary> {
    const summary = await this.store.summary(book.id);
    if (!summary) throw new NotFoundException('BOOK_NOT_FOUND');
    return summary;
  }

  async status(userId: string, id: string): Promise<BookRecord> {
    const book = await this.store.find(id);
    if (!book || book.userId !== userId) {
      throw new NotFoundException('BOOK_NOT_FOUND');
    }
    return book;
  }

  /** Open to anyone holding the book's random id: image widgets cannot send a token. */
  async cover(id: string): Promise<EpubCover> {
    const cover = (await this.store.find(id))?.cover;
    const bytes = cover && (await this.storage.get(cover.key));
    if (!cover || !bytes) {
      throw new NotFoundException('COVER_NOT_FOUND');
    }
    return { bytes, mediaType: cover.mediaType };
  }

  async chapters(userId: string, bookId: string): Promise<ChapterRecord[]> {
    return this.store.chapters((await this.status(userId, bookId)).id);
  }

  async chapter(userId: string, chapterId: string): Promise<ChapterRecord> {
    const chapter = await this.store.chapter(chapterId);
    const book = chapter && (await this.store.find(chapter.bookId));
    if (!chapter || book?.userId !== userId) {
      throw new NotFoundException('CHAPTER_NOT_FOUND');
    }
    return chapter;
  }

  private async storeCover(sourceChecksum: string, cover: EpubCover | null): Promise<BookCover | null> {
    if (!cover) return null;
    const key = `covers/${sourceChecksum}`;
    await this.storage.put({ key, bytes: cover.bytes });
    return { key, mediaType: cover.mediaType };
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
