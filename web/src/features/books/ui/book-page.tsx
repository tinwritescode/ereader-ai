import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { chapterHeading } from '../domain/book'
import type { Book, ChapterSummary } from '../domain/book'
import { BookCover } from './book-cover'
import { useShelf } from './with-book'

const ROW_HEIGHT = 56
const NUMBERED_ROW_HEIGHT = 84

export type LengthChoice = {
  book: Book
  chapters: ChapterSummary[]
  chapter: ChapterSummary
  onClose: () => void
}

function ChapterList({
  chapters,
  currentId,
  onChoose,
  markOf,
}: {
  chapters: ChapterSummary[]
  currentId: string | null
  onChoose: (chapter: ChapterSummary) => void
  markOf: (chapter: ChapterSummary, fallback: ReactNode) => ReactNode
}) {
  const list = useRef<HTMLDivElement>(null)
  const virtual = useWindowVirtualizer({
    count: chapters.length,
    estimateSize: (index) => {
      const chapter = chapters[index]
      return chapter && chapterHeading(chapter).number ? NUMBERED_ROW_HEIGHT : ROW_HEIGHT
    },
    overscan: 8,
    scrollMargin: list.current?.offsetTop ?? 0,
    initialRect: { width: 800, height: 900 },
  })
  return (
    <div ref={list} className="chapters" style={{ height: virtual.getTotalSize() }}>
      {virtual.getVirtualItems().map(({ index, start }) => {
        const chapter = chapters[index]
        if (!chapter) return null
        const { number, title } = chapterHeading(chapter)
        return (
          <button
            key={chapter.chapterId}
            ref={virtual.measureElement}
            data-index={index}
            type="button"
            className={chapter.chapterId === currentId ? 'row on' : 'row'}
            style={{ transform: `translateY(${start - virtual.options.scrollMargin}px)` }}
            onClick={() => onChoose(chapter)}
          >
            <span className="row-text">
              {number && <small>{number}</small>}
              <b>{chapter.chapterId === currentId ? <mark>{title}</mark> : title}</b>
            </span>
            {markOf(chapter, <em className="s">{`${chapter.minutes}'`}</em>)}
            <i aria-hidden="true">›</i>
          </button>
        )
      })}
    </div>
  )
}

type Slots = {
  chooseLength: (choice: LengthChoice) => ReactNode
  aside?: (book: Book, chapters: ChapterSummary[]) => ReactNode
  resume?: (book: Book, chapters: ChapterSummary[]) => ReactNode
  markOf?: (book: Book, chapter: ChapterSummary, fallback: ReactNode) => ReactNode
  currentId?: string | null
}

export function BookPage({
  bookId,
  chooseLength,
  aside,
  resume,
  markOf,
  currentId = null,
}: { bookId: string } & Slots) {
  const { book, chapters } = useShelf(bookId)
  const [chosen, setChosen] = useState<ChapterSummary | null>(null)
  return (
    <>
      <div className="book-head">
        <BookCover book={book} />
        <div>
          <h1>{book.title}</h1>
          <p className="soft">{[book.author, `${book.chapterCount} chương`].filter(Boolean).join(', ')}</p>
          <div className="book-acts">
            {resume?.(book, chapters)}
            {aside?.(book, chapters)}
          </div>
        </div>
      </div>
      <ChapterList
        chapters={chapters}
        currentId={currentId}
        onChoose={setChosen}
        markOf={(chapter, fallback) => (markOf ? markOf(book, chapter, fallback) : fallback)}
      />
      {chosen && chooseLength({ book, chapters, chapter: chosen, onClose: () => setChosen(null) })}
    </>
  )
}
