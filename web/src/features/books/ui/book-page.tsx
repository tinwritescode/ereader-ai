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
            className="row group absolute top-0 left-0 flex min-h-14 w-full items-start gap-2.5 border-t-[1.5px] border-ink/42 pr-(--pad) pb-line pl-[calc(var(--m)+var(--gap))] text-left marker-sweep"
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
            <i
              className="text-[22px]/7 not-italic text-ink transition-transform duration-200 ease-hand group-hover:translate-x-1"
              aria-hidden="true"
            >
              ›
            </i>
          </button>
        )
      })}
    </div>
  )
}

type Slots = {
  aside?: (book: Book, chapters: ChapterSummary[]) => ReactNode
  resume?: (book: Book, chapters: ChapterSummary[]) => ReactNode
  markOf?: (book: Book, chapter: ChapterSummary, fallback: ReactNode) => ReactNode
  currentId?: string | null
}

/** A book's page, whoever is reading it. */
export function BookView({
  book,
  chapters,
  onChoose,
  aside,
  resume,
  markOf,
  currentId = null,
}: { book: Book; chapters: ChapterSummary[]; onChoose: (chapter: ChapterSummary) => void } & Slots) {
  const front = chapters.filter(({ kind }) => kind === 'front')
  const [frontOpen, setFrontOpen] = useState(front.some(({ chapterId }) => chapterId === currentId))
  return (
    <>
      {/*
        A wide screen sets the head as three columns of about one height: the cover, the title with the way
        back in, and the actions. Narrower, everything stands on one axis under the cover, so nothing is squeezed.
      */}
      <div className="mb-line grid grid-cols-[68px_minmax(0,1fr)] gap-x-3 gap-y-4 md:grid-cols-[110px_minmax(0,1fr)] md:gap-x-5 lg:grid-cols-[110px_fit-content(26rem)_minmax(16.5rem,20rem)] lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:gap-y-3">
        <div className="lg:row-span-2">
          <BookCover book={book} />
        </div>
        <div>
          <h1 className="max-w-[24em] text-[17px]/[21px] md:text-[26px]/7">{book.title}</h1>
          <p className="soft leading-7!">{[book.author, `${book.chapterCount} chương`].filter(Boolean).join(', ')}</p>
        </div>
        {resume && (
          <div className="col-span-full min-w-0 empty:hidden lg:col-span-1 lg:col-start-2">
            {resume(book, chapters)}
          </div>
        )}
        {aside && (
          <div className="col-span-full min-w-0 lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1">
            {aside(book, chapters)}
          </div>
        )}
      </div>
      {front.length > 0 && (
        <button
          type="button"
          className="hand min-h-11 text-[19px]/7"
          aria-expanded={frontOpen}
          onClick={() => setFrontOpen(!frontOpen)}
        >
          <i className="inline-block not-italic transition-transform duration-200 ease-hinge in-aria-expanded:rotate-90">
            ›
          </i>
          {` Phần đầu sách, ${front.length} mục`}
        </button>
      )}
      <ChapterList
        chapters={frontOpen ? chapters : chapters.filter(({ kind }) => kind === 'main')}
        currentId={currentId}
        onChoose={onChoose}
        markOf={(chapter, fallback) => (markOf ? markOf(book, chapter, fallback) : fallback)}
      />
    </>
  )
}

export function BookPage({
  bookId,
  chooseLength,
  ...slots
}: { bookId: string; chooseLength: (choice: LengthChoice) => ReactNode } & Slots) {
  const { book, chapters } = useShelf(bookId)
  const [chosen, setChosen] = useState<ChapterSummary | null>(null)
  return (
    <>
      <BookView book={book} chapters={chapters} onChoose={setChosen} {...slots} />
      {chosen && chooseLength({ book, chapters, chapter: chosen, onClose: () => setChosen(null) })}
    </>
  )
}
