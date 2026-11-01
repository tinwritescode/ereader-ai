import { useState } from 'react'
import type { Book } from '../domain/book'

const COVER =
  'relative block aspect-[1/1.48] origin-left overflow-hidden rounded-[2px_5px_5px_2px] bg-plum text-white transition-transform duration-420 ease-hinge after:absolute after:inset-0 after:bg-[linear-gradient(90deg,rgb(0_0_0/0.22)_3%,rgb(255_255_255/0.2)_4%,transparent_9%)] motion-safe:group-hover/book:-rotate-y-42 motion-safe:group-focus-visible/book:-rotate-y-42 motion-safe:group-active/book:-rotate-y-42'

/** The front of the book: the cover from the EPUB, or else a school notebook with its label filled in. */
function Front({ book }: { book: Book }) {
  const [broken, setBroken] = useState(false)
  if (book.hasCover && !broken) {
    return (
      <img
        className="block size-full object-cover"
        src={`/api/covers/${encodeURIComponent(book.bookId)}`}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <>
      <span className="absolute inset-y-0 left-0 w-[8%] bg-pen" />
      <span className="absolute inset-x-[14%] right-[7%] top-[13%] wrap-anywhere rounded-[3px] bg-white p-[6%] font-hand text-[19px]/[1.15] text-plum">
        {book.title}
        {book.author && <small className="mt-1 block border-t border-rule text-[15px] text-muted">{book.author}</small>}
      </span>
    </>
  )
}

/**
 * A book with pages under its cover. Inside a `group/book` the cover swings open on its spine.
 * Shares its transition name across pages, so the same book flies from the shelf to its own page.
 */
export function BookCover({ book }: { book: Book }) {
  return (
    <span
      data-book
      className="relative block perspective-distant"
      style={{ viewTransitionName: `cover-${book.bookId}` }}
    >
      <span className="pages absolute inset-0" aria-hidden="true" />
      <span data-cover className={COVER}>
        <Front book={book} />
      </span>
    </span>
  )
}
