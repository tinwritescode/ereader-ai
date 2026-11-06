import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState, useSyncExternalStore } from 'react'
import type { Book } from '~/features/books/domain/book'
import { codeOf, durationLabel, errorMessage } from '~/features/books/domain/words'
import { Button } from '~/shared/ui/button'
import { clearHistory, historyQuery, removeSession, setRecording } from '../data/history'
import { historyDays, resumeOf, statusOf } from '../domain/history'
import type { HistoryEntry, HistoryMode, HistorySession } from '../domain/history'
import { lengthName } from '../domain/length'
import { CHOICE_PILL, LINE_NOTE } from './notebook'

type Filter = HistoryMode | 'all'
const FILTERS: { filter: Filter; label: string }[] = [
  { filter: 'all', label: 'Tất cả' },
  { filter: 'read', label: 'Đọc' },
  { filter: 'listen', label: 'Nghe' },
]

const BOOK_ICON = 'M5 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H5zM19 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z'
const EARS_ICON = 'M4 15v-3a8 8 0 0 1 16 0v3M3 14h5v7H5a2 2 0 0 1-2-2zM21 14h-5v7h3a2 2 0 0 0 2-2z'

const unchanging = () => () => {}

/** Days and times are the reader's own; the server knows neither, so it draws none. */
function useReaderClock(): Date | null {
  const inBrowser = useSyncExternalStore(
    unchanging,
    () => true,
    () => false,
  )
  const [now] = useState(() => new Date())
  return inBrowser ? now : null
}

function versionWord(length: HistorySession['length']): string {
  const name = lengthName(length)
  return length === 'vietnamese' ? name : name.toLowerCase()
}

function metaOf({ session, minutes, title }: { session: HistorySession; minutes: number; title: string }): string {
  const voice = session.mode === 'listen' ? [`nghe giọng ${session.voice}`] : []
  return [title, versionWord(session.length), ...voice, durationLabel(minutes)].join(' · ')
}

function ModeIcon({ mode }: { mode: HistoryMode }) {
  const listen = mode === 'listen'
  return (
    <span
      className={`grid size-10 flex-none place-items-center rounded-full ${listen ? 'bg-night text-butter' : 'border-[1.5px] border-rule bg-sheet text-ink'}`}
      aria-hidden="true"
    >
      <svg
        className="size-5 fill-none stroke-current stroke-2"
        viewBox="0 0 24 24"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={listen ? EARS_ICON : BOOK_ICON} />
      </svg>
    </span>
  )
}

function Line({ entry: { session, time, minutes }, title }: { entry: HistoryEntry; title: string }) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => removeSession({ data: { sessionId: session.sessionId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: historyQuery().queryKey }),
  })
  const resume = resumeOf(session)
  return (
    <li className="relative flex flex-wrap items-start gap-x-5 gap-y-2.5 border-t-[1.5px] border-ink/40 py-3">
      <span className={LINE_NOTE}>{time}</span>
      <ModeIcon mode={session.mode} />
      <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-0.5">
        <b className="text-[15.5px]/6 font-semibold text-ink">{session.chapterLabel}</b>
        <small className="text-[13px]/4.5 text-muted">{metaOf({ session, minutes, title })}</small>
        {session.quote && (
          <p className="mt-1.5 line-clamp-3 max-w-[62ch] text-[15px]/6">
            <mark>{session.quote.trim()}</mark>
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={`font-hand text-[19px]/6 ${session.done ? 'text-ink' : 'text-red'}`}>{statusOf(session)}</span>
        <Link
          className={`flex min-h-11 items-center rounded-full border-[1.5px] border-ink px-4 text-sm/4.5 font-semibold no-underline ${session.done ? 'text-ink' : 'bg-ink text-white'}`}
          to="/books/$bookId/chapters/$chapterId"
          params={{ bookId: session.bookId, chapterId: session.chapterId }}
          search={resume.search}
        >
          {resume.label}
        </Link>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-full text-muted hover:text-red disabled:opacity-50"
          aria-label="Xoá dòng này khỏi lịch sử"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          <svg
            className="size-4.5 fill-none stroke-current stroke-2"
            viewBox="0 0 24 24"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
          </svg>
        </button>
      </div>
      {remove.error && <p className="failure w-full">{errorMessage(codeOf(remove.error))}</p>}
    </li>
  )
}

function Keeping({ recording, empty }: { recording: boolean; empty: boolean }) {
  const queryClient = useQueryClient()
  const [asking, setAsking] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: historyQuery().queryKey })
  const toggle = useMutation({ mutationFn: (on: boolean) => setRecording({ data: { on } }), onSuccess: refresh })
  const clear = useMutation({
    mutationFn: () => clearHistory(),
    onSuccess: () => {
      setAsking(false)
      return refresh()
    },
  })
  const failure = toggle.error ?? clear.error
  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t-[1.5px] border-ink/40 pt-3.5">
      <label className="flex min-h-11 items-center gap-2.5 text-[14.5px]/5 text-ink">
        <input
          className="size-4.5 accent-ink"
          type="checkbox"
          checked={toggle.isPending ? toggle.variables : recording}
          disabled={toggle.isPending}
          onChange={(event) => toggle.mutate(event.target.checked)}
        />
        Ghi lịch sử khi đọc và nghe
      </label>
      {!empty &&
        (asking ? (
          <span className="flex flex-wrap items-center gap-2 text-[14.5px]/5">
            Xoá hết, không lấy lại được?
            <Button quiet className="text-red" busy={clear.isPending} onClick={() => clear.mutate()}>
              Xoá hết
            </Button>
            <Button quiet onClick={() => setAsking(false)}>
              Thôi
            </Button>
          </span>
        ) : (
          <Button quiet className="text-red" onClick={() => setAsking(true)}>
            Xoá toàn bộ lịch sử
          </Button>
        ))}
      {failure && <p className="failure w-full">{errorMessage(codeOf(failure))}</p>}
    </div>
  )
}

/** Every sitting with a chapter, by day, each a way back to the words it stopped on. */
export function HistoryPage({ books }: { books: Book[] }) {
  const { recording, sessions } = useSuspenseQuery(historyQuery()).data
  const [filter, setFilter] = useState<Filter>('all')
  const [bookId, setBookId] = useState('')
  const titles = new Map(books.map((book) => [book.bookId, book.title]))
  const read = new Set(sessions.map((session) => session.bookId))
  const shown = sessions.filter(
    (session) => (filter === 'all' || session.mode === filter) && (bookId === '' || session.bookId === bookId),
  )
  const now = useReaderClock()
  const days = now ? historyDays({ sessions: shown, now }) : []
  return (
    <>
      <h1>Lịch sử đọc và nghe</h1>
      <p className="soft mb-4">
        Lưu trên tài khoản, nên máy nào đăng nhập cũng thấy. Mỗi lần đọc hay nghe là một dòng, mở lại đúng câu đã dừng.
      </p>
      {sessions.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <div className="flex gap-1.5" role="group" aria-label="Lọc theo cách">
            {FILTERS.map((entry) => (
              <button
                key={entry.filter}
                type="button"
                className={CHOICE_PILL}
                aria-pressed={filter === entry.filter}
                onClick={() => setFilter(entry.filter)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            Sách
            <select
              className="min-h-11 rounded-[10px] border-[1.5px] border-ink bg-sheet px-3 text-sm text-ink"
              value={bookId}
              onChange={(event) => setBookId(event.target.value)}
            >
              <option value="">Mọi sách</option>
              {books
                .filter((book) => read.has(book.bookId))
                .map((book) => (
                  <option key={book.bookId} value={book.bookId}>
                    {book.title}
                  </option>
                ))}
            </select>
          </label>
        </div>
      )}
      <div className="flex flex-col gap-7">
        {days.map((day) => (
          <section key={day.label}>
            <h2 className="mb-1 font-hand text-[24px]/7 font-normal text-ink">
              {day.label} <span className="text-red">{`· ${durationLabel(day.minutes)}`}</span>
            </h2>
            <ul>
              {day.entries.map((entry) => (
                <Line
                  key={entry.session.sessionId}
                  entry={entry}
                  title={titles.get(entry.session.bookId) ?? 'Sách đã xoá'}
                />
              ))}
            </ul>
          </section>
        ))}
        {now && days.length === 0 && (
          <p className="font-hand text-[22px]/7 text-muted">
            {sessions.length === 0
              ? 'Chưa có lần đọc hay nghe nào. Mở một chương, lịch sử sẽ ghi ở đây.'
              : 'Chưa có lần nào ở mục này.'}
          </p>
        )}
      </div>
      <Keeping recording={recording} empty={sessions.length === 0} />
    </>
  )
}
