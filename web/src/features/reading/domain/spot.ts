import { z } from 'zod'
import { LengthOption } from './length'

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
