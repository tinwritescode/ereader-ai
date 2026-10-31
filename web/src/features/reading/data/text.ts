import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { TextBlock } from '~/features/books/domain/book'
import { authMiddleware } from '~/shared/server/auth.middleware'

const Blocks = z.object({
  blocks: z.array(
    z.object({ kind: z.enum(['heading', 'paragraph']), text: z.string() }).transform((block): TextBlock => block),
  ),
})

const ChapterInput = z.object({ chapterId: z.string().min(1) })
const path = (chapterId: string) => `/chapters/${encodeURIComponent(chapterId)}`

const getOriginal = createServerFn()
  .middleware([authMiddleware])
  .validator(ChapterInput)
  .handler(({ context, data: { chapterId } }) => context.backend.json({ path: path(chapterId), schema: Blocks }))

const getTranslated = createServerFn()
  .middleware([authMiddleware])
  .validator(ChapterInput)
  .handler(({ context, data: { chapterId } }) => context.backend.json({ path: `${path(chapterId)}/translation`, schema: Blocks }))

const getShortened = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(ChapterInput.extend({ minutes: z.int().min(1) }))
  .handler(({ context, data: { chapterId, minutes } }) =>
    context.backend.json({
      path: `${path(chapterId)}/digest`,
      method: 'POST',
      body: { targetLang: 'vi', targetMinutes: minutes },
      schema: z.object({ content: z.string() }),
    }),
  )

/** The app's digest is plain text in paragraphs. */
export function digestBlocks(content: string): TextBlock[] {
  return content
    .split('\n\n')
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((text) => ({ kind: 'paragraph', text }))
}

export const originalQuery = (chapterId: string) =>
  queryOptions({
    queryKey: ['chapters', chapterId, 'original'],
    queryFn: async () => (await getOriginal({ data: { chapterId } })).blocks,
    staleTime: Infinity,
  })

export const translatedQuery = (chapterId: string) =>
  queryOptions({
    queryKey: ['chapters', chapterId, 'vietnamese'],
    queryFn: async () => (await getTranslated({ data: { chapterId } })).blocks,
    staleTime: Infinity,
    retry: false,
  })

// Charged once per length, so a failure or a revisit never asks again by itself.
export const shortenedQuery = ({ chapterId, minutes }: { chapterId: string; minutes: number }) =>
  queryOptions({
    queryKey: ['chapters', chapterId, 'shortened', minutes],
    queryFn: async () => digestBlocks((await getShortened({ data: { chapterId, minutes } })).content),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })
