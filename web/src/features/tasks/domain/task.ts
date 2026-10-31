import { z } from 'zod'

export const TaskState = z.enum(['queued', 'running', 'done', 'stopped'])
export type TaskState = z.infer<typeof TaskState>

type Common = {
  id: string
  bookId: string
  bookTitle: string
  state: TaskState
  /** Why it stopped; `VOICE_LIMIT` when the month's voice minutes ran out. */
  code: string | null
  /** Place in the queue, from 1; null unless queued. */
  position: number | null
  createdAt: string
  finishedAt: string | null
}

/** Reading a whole chapter into stored audio on the server. */
export type ChapterVoiceTask = Common & {
  kind: 'chapterVoice'
  chapterId: string
  chapterLabel: string
  /** The shortened length this was made for; null for a whole chapter. */
  minutes: number | null
  voiceCode: string
  voiceName: string
  done: number
  total: number
}

type WholeBook = Common & {
  /** Chapters finished, of `total`. */
  done: number
  total: number
  /** Share of the words done, weighed by chapter length. */
  percent: number
  current: { chapterId: string; percent: number } | null
  /** Chapters still to come, in order, `current` first. */
  waiting: string[]
}

export type BookTranslationTask = WholeBook & { kind: 'bookTranslation' }
export type BookVoiceTask = WholeBook & { kind: 'bookVoice'; voiceCode: string; voiceName: string; voiced: string[] }
export type WholeBookTask = BookTranslationTask | BookVoiceTask
export type LongTask = ChapterVoiceTask | WholeBookTask

export type BookTranslation = { translated: string[]; task: BookTranslationTask | null }
/** What a voice for the whole book would read: `chapters` a Vietnamese voice can read now, `skipped` not translated yet. */
export type BookVoice = { chapters: number; skipped: number; minutes: number; task: BookVoiceTask | null }

export const isActive = ({ state }: Pick<LongTask, 'state'>): boolean => state === 'queued' || state === 'running'

export function percentOf(task: LongTask): number {
  if (task.kind !== 'chapterVoice') return task.percent
  return task.total === 0 ? 0 : Math.floor((task.done * 100) / task.total)
}

export type ChapterTurn = 'now' | 'later' | 'none'

export function turnOf(task: WholeBookTask, chapterId: string): ChapterTurn {
  if (!isActive(task)) return 'none'
  if (task.current?.chapterId === chapterId) return 'now'
  return task.waiting.includes(chapterId) ? 'later' : 'none'
}

export function translationMark({
  chapterId,
  translated,
  task,
}: { chapterId: string } & BookTranslation): string | null {
  if (translated.includes(chapterId)) return 'đã dịch'
  if (!task) return null
  const turn = turnOf(task, chapterId)
  if (turn === 'now') return `đang dịch ${task.current?.percent ?? 0}%`
  return turn === 'later' ? 'chờ dịch' : null
}

export function voiceMark({ chapterId, task }: { chapterId: string; task: BookVoiceTask | null }): string | null {
  if (!task) return null
  if (task.voiced.includes(chapterId)) return 'có giọng'
  const turn = turnOf(task, chapterId)
  if (turn === 'now') return `đang tạo ${task.current?.percent ?? 0}%`
  return turn === 'later' ? 'chờ giọng' : null
}

export type WholeBookOffer =
  | { kind: 'hidden' }
  /** The reader's plan does not have it. */
  | { kind: 'locked' }
  | { kind: 'open' }
  | { kind: 'underWay'; task: WholeBookTask }
  /** Stopped part way; going on is always allowed. */
  | { kind: 'stopped'; task: WholeBookTask }
  | { kind: 'done' }

function offerOfTask(task: WholeBookTask | null): WholeBookOffer | null {
  if (!task) return null
  if (isActive(task)) return { kind: 'underWay', task }
  return task.state === 'stopped' ? { kind: 'stopped', task } : null
}

/** `monthly` is the plan's book translations a month; `standing` is null until loaded. */
export function translateOfferFor({
  foreign,
  chapterCount,
  monthly,
  standing,
}: {
  foreign: boolean
  chapterCount: number
  monthly: number
  standing: BookTranslation | null
}): WholeBookOffer {
  if (!foreign) return { kind: 'hidden' }
  const ofTask = offerOfTask(standing?.task ?? null)
  if (ofTask) return ofTask
  if (standing && standing.translated.length >= chapterCount) return { kind: 'done' }
  return monthly === 0 ? { kind: 'locked' } : { kind: 'open' }
}

export function voiceOfferFor({ allowed, standing }: { allowed: boolean; standing: BookVoice | null }): WholeBookOffer {
  const task = standing?.task ?? null
  const ofTask = offerOfTask(task)
  if (ofTask) return ofTask
  if (task?.state === 'done' && standing?.skipped === 0) return { kind: 'done' }
  return allowed ? { kind: 'open' } : { kind: 'locked' }
}

/** About how many of `chapters` the `left` minutes pay for. */
export function chaptersWithin({
  chapters,
  minutes,
  left,
}: {
  chapters: number
  minutes: number
  left: number
}): number {
  return left >= minutes ? chapters : Math.floor((chapters * left) / minutes)
}

const finishOf = (task: LongTask) => `${task.id}:${task.state}:${task.finishedAt ?? ''}`

/** Finishes not told yet, and what is then known as told. */
export function freshFinishes({ tasks, seen }: { tasks: readonly LongTask[]; seen: readonly string[] }): {
  fresh: LongTask[]
  seen: string[]
} {
  const known = new Set(seen)
  const fresh = tasks.filter((task) => !isActive(task) && !known.has(finishOf(task)))
  return { fresh, seen: [...seen, ...fresh.map(finishOf)] }
}

export function noticeOf(task: LongTask): { text: string; action: string } {
  const stopped = task.state === 'stopped'
  const percent = percentOf(task)
  const words = (() => {
    switch (task.kind) {
      case 'chapterVoice':
        return {
          done: `Đã tạo xong giọng đọc ${task.chapterLabel}.`,
          halted: `Dừng tạo giọng đọc ${task.chapterLabel} ở ${percent}%.`,
          open: 'Nghe ngay',
        }
      case 'bookVoice':
        return {
          done: `Đã tạo xong giọng đọc ${task.bookTitle}.`,
          halted: `Dừng tạo giọng đọc ${task.bookTitle} ở ${percent}%.`,
          open: 'Nghe ngay',
        }
      case 'bookTranslation':
        return {
          done: `Đã dịch xong ${task.bookTitle}.`,
          halted: `Dừng dịch ${task.bookTitle} ở ${percent}%.`,
          open: 'Đọc ngay',
        }
      default: {
        const _exhaustive: never = task
        return _exhaustive
      }
    }
  })()
  return stopped ? { text: words.halted, action: 'Xem tác vụ' } : { text: words.done, action: words.open }
}

/** Why a task stopped, in the reader's words. */
export function failureText(code: string | null): string {
  if (code === 'VOICE_LIMIT') return 'Hết phút giọng qua mạng'
  return code === 'TRANSLATE_FAILED' ? 'Không kết nối được tới máy dịch' : 'Không kết nối được tới máy đọc'
}

export type TaskRow = {
  kind: string
  name: string
  progress: string
  percent: number
  stoppedNote: string
  failure: string
}

export function rowOf(task: LongTask): TaskRow {
  const percent = percentOf(task)
  const words = (() => {
    switch (task.kind) {
      case 'chapterVoice':
        return {
          kind: `Tạo giọng đọc, ${task.voiceName}`,
          name: `${task.chapterLabel}, ${task.bookTitle}`,
          progress: `Câu ${task.done} trên ${task.total}`,
          stoppedNote: `Bị dừng ở ${percent}%, phần đã làm vẫn còn`,
        }
      case 'bookTranslation':
        return {
          kind: 'Dịch cả sách',
          name: task.bookTitle,
          progress: `Chương ${task.done} trên ${task.total}`,
          stoppedNote: `Dịch cả sách, bị dừng ở ${percent}%`,
        }
      case 'bookVoice':
        return {
          kind: `Tạo giọng cả sách, ${task.voiceName}`,
          name: task.bookTitle,
          progress: `Chương ${task.done} trên ${task.total}`,
          stoppedNote: `Tạo giọng cả sách, bị dừng ở ${percent}%`,
        }
      default: {
        const _exhaustive: never = task
        return _exhaustive
      }
    }
  })()
  const queued = task.state === 'queued' && task.position !== null
  return {
    ...words,
    kind: queued ? `${words.kind}, thứ ${task.position} trong hàng` : words.kind,
    percent,
    failure: failureText(task.code),
  }
}

export type TaskGroup = 'running' | 'queued' | 'finished'

export function groupOf({ state }: Pick<LongTask, 'state'>): TaskGroup {
  if (state === 'running') return 'running'
  return state === 'queued' ? 'queued' : 'finished'
}

export const GROUP_NAMES: Record<TaskGroup, string> = { running: 'Đang chạy', queued: 'Đang chờ', finished: 'Đã xong' }
