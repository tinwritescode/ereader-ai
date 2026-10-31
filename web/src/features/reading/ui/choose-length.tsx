import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { Book, ChapterSummary } from '~/features/books/domain/book'
import { isForeign } from '~/features/books/domain/book'
import { durationLabel } from '~/features/books/domain/words'
import { Button } from '~/shared/ui/button'
import { Sheet } from '~/shared/ui/sheet'
import { lengthHint, lengthName, lengthOptionsFor, sameOption } from '../domain/length'
import type { LengthOption, ReadingLength } from '../domain/length'
import { lastLength } from './stores'

function actionLabel({ length, minutes }: LengthOption): string {
  if (length === 'original') return 'Đọc bản gốc'
  if (length === 'vietnamese') return 'Đọc bản tiếng Việt'
  return `Đọc bản ${durationLabel(minutes)}`
}

function chosenLabel({ length, minutes }: LengthOption): string {
  const whole = length === 'original' || length === 'vietnamese'
  return `${lengthName(length)}${whole ? '' : ' còn'} ${durationLabel(minutes)}`
}

export function ChooseLength({
  book,
  chapter,
  top,
  onClose,
}: {
  book: Book
  chapters: ChapterSummary[]
  chapter: ChapterSummary
  top: number
  onClose: () => void
}) {
  const navigate = useNavigate()
  const options = lengthOptionsFor({ chapterMinutes: chapter.minutes, vietnamese: isForeign(book) })
  // The translation is as long as the original, so it is a switch, not a stop on the ruler.
  const ruler = options.filter(({ length }) => length !== 'vietnamese')
  const translation = options.find(({ length }) => length === 'vietnamese')
  const remembered: ReadingLength = lastLength.useValue()
  const [selected, setSelected] = useState(
    ruler.find(({ length }) => length === remembered || (remembered === 'vietnamese' && length === 'original')) ??
      ruler[0],
  )
  const [vietnamese, setVietnamese] = useState(remembered === 'vietnamese')
  if (!selected) return null
  const canTranslate = translation !== undefined && selected.length === 'original'
  const chosen = canTranslate && vietnamese ? translation : selected

  const open = (listen: boolean) => {
    lastLength.write(chosen.length)
    void navigate({
      to: '/books/$bookId/chapters/$chapterId',
      params: { bookId: book.bookId, chapterId: chapter.chapterId },
      search: { ...chosen, ...(listen ? { listen: true } : {}) },
    })
  }

  return (
    <Sheet title="Chọn độ dài" top={top} onClose={onClose}>
      <h2>{`${chapter.label} dài ${durationLabel(chapter.minutes)}`}</h2>
      <p className="soft">Kéo thước tới thời gian bạn có.</p>
      <div className="ruler" role="radiogroup" aria-label="Độ dài">
        {ruler.toReversed().map((option) => (
          <button
            key={option.length}
            type="button"
            role="radio"
            aria-checked={sameOption(option, selected)}
            onClick={() => setSelected(option)}
          >
            {`${option.minutes}'`}
            <small>{lengthName(option.length)}</small>
          </button>
        ))}
      </div>
      {canTranslate && (
        <label className="check">
          <input type="checkbox" checked={vietnamese} onChange={(event) => setVietnamese(event.target.checked)} />
          Tiếng Việt
        </label>
      )}
      <b>{chosenLabel(chosen)}</b>
      <p className="soft">{lengthHint(chosen.length)}</p>
      <Button onClick={() => open(false)}>{actionLabel(chosen)}</Button>
      <Button quiet onClick={() => open(true)}>
        Nghe bản này
      </Button>
    </Sheet>
  )
}
