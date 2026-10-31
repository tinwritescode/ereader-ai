import { useState } from 'react'
import type { Book } from '../domain/book'

/** The cover from the EPUB, or else a school notebook with its label filled in. */
export function BookCover({ book }: { book: Book }) {
  const [broken, setBroken] = useState(false)
  if (book.hasCover && !broken) {
    return (
      <span className="cover">
        <img
          src={`/api/covers/${encodeURIComponent(book.bookId)}`}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
        />
      </span>
    )
  }
  return (
    <span className="cover">
      <span className="cover-spine" />
      <span className="cover-label">
        {book.title}
        {book.author && <small>{book.author}</small>}
      </span>
    </span>
  )
}
