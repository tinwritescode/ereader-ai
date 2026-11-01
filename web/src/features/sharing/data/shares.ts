import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { ChapterSummary, TextBlock } from '~/features/books/domain/book'
import { authMiddleware } from '~/shared/server/auth.middleware'
import { viewerMiddleware } from '~/shared/server/viewer.middleware'

const ShareWire = z.object({ shareId: z.string(), createdAt: z.string(), opened: z.boolean() })

const ChapterWire = z
  .object({
    chapterId: z.string(),
    label: z.string(),
    subtitle: z.string().nullable(),
    kind: z.enum(['main', 'front']),
    minutes: z.int(),
  })
  .transform((chapter): ChapterSummary => chapter)

const Blocks = z.array(
  z.object({ kind: z.enum(['heading', 'paragraph']), text: z.string() }).transform((block): TextBlock => block),
)

const shares = (bookId: string) => `/books/${encodeURIComponent(bookId)}/shares`
const shared = (token: string) => `/shared/${encodeURIComponent(token)}`

const listShares = createServerFn()
  .middleware([authMiddleware])
  .validator(z.object({ bookId: z.string().min(1) }))
  .handler(({ context, data: { bookId } }) =>
    context.backend.json({ path: shares(bookId), schema: z.object({ shares: z.array(ShareWire) }) }),
  )

export const createShare = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ bookId: z.string().min(1), password: z.string() }))
  .handler(({ context, data: { bookId, password } }) =>
    context.backend.json({
      path: shares(bookId),
      method: 'POST',
      body: { password },
      schema: ShareWire.extend({ token: z.string() }),
    }),
  )

export const revokeShare = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ shareId: z.string().min(1) }))
  .handler(({ context, data: { shareId } }) =>
    context.backend.empty({ path: `/shares/${encodeURIComponent(shareId)}`, method: 'DELETE' }),
  )

export const openShare = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .validator(z.object({ token: z.string().min(1), password: z.string() }))
  .handler(({ context, data: { token, password } }) =>
    context.viewerBackend.open({ path: `${shared(token)}/open`, password }),
  )

const readBook = createServerFn()
  .middleware([viewerMiddleware])
  .validator(z.object({ token: z.string().min(1) }))
  .handler(({ context, data: { token } }) =>
    context.viewerBackend.json({
      path: shared(token),
      schema: z.object({ title: z.string(), author: z.string().nullable(), chapters: z.array(ChapterWire) }),
    }),
  )

const readChapter = createServerFn()
  .middleware([viewerMiddleware])
  .validator(z.object({ token: z.string().min(1), chapterId: z.string().min(1) }))
  .handler(({ context, data: { token, chapterId } }) =>
    context.viewerBackend.json({
      path: `${shared(token)}/chapters/${encodeURIComponent(chapterId)}`,
      schema: z.object({ original: Blocks, vietnamese: Blocks.nullable() }),
    }),
  )

export const sharesQuery = (bookId: string) =>
  queryOptions({
    queryKey: ['books', bookId, 'shares'],
    queryFn: async () => (await listShares({ data: { bookId } })).shares,
  })

export const sharedBookQuery = (token: string) =>
  queryOptions({ queryKey: ['shared', token], queryFn: () => readBook({ data: { token } }), retry: false })

export const sharedChapterQuery = ({ token, chapterId }: { token: string; chapterId: string }) =>
  queryOptions({
    queryKey: ['shared', token, chapterId],
    queryFn: () => readChapter({ data: { token, chapterId } }),
    retry: false,
  })
