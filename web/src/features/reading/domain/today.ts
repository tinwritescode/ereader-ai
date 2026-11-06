import { isForeign } from '~/features/books/domain/book'
import type { Book, ChapterSummary } from '~/features/books/domain/book'
import type { HistorySession } from './history'
import { lengthOptionsFor } from './length'
import type { LengthOption, ReaderSearch } from './length'

/** The minutes a reader can say they have. */
export const BUDGETS = [5, 15, 30] as const
export type Budget = (typeof BUDGETS)[number]

/** Books read last are planned from, at most this many. */
const PLANNED_BOOKS = 3

/** A book with its chapters, in reading order. */
export type Shelf = { book: Book; chapters: ChapterSummary[] }

/** One chapter of today's plan, in the version that fits. */
export type PlanItem = {
  book: Book
  chapter: ChapterSummary
  option: LengthOption
  /** What reading it takes: what is left of it when it goes on from a spot. */
  minutes: number
  search: ReaderSearch
}
export type Plan = { items: PlanItem[]; total: number }

/** Books sessions were kept for, newest first; the first in the library when none were. */
export function planBookIds({ sessions, books }: { sessions: HistorySession[]; books: Book[] }): string[] {
  const known = new Set(books.map(({ bookId }) => bookId))
  const read = [...new Set(sessions.map(({ bookId }) => bookId))].filter((bookId) => known.has(bookId))
  const first = books[0]
  if (read.length === 0) return first ? [first.bookId] : []
  return read.slice(0, PLANNED_BOOKS)
}

/** The chapter the book goes on from, and the session that stopped in it when it was left unfinished. */
function startOf({ chapters, latest }: { chapters: ChapterSummary[]; latest: HistorySession | undefined }) {
  if (!latest) return { from: chapters.findIndex(({ kind }) => kind === 'main'), unfinished: null }
  const at = chapters.findIndex(({ chapterId }) => chapterId === latest.chapterId)
  if (at < 0) return { from: -1, unfinished: null }
  return latest.done ? { from: at + 1, unfinished: null } : { from: at, unfinished: latest }
}

const minutesLeft = ({ minutes, progress }: HistorySession) => Math.max(1, Math.round(minutes * (1 - progress)))

/** The longest version that fits; at a tie, the later one, so a foreign book is read in Vietnamese. */
function fitting({ book, chapter, left }: { book: Book; chapter: ChapterSummary; left: number }) {
  const options = lengthOptionsFor({ chapterMinutes: chapter.minutes, vietnamese: isForeign(book) })
  return options
    .filter(({ minutes }) => minutes <= left)
    .reduce<LengthOption | null>((best, option) => (best && best.minutes > option.minutes ? best : option), null)
}

/** The next chapter of the book in the minutes left: the rest of an unfinished one if it fits, else a version that does. */
function itemFor({
  shelf: { book },
  chapter,
  unfinished,
  left,
}: {
  shelf: Shelf
  chapter: ChapterSummary
  unfinished: HistorySession | null
  left: number
}): PlanItem | null {
  if (unfinished && minutesLeft(unfinished) <= left) {
    const { length, minutes, block, offset } = unfinished
    return {
      book,
      chapter,
      option: { length, minutes },
      minutes: minutesLeft(unfinished),
      search: { length, minutes, resume: true, block, offset },
    }
  }
  const option = fitting({ book, chapter, left })
  return option && { book, chapter, option, minutes: option.minutes, search: option }
}

/** Chapters to read in the minutes given: each book goes on in order, and a chapter that does not fit ends it. */
export function todayPlan({
  budget,
  sessions,
  shelves,
}: {
  budget: number
  sessions: HistorySession[]
  shelves: Shelf[]
}): Plan {
  const items: PlanItem[] = []
  let left = budget
  for (const shelf of shelves) {
    const latest = sessions.find(({ bookId }) => bookId === shelf.book.bookId)
    const { from, unfinished } = startOf({ chapters: shelf.chapters, latest })
    if (from < 0) continue
    for (const [index, chapter] of shelf.chapters.slice(from).entries()) {
      const item = itemFor({ shelf, chapter, unfinished: index === 0 ? unfinished : null, left })
      if (!item) break
      items.push(item)
      left -= item.minutes
    }
  }
  return { items, total: budget - left }
}
