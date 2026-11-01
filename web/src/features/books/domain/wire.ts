import { z } from 'zod'
import type { Book, ChapterSummary, Figure, TextBlock } from './book'

export const BookWire = z
  .object({
    bookId: z.string(),
    title: z.string(),
    author: z.string().nullable(),
    language: z.string().nullable(),
    hasCover: z.boolean(),
    chapterCount: z.int(),
    minutes: z.int(),
  })
  .transform((book): Book => book)

export const ChapterWire = z
  .object({
    chapterId: z.string(),
    label: z.string(),
    subtitle: z.string().nullable(),
    kind: z.enum(['main', 'front']),
    minutes: z.int(),
  })
  .transform((chapter): ChapterSummary => chapter)

export const FigureWire = z
  .object({
    before: z.int(),
    image: z.string(),
    alt: z.string().nullable(),
    width: z.int(),
    height: z.int(),
  })
  .transform((figure): Figure => figure)

export const TextBlockWire = z
  .object({ kind: z.enum(['heading', 'paragraph']), text: z.string() })
  .transform((block): TextBlock => block)
