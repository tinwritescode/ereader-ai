import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { Book, ChapterSummary } from '~/features/books/domain/book'
import { isForeign } from '~/features/books/domain/book'
import { durationLabel } from '~/features/books/domain/words'
import { Button } from '~/shared/ui/button'
import { Ruler } from '~/shared/ui/ruler'
import { Sheet } from '~/shared/ui/sheet'
import { lengthHint, lengthName, lengthOptionsFor } from '../domain/length'
import type { LengthOption, ReadingLength } from '../domain/length'
import { lastLength } from './stores'

function actionLabel({ length, minutes }: LengthOption): string {
  if (length === 'original') return 'Đọc bản gốc'
  if (length === 'vietnamese') return 'Đọc bản tiếng Việt'
  return `Đọc bản ${durationLabel(minutes)}`
}

const MAX_TICKS = 16

/** Every `step` minutes along the ruler, as fractions of the longest version. */
function ticksFor(longest: number): number[] {
  const step = Math.ceil(longest / MAX_TICKS)
  return Array.from({ length: Math.floor(longest / step) + 1 }, (_, index) => (index * step) / longest)
}

function chosenLabel({ length, minutes }: LengthOption): string {
  const whole = length === 'original' || length === 'vietnamese'
  return `${lengthName(length)}${whole ? '' : ' còn'} ${durationLabel(minutes)}`
}

export function ChooseLength({
  book,
  chapter,
  onClose,
}: {
  book: Book
  chapters: ChapterSummary[]
  chapter: ChapterSummary
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
  const longest = Math.max(...ruler.map(({ minutes }) => minutes))
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
    <Sheet title="Chọn độ dài" onClose={onClose}>
      <h2>{`${chapter.label} dài ${durationLabel(chapter.minutes)}`}</h2>
      <p className="soft">Kéo thước tới thời gian bạn có.</p>
      <Ruler
        label="Độ dài"
        selectedId={selected.length}
        ticks={ticksFor(longest)}
        stops={ruler.toReversed().map((option) => ({
          id: option.length,
          fraction: option.minutes / longest,
          label: (
            <>
              {`${option.minutes}'`}
              <small>{lengthName(option.length)}</small>
            </>
          ),
        }))}
        onChoose={(id) => setSelected(ruler.find(({ length }) => length === id) ?? selected)}
      />
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
