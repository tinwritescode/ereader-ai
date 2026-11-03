import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { countWords, readingMinutes } from '../../../shared/reading-time';
import { STORAGE_GATEWAY, StorageGateway } from '../../../shared/storage/storage-gateway';
import { BookCover, BookImportResult, BookRecord, ChapterRecord, Figure, PICTURE_TYPES, SHAPE_VERSION } from '../domain/book';
import { bookLanguage } from '../domain/book-language';
import { reshapedChapters } from '../domain/book-reshape';
import { BOOK_STORE, BookStore, BookSummary } from './book-store';
import { EpubBook, EpubChapter, EpubCover, EpubFigure, readEpub } from './epub-reader';
import { writeEpub } from './epub-writer';

export type ImportBookCommand = {
  userId: string;
  fileName: string;
  bytes: Buffer;
  maxBooks: number;
};

@Injectable()
export class BookService {
  private readonly logger = new Logger(BookService.name);

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
    await this.storeImages(chapters);
    const book: BookRecord = {
      id: randomUUID(),
      userId,
      title: metadata.title ?? fileName.slice(0, -'.epub'.length),
      author: metadata.author,
      language: languageOf(epub.book),
      status: 'READY',
      sourceChecksum,
      sourceKey,
      cover: await this.storeCover(sourceChecksum, cover),
      shapeVersion: SHAPE_VERSION,
    };
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

  /** Open to anyone holding the name, which comes from the picture's bytes and cannot be guessed. */
  async image(name: string): Promise<EpubCover> {
    const image = await this.storedImage(name);
    if (!image) {
      throw new NotFoundException('IMAGE_NOT_FOUND');
    }
    return image;
  }

  async chapters(userId: string, bookId: string): Promise<ChapterRecord[]> {
    return this.store.chapters((await this.status(userId, bookId)).id);
  }

  /** The book proper: what whole-book tasks work through. */
  async mainChapters(userId: string, bookId: string): Promise<ChapterRecord[]> {
    return (await this.chapters(userId, bookId)).filter(({ kind }) => kind === 'main');
  }

  /**
   * The book proper written out as an EPUB with the given chapters, which may carry other words than the ones
   * read in; the cover and the pictures come from the book as kept.
   */
  async writeOut(
    userId: string,
    bookId: string,
    { language, chapters }: { language: string; chapters: ChapterRecord[] },
  ): Promise<Buffer> {
    const book = await this.status(userId, bookId);
    const coverBytes = book.cover && (await this.storage.get(book.cover.key));
    return writeEpub({
      id: book.id,
      metadata: { title: book.title, author: book.author, language },
      cover: book.cover && coverBytes ? { bytes: coverBytes, mediaType: book.cover.mediaType } : null,
      chapters: await Promise.all(
        chapters.map(async ({ label, subtitle, blocks, figures }) => ({
          label,
          subtitle,
          blocks: blocks.map(({ kind, text }) => ({ kind, text })),
          figures: await this.storedFigures(figures),
        })),
      ),
    });
  }

  /**
   * Reads books kept by an older reader again. [onVietnamese] runs first for a book found to be Vietnamese
   * after all, and a failure leaves that book stale, so a crash anywhere just repeats the pass.
   */
  async reshapeStale(onVietnamese: (book: BookRecord) => Promise<void>): Promise<void> {
    for (const book of await this.store.staleBefore(SHAPE_VERSION)) {
      try {
        await this.reshape(book, onVietnamese);
      } catch (error) {
        this.logger.warn(`Book ${book.id} could not be read again: ${String(error)}`);
      }
    }
  }

  async chapter(userId: string, chapterId: string): Promise<ChapterRecord> {
    const chapter = await this.store.chapter(chapterId);
    const book = chapter && (await this.store.find(chapter.bookId));
    if (!chapter || book?.userId !== userId) {
      throw new NotFoundException('CHAPTER_NOT_FOUND');
    }
    return chapter;
  }

  private async reshape(book: BookRecord, onVietnamese: (book: BookRecord) => Promise<void>): Promise<void> {
    const bytes = await this.storage.get(book.sourceKey);
    const epub = bytes && (await readEpub(bytes));
    if (epub?.kind !== 'ok') throw new Error('SOURCE_UNREADABLE');
    const language = languageOf(epub.book);
    if (language === 'vi' && !book.language?.toLowerCase().startsWith('vi')) await onVietnamese(book);
    await this.storeImages(epub.book.chapters);
    await this.store.reshape({
      bookId: book.id,
      language,
      chapters: reshapedChapters(await this.store.chapters(book.id), epub.book.chapters.map(withStoredFigures)),
      shapeVersion: SHAPE_VERSION,
    });
  }

  /** A picture no longer kept is left out, and the text reads on without it. */
  private async storedFigures(figures: Figure[]): Promise<EpubFigure[]> {
    const found = await Promise.all(
      figures.map(async ({ before, alt, image: name, width, height }) => {
        const image = await this.storedImage(name);
        return image ? [{ before, alt, image: { name, width, height, ...image } }] : [];
      }),
    );
    return found.flat();
  }

  private async storedImage(name: string): Promise<EpubCover | null> {
    const mediaType = PICTURE_TYPES.get(PICTURE_NAME.exec(name)?.[1] ?? '');
    const bytes = mediaType && (await this.storage.get(imageKey(name)));
    return mediaType && bytes ? { bytes, mediaType } : null;
  }

  /** Named by their bytes, so a retry or another copy of the book rewrites the same objects. */
  private async storeImages(chapters: EpubChapter[]): Promise<void> {
    const images = new Map(chapters.flatMap(({ figures }) => figures.map(({ image }) => [image.name, image.bytes])));
    for (const [name, bytes] of images) {
      await this.storage.put({ key: imageKey(name), bytes });
    }
  }

  private async storeCover(sourceChecksum: string, cover: EpubCover | null): Promise<BookCover | null> {
    if (!cover) return null;
    const key = `covers/${sourceChecksum}`;
    await this.storage.put({ key, bytes: cover.bytes });
    return { key, mediaType: cover.mediaType };
  }
}

const PICTURE_NAME = /^[0-9a-f]{64}\.(\w+)$/;
const imageKey = (name: string) => `images/${name}`;

function withStoredFigures({ figures, ...chapter }: EpubChapter) {
  return {
    ...chapter,
    figures: figures.map(({ before, alt, image: { name, width, height } }) => ({ before, alt, image: name, width, height })),
  };
}

function languageOf({ metadata, chapters }: EpubBook): string {
  const main = chapters.filter(({ kind }) => kind === 'main');
  const text = main.flatMap(({ blocks }) => blocks.map((block) => block.text)).join(' ');
  return bookLanguage({ declared: metadata.language, text });
}

function toChapterRecord(bookId: string, index: number, chapter: EpubChapter): ChapterRecord {
  const { label, subtitle, kind, blocks, figures } = withStoredFigures(chapter);
  const id = `${bookId}-c${index}`;
  const wordCount = blocks.reduce((total, block) => total + countWords(block.text), 0);
  return {
    id,
    bookId,
    index,
    label,
    subtitle,
    kind,
    wordCount,
    minutes: readingMinutes(wordCount),
    blocks: blocks.map((block, blockIndex) => ({ blockId: `${id}-b${blockIndex}`, ...block })),
    figures,
  };
}
