export type BookStatus = 'PROCESSING' | 'READY' | 'FAILED';

/** Bump when books need reading again from their files. */
export const SHAPE_VERSION = 2;

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
  shapeVersion: number;
};

export type Block = {
  blockId: string;
  kind: 'heading' | 'paragraph';
  text: string;
};

/** A picture standing before the block at index [before]; the chapter's block count puts it last. */
export type Figure = {
  before: number;
  /** The stored picture's name, which never changes what it points at. */
  image: string;
  alt: string | null;
  width: number;
  height: number;
};

/** Only pictures with no way to run anything: an SVG is a document that can carry scripts. */
export const PICTURE_TYPES = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
]);

/** Front matter is what stands before the table of contents begins. */
export type ChapterKind = 'main' | 'front';

export type ChapterRecord = {
  id: string;
  bookId: string;
  index: number;
  label: string;
  subtitle: string | null;
  kind: ChapterKind;
  wordCount: number;
  minutes: number;
  blocks: Block[];
  figures: Figure[];
};

export type BookImportRejection = 'UNSUPPORTED_TYPE' | 'EPUB_INVALID' | 'BOOK_LIMIT';

export type BookImportResult =
  | { kind: 'created'; book: BookRecord }
  | { kind: 'existing'; book: BookRecord }
  | { kind: 'rejected'; code: BookImportRejection };
