import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '~/shared/server/auth.middleware'
import { TaskState, isActive } from '../domain/task'
import type { BookTranslation, BookTranslationTask, BookVoice, BookVoiceTask, ChapterVoiceTask, LongTask } from '../domain/task'

const POLL_MS = 4000

// The wire names running out of voice minutes after its old provider; past here it is VOICE_LIMIT.
const Code = z
  .string()
  .nullable()
  .transform((code) => (code === 'VBEE_LIMIT' ? 'VOICE_LIMIT' : code))

const Common = {
  id: z.string(),
  bookId: z.string(),
  bookTitle: z.string(),
  state: TaskState,
  code: Code,
  position: z.int().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
}
const WholeBook = {
  ...Common,
  done: z.int(),
  total: z.int(),
  percent: z.int(),
  current: z.object({ chapterId: z.string(), percent: z.int() }).nullable(),
  waiting: z.array(z.string()),
}

const ChapterVoiceWire = z
  .object({
    ...Common,
    kind: z.literal('chapterVoice'),
    chapterId: z.string(),
    chapterLabel: z.string(),
    minutes: z.int().nullable(),
    voiceCode: z.string(),
    voiceName: z.string(),
    done: z.int(),
    total: z.int(),
  })
  .transform((task): ChapterVoiceTask => task)
const TranslationWire = z.object({ ...WholeBook, kind: z.literal('bookTranslation') }).transform((task): BookTranslationTask => task)
const BookVoiceWire = z
  .object({ ...WholeBook, kind: z.literal('bookVoice'), voiceCode: z.string(), voiceName: z.string(), voiced: z.array(z.string()) })
  .transform((task): BookVoiceTask => task)

export const TaskWire = z.union([ChapterVoiceWire, TranslationWire, BookVoiceWire])
const Kind = z.enum(['chapterVoice', 'bookTranslation', 'bookVoice'])
type Kind = z.infer<typeof Kind>
const PATHS: Record<Kind, string> = { chapterVoice: '/speech/tasks', bookTranslation: '/translations/tasks', bookVoice: '/voices/tasks' }

const book = (bookId: string) => `/books/${encodeURIComponent(bookId)}`

const listTasks = createServerFn()
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const lists = await Promise.all(
      Object.values(PATHS).map((path) => context.backend.json({ path, schema: z.object({ tasks: z.array(TaskWire) }) })),
    )
    // Oldest first, as the app shows them.
    return lists.flatMap(({ tasks }) => tasks).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  })

const BookInput = z.object({ bookId: z.string().min(1) })

const getTranslation = createServerFn()
  .middleware([authMiddleware])
  .validator(BookInput)
  .handler(({ context, data }) =>
    context.backend.json({
      path: `${book(data.bookId)}/translation`,
      schema: z.object({ translated: z.array(z.string()), task: TranslationWire.nullable() }).transform((standing): BookTranslation => standing),
    }),
  )

const getVoice = createServerFn()
  .middleware([authMiddleware])
  .validator(BookInput)
  .handler(({ context, data }) =>
    context.backend.json({
      path: `${book(data.bookId)}/voice`,
      schema: z.object({ chapters: z.int(), skipped: z.int(), minutes: z.int(), task: BookVoiceWire.nullable() }).transform((standing): BookVoice => standing),
    }),
  )

export const translateBook = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(BookInput.extend({ startChapterId: z.string().nullable() }))
  .handler(({ context, data: { bookId, startChapterId } }) =>
    context.backend.json({ path: `${book(bookId)}/translation`, method: 'POST', body: startChapterId ? { startChapterId } : {}, schema: TranslationWire }),
  )

export const voiceBook = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(BookInput.extend({ voiceCode: z.string().min(1), startChapterId: z.string().nullable() }))
  .handler(({ context, data: { bookId, voiceCode, startChapterId } }) =>
    context.backend.json({ path: `${book(bookId)}/voice`, method: 'POST', body: { voiceCode, ...(startChapterId ? { startChapterId } : {}) }, schema: BookVoiceWire }),
  )

export const voiceChapter = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      bookId: z.string(),
      chapterId: z.string(),
      bookTitle: z.string(),
      chapterLabel: z.string(),
      minutes: z.int().nullable(),
      voiceCode: z.string(),
      sentences: z.array(z.string()).min(1),
    }),
  )
  .handler(({ context, data }) => context.backend.json({ path: '/speech/tasks', method: 'POST', body: data, schema: ChapterVoiceWire }))

const TaskInput = z.object({ kind: Kind, id: z.string().min(1) })
const taskPath = ({ kind, id }: z.infer<typeof TaskInput>) => `${PATHS[kind]}/${encodeURIComponent(id)}`

export const cancelTask = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(TaskInput)
  .handler(({ context, data }) => context.backend.empty({ path: taskPath(data), method: 'DELETE' }))

export const resumeTask = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(TaskInput)
  .handler(({ context, data }) => context.backend.empty({ path: `${taskPath(data)}/resume`, method: 'POST' }))

/** Moves a waiting chapter to the front of the book's translation. */
export const translateFirst = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1), chapterId: z.string().min(1) }))
  .handler(({ context, data: { id, chapterId } }) =>
    context.backend.empty({ path: `${taskPath({ kind: 'bookTranslation', id })}/first`, method: 'POST', body: { chapterId } }),
  )

const pollWhile = (active: boolean) => (active ? POLL_MS : false)

// Looked at again for as long as one is under way.
export const tasksQuery = () =>
  queryOptions({
    queryKey: ['tasks'],
    queryFn: (): Promise<LongTask[]> => listTasks(),
    refetchInterval: (query) => pollWhile((query.state.data ?? []).some(isActive)),
  })

export const translationQuery = (bookId: string) =>
  queryOptions({
    queryKey: ['tasks', 'translation', bookId],
    queryFn: () => getTranslation({ data: { bookId } }),
    refetchInterval: (query) => pollWhile(query.state.data?.task ? isActive(query.state.data.task) : false),
  })

export const bookVoiceQuery = (bookId: string) =>
  queryOptions({
    queryKey: ['tasks', 'voice', bookId],
    queryFn: () => getVoice({ data: { bookId } }),
    refetchInterval: (query) => pollWhile(query.state.data?.task ? isActive(query.state.data.task) : false),
  })
