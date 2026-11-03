import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Account } from '~/features/account/domain/account'
import { limitsOf, resetLabel } from '~/features/account/domain/account'
import type { Book } from '~/features/books/domain/book'
import { isForeign } from '~/features/books/domain/book'
import { codeOf, durationLabel, errorMessage } from '~/features/books/domain/words'
import type { Voice } from '~/features/listen/domain/controller'
import { Button } from '~/shared/ui/button'
import { SingingBird, TranslatorNut } from '~/shared/ui/critters'
import type { Mood } from '~/shared/ui/critters'
import { useNotice } from '~/shared/ui/notice'
import { Sheet } from '~/shared/ui/sheet'
import { TILE, TileFace } from '~/shared/ui/tile'
import { Track } from '~/shared/ui/track'
import {
  chaptersWithin,
  failureText,
  translateOfferFor,
  translationMark,
  voiceMark,
  voiceOfferFor,
} from '../domain/task'
import type { WholeBookOffer, WholeBookTask } from '../domain/task'
import { bookVoiceQuery, translateBook, translationQuery, voiceBook } from '../data/tasks'
import { useTaskActions } from './use-task-actions'

type Words = { title: string; note: string; doing: string; waiting: string; named: string }
export type StartChapter = { chapterId: string; chapterLabel: string } | null

/** One whole-book job as a tile; [done] is what stands once it is finished, and [critter] who does it. */
function WholeBookRow({
  offer,
  words,
  critter,
  done,
  onOffer,
  onResume,
}: {
  offer: WholeBookOffer
  words: Words
  critter: (mood: Mood) => ReactNode
  done: ReactNode
  onOffer: () => void
  onResume: (task: WholeBookTask) => void
}) {
  switch (offer.kind) {
    case 'hidden':
      return null
    case 'done':
      return done
    case 'open':
      return (
        <button type="button" className={TILE} onClick={onOffer}>
          <TileFace critter={critter('idle')} title={words.title} note={words.note} />
        </button>
      )
    case 'locked':
      return (
        <Link className={`${TILE} [&_.critter]:opacity-55 [&_.critter]:grayscale`} to="/plans">
          <TileFace critter={critter('idle')} title={words.title} note="có trong gói Max" />
        </Link>
      )
    case 'underWay': {
      const { task } = offer
      return (
        <Link className={TILE} to="/tasks">
          <TileFace
            critter={critter('busy')}
            title={
              task.position !== null
                ? `${words.waiting}, thứ ${task.position} trong hàng`
                : `${words.doing}, chương ${task.done} trên ${task.total}`
            }
            note={`${task.percent}%`}
          >
            <Track percent={task.percent} className="w-40" />
          </TileFace>
        </Link>
      )
    }
    case 'stopped':
      return (
        <div className={`${TILE} [&_.tile-title]:text-red`}>
          <TileFace
            critter={critter('tired')}
            title={`${words.named}, bị dừng ở ${offer.task.percent}%`}
            note={failureText(offer.task.code)}
          >
            <Button quiet className="self-start" onClick={() => onResume(offer.task)}>
              Chạy tiếp
            </Button>
          </TileFace>
        </div>
      )
    default: {
      const _exhaustive: never = offer
      return _exhaustive
    }
  }
}

function useStart<Input>(run: (input: Input) => Promise<unknown>, started: string) {
  const queryClient = useQueryClient()
  const notice = useNotice()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      notice({ text: started, action: { label: 'Xem tác vụ', run: () => void navigate({ to: '/tasks' }) } })
    },
    onError: (error) => notice({ text: `Chưa tạo được. ${errorMessage(codeOf(error))}` }),
  })
}

function TranslateSheet({
  book,
  account,
  start,
  onClose,
}: {
  book: Book
  account: Account
  start: StartChapter
  onClose: () => void
}) {
  const monthly = limitsOf(account).monthlyBookTranslations
  const left = monthly - account.bookTranslationsUsed
  const translate = useStart(
    () => translateBook({ data: { bookId: book.bookId, startChapterId: start?.chapterId ?? null } }),
    `Đang dịch ${book.title}. Xong sẽ báo.`,
  )
  return (
    <Sheet title="Dịch cả sách sang tiếng Việt" onClose={onClose}>
      <h2 className="sheet-call">Dịch cả sách sang tiếng Việt</h2>
      <p>
        {start
          ? `AI dịch ${book.chapterCount} chương, bắt đầu từ ${start.chapterLabel} tới hết, rồi quay lại các chương trước.`
          : `AI dịch ${book.chapterCount} chương, từ đầu tới cuối sách.`}
      </p>
      <p className="soft">Mỗi chương xong là đọc được ngay. Trong lúc chờ, bạn vẫn đọc bản gốc như thường.</p>
      <p className="soft">
        {left > 0
          ? `Dùng 1 lượt dịch sách. Tháng này còn ${left} trên ${monthly} lượt.`
          : `Đã dùng hết ${monthly} lượt dịch sách tháng này. Lượt mới có vào ${resetLabel(account)}.`}
      </p>
      {left > 0 && (
        <Button disabled={translate.isPending} onClick={() => translate.mutate(undefined, { onSuccess: onClose })}>
          Dịch cả sách
        </Button>
      )}
      <Button quiet onClick={onClose}>
        Để sau
      </Button>
    </Sheet>
  )
}

function VoiceBookSheet({
  book,
  account,
  start,
  voices,
  onClose,
}: {
  book: Book
  account: Account
  start: StartChapter
  voices: Voice[]
  onClose: () => void
}) {
  const { data: standing } = useQuery(bookVoiceQuery(book.bookId))
  const [voiceCode, setVoiceCode] = useState(voices[0]?.code ?? '')
  const voice = useStart(
    () => voiceBook({ data: { bookId: book.bookId, voiceCode, startChapterId: start?.chapterId ?? null } }),
    `Đang tạo giọng đọc ${book.title}. Xong sẽ báo.`,
  )
  const goTranslate = useStart(
    () => translateBook({ data: { bookId: book.bookId, startChapterId: start?.chapterId ?? null } }),
    `Đang dịch ${book.title}. Xong sẽ báo.`,
  )
  if (!standing) return null
  const left = Math.max(0, limitsOf(account).monthlyVoiceMinutes - account.voiceMinutesUsed)
  const enough = left >= standing.minutes
  const create = (
    <>
      <div role="radiogroup" aria-label="Giọng đọc">
        {voices.map((entry) => (
          <button
            key={entry.code}
            type="button"
            role="radio"
            className="voice-row"
            aria-checked={entry.code === voiceCode}
            onClick={() => setVoiceCode(entry.code)}
          >
            {entry.name}
            {entry.code === voiceCode && <small>đang chọn</small>}
          </button>
        ))}
      </div>
    </>
  )
  if (standing.skipped > 0) {
    return (
      <Sheet title="Sách này cần bản tiếng Việt trước" onClose={onClose}>
        <h2 className="sheet-call">Sách này cần bản tiếng Việt trước</h2>
        <p>{`Giọng đọc chỉ đọc tiếng Việt. Sách có ${standing.chapters + standing.skipped} chương, mới dịch xong ${standing.chapters} chương.`}</p>
        <p className="soft">
          {standing.chapters > 0
            ? 'Tạo giọng cho các chương đã dịch, hoặc dịch nốt rồi tạo giọng sau.'
            : 'Dịch sách trước rồi tạo giọng sau.'}
        </p>
        {standing.chapters > 0 && create}
        {standing.chapters > 0 && (
          <Button
            disabled={voice.isPending || !voiceCode}
            onClick={() => voice.mutate(undefined, { onSuccess: onClose })}
          >
            {`Tạo giọng ${standing.chapters} chương đã dịch`}
          </Button>
        )}
        <Button quiet onClick={() => goTranslate.mutate(undefined, { onSuccess: onClose })}>
          Dịch cả sách trước
        </Button>
        <Button quiet onClick={onClose}>
          Để sau
        </Button>
      </Sheet>
    )
  }
  return (
    <Sheet title="Tạo giọng đọc cả sách" onClose={onClose}>
      <h2 className="sheet-call">Tạo giọng đọc cả sách</h2>
      <p className="soft">Audio làm sẵn, lúc nghe không phải chờ.</p>
      {create}
      <p className="soft">
        {[
          `${standing.chapters} chương, khoảng ${durationLabel(standing.minutes)} giọng. Tháng này còn ${left} phút.`,
          start && `Tạo từ ${start.chapterLabel} tới hết, rồi quay lại các chương trước.`,
          enough
            ? 'Câu đã có giọng không tính phút. Huỷ thì giữ phần đã tạo, không tính phần chưa tạo.'
            : `Đủ khoảng ${chaptersWithin({ chapters: standing.chapters, minutes: standing.minutes, left })} chương. Hết phút thì dừng, phần đã tạo vẫn nghe được. Tháng sau bấm Chạy tiếp để làm nốt.`,
        ]
          .filter(Boolean)
          .join(' ')}
      </p>
      <Button disabled={voice.isPending || !voiceCode} onClick={() => voice.mutate(undefined, { onSuccess: onClose })}>
        {enough ? 'Tạo giọng cả sách' : 'Tạo tới khi hết phút'}
      </Button>
      <Button quiet onClick={onClose}>
        Để sau
      </Button>
    </Sheet>
  )
}

/** The book page's lines about translating and voicing the whole book. */
export function WholeBookRows({
  book,
  account,
  start,
  voices,
}: {
  book: Book
  account: Account
  start: StartChapter
  voices: Voice[]
}) {
  const translation = useQuery(translationQuery(book.bookId))
  const voice = useQuery(bookVoiceQuery(book.bookId))
  const { resume } = useTaskActions()
  const [open, setOpen] = useState<'translate' | 'voice' | null>(null)
  const limits = limitsOf(account)
  const translateOffer = translateOfferFor({
    foreign: isForeign(book),
    chapterCount: book.chapterCount,
    monthly: limits.monthlyBookTranslations,
    standing: translation.data ?? null,
  })
  const voiceOffer = voiceOfferFor({ allowed: limits.chapterVoice, standing: voice.data ?? null })
  return (
    <>
      <WholeBookRow
        offer={translateOffer}
        critter={(mood) => <TranslatorNut mood={mood} />}
        words={{
          title: 'Dịch cả sách sang tiếng Việt',
          note: `gói Max, tháng này còn ${limits.monthlyBookTranslations - account.bookTranslationsUsed} lượt`,
          doing: 'Đang dịch cả sách',
          waiting: 'Chờ dịch cả sách',
          named: 'Dịch cả sách',
        }}
        done={
          // The backend names the file; a plain link lets the browser keep it as a download.
          <a className={TILE} href={`/api/books/${encodeURIComponent(book.bookId)}/translation/epub`} download>
            <TileFace
              critter={<TranslatorNut mood="idle" holdingBook />}
              stamp="xong!"
              title="Tải sách tiếng Việt"
              note="Đã dịch xong, file EPUB"
            />
          </a>
        }
        onOffer={() => setOpen('translate')}
        onResume={resume}
      />
      <WholeBookRow
        offer={voiceOffer}
        critter={(mood) => <SingingBird mood={mood} />}
        words={{
          title: 'Tạo giọng đọc cả sách',
          note: 'gói Max, nghe khỏi chờ',
          doing: 'Đang tạo giọng cả sách',
          waiting: 'Chờ tạo giọng cả sách',
          named: 'Tạo giọng cả sách',
        }}
        done={
          <p className={TILE}>
            <TileFace
              critter={<SingingBird mood="idle" />}
              stamp="xong!"
              title="Đã có giọng đọc cả sách"
              note="Chương nào cũng nghe ngay"
            />
          </p>
        }
        onOffer={() => setOpen('voice')}
        onResume={resume}
      />
      {open === 'translate' && (
        <TranslateSheet book={book} account={account} start={start} onClose={() => setOpen(null)} />
      )}
      {open === 'voice' && (
        <VoiceBookSheet book={book} account={account} start={start} voices={voices} onClose={() => setOpen(null)} />
      )}
    </>
  )
}

// In the margin when there is room; too long for the phone's, so it stays on the row there.
const MARK =
  'font-hand text-[18px] whitespace-nowrap text-red not-italic md:absolute md:left-0 md:w-(--m) md:pr-2.25 md:pl-3 md:text-right md:text-[22px]/7 md:whitespace-normal'

/** A chapter row's note on translation or voice, or the given fallback. */
export function ChapterMark({
  bookId,
  chapterId,
  fallback,
}: {
  bookId: string
  chapterId: string
  fallback: React.ReactNode
}) {
  const translation = useQuery(translationQuery(bookId))
  const voice = useQuery(bookVoiceQuery(bookId))
  const mark =
    (translation.data && translationMark({ chapterId, ...translation.data })) ??
    (voice.data ? voiceMark({ chapterId, task: voice.data.task }) : null)
  return mark ? <em className={MARK}>{mark}</em> : fallback
}
