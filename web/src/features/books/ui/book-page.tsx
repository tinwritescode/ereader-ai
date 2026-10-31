import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { chapterHeading } from '../domain/book'
import type { Book, ChapterSummary } from '../domain/book'
import { durationLabel } from '../domain/words'
import { BookCover } from './book-cover'
import { useShelf } from './with-book'

const ROW_HEIGHT = 46

export type LengthChoice = { book: Book; chapters: ChapterSummary[]; chapter: ChapterSummary; top: number; onClose: () => void }

function ChapterList({ chapters, onChoose, markOf }: { chapters: ChapterSummary[]; onChoose: (chapter: ChapterSummary, top: number) => void; markOf: (chapter: ChapterSummary) => ReactNode }) {
  const list = useRef<HTMLDivElement>(null)
  const virtual = useWindowVirtualizer({
    count: chapters.length,
    estimateSize: () => ROW_HEIGHT,
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
            type="button"
            className="row"
            style={{ position: 'absolute', top: 0, left: 0, height: ROW_HEIGHT, transform: `translateY(${start - virtual.options.scrollMargin}px)` }}
            onClick={(event) => onChoose(chapter, event.currentTarget.getBoundingClientRect().top)}
          >
            <span>{number ? `${number}. ${title}` : title}</span>
            {markOf(chapter) ?? <em className="s">{durationLabel(chapter.minutes)}</em>}
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
  markOf?: (book: Book, chapter: ChapterSummary) => ReactNode
}

export function BookPage({ bookId, chooseLength, aside, resume, markOf }: { bookId: string } & Slots) {
  const { book, chapters } = useShelf(bookId)
  const [chosen, setChosen] = useState<{ chapter: ChapterSummary; top: number } | null>(null)
  return (
    <div className="two">
      <div className="book-side">
        <BookCover book={book} />
        <div>{aside?.(book, chapters)}</div>
      </div>
      <div className="book-main">
        <h1>{book.title}</h1>
        <p className="soft">{[book.author, `${book.chapterCount} chương`].filter(Boolean).join(', ')}</p>
        {resume?.(book, chapters)}
        <ChapterList chapters={chapters} onChoose={(chapter, top) => setChosen({ chapter, top })} markOf={(chapter) => markOf?.(book, chapter)} />
      </div>
      {chosen && chooseLength({ book, chapters, chapter: chosen.chapter, top: chosen.top, onClose: () => setChosen(null) })}
    </div>
  )
}
