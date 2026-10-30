export type BookStatus = 'PROCESSING' | 'READY' | 'FAILED';

export type BookCover = {
  key: string;
  mediaType: string;
};

export type BookRecord = {
  id: string;
  userId: string;
  title: string;
  author: string | null;
  language: string | null;
  status: BookStatus;
  sourceChecksum: string;
  sourceKey: string;
  cover: BookCover | null;
};

export type Block = {
  blockId: string;
  kind: 'heading' | 'paragraph';
  text: string;
};

export type ChapterRecord = {
  id: string;
  bookId: string;
  index: number;
  label: string;
  subtitle: string | null;
  wordCount: number;
  minutes: number;
  blocks: Block[];
};

export type BookImportRejection = 'UNSUPPORTED_TYPE' | 'EPUB_INVALID' | 'BOOK_LIMIT';

export type BookImportResult =
  | { kind: 'created'; book: BookRecord }
  | { kind: 'existing'; book: BookRecord }
  | { kind: 'rejected'; code: BookImportRejection };
