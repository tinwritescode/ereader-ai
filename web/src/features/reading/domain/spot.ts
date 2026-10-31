import { z } from 'zod'
import { LengthOption } from './length'
import type { ReaderSearch } from './length'

/** Where reading stopped in one book. */
export const ReadingSpot = z.object({
  chapterId: z.string(),
  /** Shown in the library, e.g. "Chương Hai". */
  chapterLabel: z.string(),
  minutesLeft: z.int(),
  /** The version being read; null when the chapter is next but not yet opened. */
  option: LengthOption.nullable(),
  /** The first block at the top of the page when reading stopped. */
  block: z.int(),
  /** The character the voice stopped at inside the block. */
  offset: z.int(),
  /** The words reading stopped on; null when the chapter is not yet opened. */
  quote: z.string().nullable(),
  /** The voice got here, so going on means listening. */
  listened: z.boolean(),
})
export type ReadingSpot = z.infer<typeof ReadingSpot>

export const ReadingSpots = z.record(z.string(), z.unknown()).transform((spots) =>
  Object.fromEntries(
    Object.entries(spots).flatMap(([bookId, value]) => {
      const spot = ReadingSpot.safeParse(value)
      return spot.success ? [[bookId, spot.data]] : []
    }),
  ),
)
export type ReadingSpots = z.infer<typeof ReadingSpots>

export function nextChapterSpot({ chapterId, chapterLabel, minutes, listened }: { chapterId: string; chapterLabel: string; minutes: number; listened: boolean }): ReadingSpot {
  return { chapterId, chapterLabel, minutesLeft: minutes, option: null, block: 0, offset: 0, quote: null, listened }
}

export function minutesLeft({ minutes, read }: { minutes: number; read: number }): number {
  return Math.ceil(minutes * (1 - read))
}

/** Spots are kept oldest first, so the last one of a book still on the shelf was read last. */
export function latestSpot({ spots, bookIds }: { spots: ReadingSpots; bookIds: readonly string[] }): { bookId: string; spot: ReadingSpot } | null {
  const shelf = new Set(bookIds)
  const entry = Object.entries(spots).findLast(([bookId]) => shelf.has(bookId))
  return entry ? { bookId: entry[0], spot: entry[1] } : null
}

/** Puts a book's spot last, as the one read most recently. */
export function withSpot({ spots, bookId, spot }: { spots: ReadingSpots; bookId: string; spot: ReadingSpot }): ReadingSpots {
  const { [bookId]: _old, ...others } = spots
  return { ...others, [bookId]: spot }
}

/** A whole version's length is the chapter's, whatever a link said. */
export function wholeLength({ search, chapterMinutes }: { search: ReaderSearch; chapterMinutes: number }): ReaderSearch | null {
  const whole = search.length === 'original' || search.length === 'vietnamese'
  return whole && search.minutes !== chapterMinutes ? { ...search, minutes: chapterMinutes } : null
}
