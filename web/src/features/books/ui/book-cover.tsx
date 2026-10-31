import { useState } from 'react'
import type { Book } from '../domain/book'

const COVER =
  'relative block aspect-[1/1.48] overflow-hidden rounded-[2px_5px_5px_2px] bg-plum text-white shadow-[3px_4px_0_rgb(42_31_110/0.16)] after:absolute after:inset-0 after:bg-[linear-gradient(90deg,rgb(0_0_0/0.22)_3%,rgb(255_255_255/0.2)_4%,transparent_9%)]'

/** The cover from the EPUB, or else a school notebook with its label filled in. */
export function BookCover({ book }: { book: Book }) {
  const [broken, setBroken] = useState(false)
  if (book.hasCover && !broken) {
    return (
      <span className={COVER}>
        <img
          className="block size-full object-cover"
          src={`/api/covers/${encodeURIComponent(book.bookId)}`}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
        />
      </span>
    )
  }
  return (
    <span className={COVER}>
      <span className="absolute inset-y-0 left-0 w-[8%] bg-pen" />
      <span className="absolute inset-x-[14%] right-[7%] top-[13%] wrap-anywhere rounded-[3px] bg-white p-[6%] font-hand text-[19px]/[1.15] text-plum">
        {book.title}
        {book.author && <small className="mt-1 block border-t border-rule text-[15px] text-muted">{book.author}</small>}
      </span>
    </span>
  )
}
