import { Link } from '@tanstack/react-router'
import type { Book, ChapterSummary } from '~/features/books/domain/book'
import { durationLabel } from '~/features/books/domain/words'
import { latestSpot } from '../domain/spot'
import type { ReadingSpot } from '../domain/spot'
import { readingSpots } from './stores'

/** Where a saved spot opens, for a link into the chapter. */
function spotLink({ book, spot, chapters }: { book: Book; spot: ReadingSpot; chapters?: ChapterSummary[] }) {
  const minutes =
    spot.option?.minutes ??
    chapters?.find((chapter) => chapter.chapterId === spot.chapterId)?.minutes ??
    spot.minutesLeft
  return {
    to: '/books/$bookId/chapters/$chapterId',
    params: { bookId: book.bookId, chapterId: spot.chapterId },
    search: {
      ...(spot.option ?? { length: 'original', minutes }),
      resume: true,
      ...(spot.listened ? { listen: true } : {}),
    },
  } as const
}

const goOnWord = (spot: ReadingSpot) => (spot.listened ? 'Nghe tiếp' : 'Đọc tiếp')

function leadOf(spot: ReadingSpot): string {
  if (spot.quote === null) return 'Tiếp theo trong sách'
  return spot.listened ? 'Bạn đã nghe đến đoạn này' : 'Bạn đã đọc đến đoạn này'
}

/** Brings the reader back with the very words they stopped on. */
function ContinueCard({ book, spot }: { book: Book; spot: ReadingSpot }) {
  return (
    <section className="continue" aria-label="Đọc tiếp">
      <div>
        <p className="said">{leadOf(spot)}</p>
        {spot.quote && (
          <p className="quote">
            <mark>{spot.quote.trim()}</mark>
          </p>
        )}
        <p className="where">{`${book.title}, ${spot.chapterLabel}, còn ${durationLabel(spot.minutesLeft)}`}</p>
      </div>
      <Link className="primary" aria-label={`${goOnWord(spot)} ${book.title}`} {...spotLink({ book, spot })}>
        {goOnWord(spot)}
      </Link>
    </section>
  )
}

/** The library's way back into the book read last. */
export function ContinueReading({ books }: { books: Book[] }) {
  const spots = readingSpots.useValue()
  const latest = latestSpot({ spots, bookIds: books.map(({ bookId }) => bookId) })
  const book = latest && books.find(({ bookId }) => bookId === latest.bookId)
  return book && latest ? <ContinueCard book={book} spot={latest.spot} /> : null
}

/** The book page's way back to where this book was left. */
export function ResumeLine({ book, chapters }: { book: Book; chapters: ChapterSummary[] }) {
  const spot = readingSpots.useValue()[book.bookId]
  return spot ? (
    <Link className="primary" {...spotLink({ book, spot, chapters })}>
      {`${goOnWord(spot)} ${spot.chapterLabel}, còn ${durationLabel(spot.minutesLeft)}`}
    </Link>
  ) : null
}

export function SpotCaption({ book }: { book: Book }) {
  const spot = readingSpots.useValue()[book.bookId]
  return spot ? <span className="hand">{`${spot.chapterLabel}, còn ${durationLabel(spot.minutesLeft)}`}</span> : null
}

export function useStartChapter(bookId: string): { chapterId: string; chapterLabel: string } | null {
  const spot = readingSpots.useValue()[bookId]
  return spot ? { chapterId: spot.chapterId, chapterLabel: spot.chapterLabel } : null
}

/** Hands the chapter the reader is on to other features' pages. */
export function WithStartChapter({
  bookId,
  children,
}: {
  bookId: string
  children: (start: { chapterId: string; chapterLabel: string } | null) => React.ReactNode
}) {
  return children(useStartChapter(bookId))
}
