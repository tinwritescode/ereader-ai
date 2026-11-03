import { Link } from '@tanstack/react-router'
import type { Book, ChapterSummary } from '~/features/books/domain/book'
import { durationLabel } from '~/features/books/domain/words'
import { TILE } from '~/shared/ui/tile'
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
    <section
      className="mb-line grid grid-cols-1 items-center gap-x-7 gap-y-2 rounded-md border-[1.5px] border-ink bg-sheet px-4 py-3 md:grid-cols-[1fr_auto]"
      aria-label="Đọc tiếp"
    >
      <div>
        <p className="hand text-[20px]/6.5">{leadOf(spot)}</p>
        {spot.quote && (
          <p className="line-clamp-3 max-w-[62ch] text-base/6.5">
            <mark>{spot.quote.trim()}</mark>
          </p>
        )}
        <p className="text-[12.5px]/5.5 text-muted">{`${book.title}, ${spot.chapterLabel}, còn ${durationLabel(spot.minutesLeft)}`}</p>
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

/** A cloth bookmark tucked under the top of the page; a pull on the tile tugs it. */
function Ribbon() {
  return (
    <svg className="ribbon block h-16 w-12 shrink-0 overflow-visible" viewBox="0 0 48 64" aria-hidden="true">
      <path className="fill-red stroke-ink" strokeWidth={1.5} strokeLinejoin="round" d="M17 -2h14v60l-7-6.5-7 6.5Z" />
      <path className="stroke-sheet/45" strokeWidth={1.5} strokeLinecap="round" d="M21 3v44" />
      <path className="fill-ink/15" d="M17 -2h14v5H17Z" />
    </svg>
  )
}

/** The book page's way back to where this book was left. */
export function ResumeLine({ book, chapters }: { book: Book; chapters: ChapterSummary[] }) {
  const spot = readingSpots.useValue()[book.bookId]
  // The device keeps the name the chapter had when last read; the book may have been renamed since.
  const label = chapters.find(({ chapterId }) => chapterId === spot?.chapterId)?.label ?? spot?.chapterLabel
  return spot ? (
    <Link className={TILE} {...spotLink({ book, spot, chapters })}>
      <Ribbon />
      <span className="flex min-w-0 flex-col">
        <span className="tile-title self-start font-hand text-[24px]/7 text-red">{goOnWord(spot)}</span>
        <span className="line-clamp-2 text-[15px]/5 font-semibold">{label}</span>
        <span className="text-[13px]/5 text-muted">{`còn ${durationLabel(spot.minutesLeft)}`}</span>
      </span>
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
