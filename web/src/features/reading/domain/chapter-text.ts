import type { TextBlock } from '~/features/books/domain/book'

export type ChapterText =
  | { kind: 'loading'; shortening: boolean }
  | { kind: 'loaded'; blocks: TextBlock[] }
  /** The translation is not made yet; the original stands in, faded, until it is. */
  | { kind: 'untranslated'; blocks: TextBlock[] }
  | { kind: 'failed'; code: string; retry: () => void }
