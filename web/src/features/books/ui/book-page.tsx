import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { chapterHeading } from '../domain/book'
import type { Book, ChapterSummary } from '../domain/book'
import { BookCover } from './book-cover'
import { useShelf } from './with-book'

/** Sits in the margin, against the red line. */
export const MINUTES =
  'absolute left-0 w-(--m) pr-1.75 text-right font-hand text-[22px]/7 not-italic text-red md:pr-2.25 md:pl-3'

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
    <div
      ref={list}
      className="relative mr-[calc(-1*var(--pad))] -ml-[calc(var(--m)+var(--gap))]"
      style={{ height: virtual.getTotalSize() }}
    >
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
            data-current={chapter.chapterId === currentId || undefined}
            className="row group absolute top-0 left-0 flex min-h-14 w-full items-start gap-2.5 border-t-[1.5px] border-[rgb(42_31_110/0.42)] pr-(--pad) pb-line pl-[calc(var(--m)+var(--gap))] text-left hover:bg-[rgb(251_227_107/0.45)]"
            style={{ transform: `translateY(${start - virtual.options.scrollMargin}px)` }}
            onClick={() => onChoose(chapter)}
          >
            <span className="min-w-0 flex-1">
              {number && (
                <small className="block font-hand text-[18px]/7 text-muted group-data-current:text-red">{number}</small>
              )}
              <b className="text-[15.5px]/7 font-semibold text-ink">
                {chapter.chapterId === currentId ? <mark>{title}</mark> : title}
              </b>
            </span>
            {markOf(chapter, <em className={MINUTES}>{`${chapter.minutes}'`}</em>)}
            <i className="text-[22px]/7 not-italic text-ink" aria-hidden="true">
              ›
            </i>
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
      <div className="mb-line grid grid-cols-[68px_1fr] gap-3 md:grid-cols-[110px_1fr] md:gap-5">
        <BookCover book={book} />
        <div>
          <h1 className="max-w-[24em] text-[17px]/[21px] md:text-[26px]/7">{book.title}</h1>
          <p className="soft leading-7!">{[book.author, `${book.chapterCount} chương`].filter(Boolean).join(', ')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-6.5 gap-y-2 [&>.primary]:md:w-auto">
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
