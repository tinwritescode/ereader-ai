import { z } from 'zod'
import { ReadingLength } from './length'
import type { ReaderSearch } from './length'

const ReportFields = {
  bookId: z.string().min(1),
  chapterId: z.string().min(1),
  chapterLabel: z.string(),
  length: ReadingLength,
  minutes: z.int().min(0),
  block: z.int().min(0),
  offset: z.int().min(0),
  quote: z.string().nullable(),
  progress: z.number().min(0).max(1),
  done: z.boolean(),
}
const TimeFields = { sessionId: z.string(), startedAt: z.coerce.date(), endedAt: z.coerce.date() }

/** What the app reports as reading goes on; a listen names its voice. */
export const SessionReport = z.discriminatedUnion('mode', [
  z.object({ ...ReportFields, mode: z.literal('read') }),
  z.object({ ...ReportFields, mode: z.literal('listen'), voice: z.string().min(1) }),
])
export type SessionReport = z.infer<typeof SessionReport>

/** One sitting with a chapter, as the account keeps it. */
export const HistorySession = z.discriminatedUnion('mode', [
  z.object({ ...ReportFields, ...TimeFields, mode: z.literal('read') }),
  z.object({ ...ReportFields, ...TimeFields, mode: z.literal('listen'), voice: z.string() }),
])
export type HistorySession = z.infer<typeof HistorySession>
export type HistoryMode = HistorySession['mode']

export const HistoryWire = z.object({ recording: z.boolean(), sessions: z.array(HistorySession) })
export type History = z.infer<typeof HistoryWire>

const MINUTE_MS = 60_000
/** A pause longer than this ends the sitting; coming back starts another. */
const SESSION_GAP_MS = 30 * MINUTE_MS
/** Reports in between are folded into the next one. */
export const REPORT_EVERY_MS = 10_000

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
const two = (value: number) => String(value).padStart(2, '0')

function dayLabel({ day, now }: { day: Date; now: Date }): string {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (dayKey(day) === dayKey(now)) return 'Hôm nay'
  if (dayKey(day) === dayKey(yesterday)) return 'Hôm qua'
  return `${WEEKDAYS[day.getDay()]}, ${day.getDate()}/${day.getMonth() + 1}`
}

export function minutesSpent({ startedAt, endedAt }: Pick<HistorySession, 'startedAt' | 'endedAt'>): number {
  return Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / MINUTE_MS))
}

export type HistoryEntry = { session: HistorySession; time: string; minutes: number }
export type HistoryDay = { label: string; minutes: number; entries: HistoryEntry[] }

/** The sessions under the day each began, newest first, each day with its minutes. */
export function historyDays({ sessions, now }: { sessions: HistorySession[]; now: Date }): HistoryDay[] {
  const days = new Map<string, HistoryDay>()
  const newest = sessions.toSorted((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
  for (const session of newest) {
    const key = dayKey(session.startedAt)
    const day = days.get(key) ?? { label: dayLabel({ day: session.startedAt, now }), minutes: 0, entries: [] }
    const minutes = minutesSpent(session)
    day.entries.push({
      session,
      minutes,
      time: `${two(session.startedAt.getHours())}:${two(session.startedAt.getMinutes())}`,
    })
    day.minutes += minutes
    days.set(key, day)
  }
  return [...days.values()]
}

export function statusOf({ done, progress }: Pick<HistorySession, 'done' | 'progress'>): string {
  return done ? 'xong!' : `dừng ở ${Math.round(progress * 100)}%`
}

/** Where a session's link opens: the very spot, or the chapter from the top once it was finished. */
export function resumeOf(session: HistorySession): { label: string; search: ReaderSearch } {
  const listen = session.mode === 'listen'
  const option = { length: session.length, minutes: session.minutes }
  if (session.done)
    return { label: listen ? 'Nghe lại' : 'Đọc lại', search: { ...option, ...(listen ? { listen } : {}) } }
  return {
    label: listen ? 'Nghe tiếp từ đây' : 'Đọc tiếp từ đây',
    search: { ...option, resume: true, block: session.block, offset: session.offset, ...(listen ? { listen } : {}) },
  }
}

export type KeptSession = { id: string; key: string; lastAt: number }

/** The same chapter and version, picked up again soon, is the same sitting. */
export function keptSession({
  kept,
  key,
  now,
  newId,
}: {
  kept: KeptSession | null
  key: string
  now: number
  newId: () => string
}): KeptSession & { fresh: boolean } {
  if (kept && kept.key === key && now - kept.lastAt < SESSION_GAP_MS) return { ...kept, lastAt: now, fresh: false }
  return { id: newId(), key, lastAt: now, fresh: true }
}

export function sendsNow({
  fresh,
  done,
  lastSentAt,
  now,
}: {
  fresh: boolean
  done: boolean
  lastSentAt: number
  now: number
}): boolean {
  return fresh || done || now - lastSentAt >= REPORT_EVERY_MS
}
