import { Link } from '@tanstack/react-router'
import { chapterName, isForeign } from '~/features/books/domain/book'
import type { Book, ChapterSummary } from '~/features/books/domain/book'
import { lengthOptionsFor, lengthWord } from '../domain/length'
import { lastLength } from './stores'

const PILL =
  'flex min-h-11 items-center rounded-full border-[1.5px] border-ink/35 bg-sheet px-2.5 font-hand text-[17px]/6 md:px-3 md:text-[18px]/6 whitespace-nowrap text-ink no-underline transition-colors hover:border-ink hover:bg-marker/45 focus-visible:border-ink'

/** Every version of a chapter with its minutes, one press from reading it. */
export function LengthPills({ book, chapter }: { book: Book; chapter: ChapterSummary }) {
  const options = lengthOptionsFor({ chapterMinutes: chapter.minutes, vietnamese: isForeign(book) })
  return (
    <span className="flex flex-wrap gap-1 md:gap-1.5" role="group" aria-label={`Độ dài ${chapterName(chapter)}`}>
      {options.map((option) => (
        <Link
          key={option.length}
          className={PILL}
          to="/books/$bookId/chapters/$chapterId"
          params={{ bookId: book.bookId, chapterId: chapter.chapterId }}
          search={option}
          onClick={() => lastLength.write(option.length)}
        >
          {`${option.minutes}' ${lengthWord(option.length)}`}
        </Link>
      ))}
    </span>
  )
}
