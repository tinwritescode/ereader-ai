import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '~/shared/server/auth.middleware'
import type { Book, ChapterSummary } from '../domain/book'

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

const ChapterWire = z
  .object({ chapterId: z.string(), label: z.string(), subtitle: z.string().nullable(), minutes: z.int() })
  .transform((chapter): ChapterSummary => chapter)

const listBooks = createServerFn()
  .middleware([authMiddleware])
  .handler(({ context }) => context.backend.json({ path: '/books', schema: z.array(BookWire) }))

const listChapters = createServerFn()
  .middleware([authMiddleware])
  .validator(z.object({ bookId: z.string().min(1) }))
  .handler(({ context, data: { bookId } }) =>
    context.backend.json({
      path: `/books/${encodeURIComponent(bookId)}/chapters`,
      schema: z.object({ chapters: z.array(ChapterWire) }),
    }),
  )

export const booksQuery = () => queryOptions({ queryKey: ['books'], queryFn: () => listBooks() })

export const chaptersQuery = (bookId: string) =>
  queryOptions({
    queryKey: ['books', bookId, 'chapters'],
    queryFn: async () => (await listChapters({ data: { bookId } })).chapters,
  })
