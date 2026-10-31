import { createStored } from '~/shared/ui/stored'
import { DEFAULT_LOOK, ReadingLook } from '../domain/look'
import { ReadingLength } from '../domain/length'
import { ReadingSpots } from '../domain/spot'
import { withSpot } from '../domain/spot'
import type { ReadingSpot } from '../domain/spot'

export const readingLook = createStored({ key: 'reading.look', schema: ReadingLook, fallback: DEFAULT_LOOK })
export const lastLength = createStored({ key: 'reading.length', schema: ReadingLength, fallback: 'shortened' })
export const readingSpots = createStored({ key: 'reading.spots', schema: ReadingSpots, fallback: {} })

export function recordSpot({ bookId, spot }: { bookId: string; spot: ReadingSpot }): void {
  readingSpots.write(withSpot({ spots: readingSpots.read(), bookId, spot }))
}

export function clearSpot(bookId: string): void {
  const { [bookId]: _gone, ...others } = readingSpots.read()
  readingSpots.write(others)
}
