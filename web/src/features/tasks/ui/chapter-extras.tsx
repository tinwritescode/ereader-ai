import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { Account } from '~/features/account/domain/account'
import { limitsOf } from '~/features/account/domain/account'
import { codeOf, durationLabel, errorMessage } from '~/features/books/domain/words'
import type { ListenSource } from '~/features/listen/domain/controller'
import { isShortened } from '~/features/reading/domain/length'
import { Button } from '~/shared/ui/button'
import { useNotice } from '~/shared/ui/notice'
import { Sheet } from '~/shared/ui/sheet'
import { isActive, percentOf, turnOf } from '../domain/task'
import { tasksQuery, translateFirst, translationQuery, voiceChapter } from '../data/tasks'

/** Shown in place of a translation that is not made yet. */
export function TranslationNotice({
  bookId,
  chapterId,
  onOriginal,
}: {
  bookId: string
  chapterId: string
  onOriginal: () => void
}) {
  const { data } = useQuery(translationQuery(bookId))
  const queryClient = useQueryClient()
  const first = useMutation({
    mutationFn: (id: string) => translateFirst({ data: { id, chapterId } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })
  const task = data?.task ?? null
  const turn = task ? turnOf(task, chapterId) : 'none'
  const title = {
    now: 'Chương này đang được dịch',
    later: 'Chương này đang chờ dịch',
    none: 'Chương này chưa được dịch',
  }[turn]
  const text = {
    now: `Xong ${task?.current?.percent ?? 0}%. Bản dịch sẽ tự hiện.`,
    later: 'Bạn có thể đọc bản gốc trong lúc chờ, hoặc cho chương này dịch trước.',
    none: 'Dịch cả sách ở trang sách.',
  }[turn]
  return (
    <div className="mb-4.5 rounded-xl border border-rule bg-sheet px-3.5 py-3">
      <p className="hand text-[22px]">{title}</p>
      <p className="soft">{text}</p>
      <Button quiet onClick={onOriginal}>
        Đọc bản gốc
      </Button>
      {turn === 'later' && task && (
        <Button quiet busy={first.isPending} onClick={() => first.mutate(task.id)}>
          Dịch chương này trước
        </Button>
      )}
    </div>
  )
}

/** Lets a Max reader have the server read the whole chapter ahead. */
export function PrepareChapter({
  account,
  source,
  voiceCode,
  sentences,
}: {
  account: Account
  source: ListenSource
  voiceCode: string
  sentences: string[]
}) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const notice = useNotice()
  const navigate = useNavigate()
  const { data: tasks = [] } = useQuery(tasksQuery())
  const create = useMutation({
    mutationFn: () =>
      voiceChapter({
        data: {
          bookId: source.bookId,
          chapterId: source.chapterId,
          bookTitle: source.bookTitle,
          chapterLabel: source.chapterLabel,
          // Only a shortened version has its own length to note.
          minutes: isShortened(source.option) ? source.option.minutes : null,
          voiceCode,
          sentences,
        },
      }),
    onSuccess: () => {
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      notice({
        text: `Đang tạo giọng đọc ${source.chapterLabel}. Xong sẽ báo.`,
        action: { label: 'Xem tác vụ', run: () => void navigate({ to: '/tasks' }) },
      })
    },
    onError: (error) => notice({ text: `Chưa tạo được, kiểm tra mạng rồi thử lại. ${errorMessage(codeOf(error))}` }),
  })
  const under = tasks.some(
    (task) => task.kind === 'chapterVoice' && task.chapterId === source.chapterId && isActive(task),
  )
  if (!limitsOf(account).chapterVoice || under || sentences.length === 0) return null
  const left = Math.max(0, limitsOf(account).monthlyVoiceMinutes - account.voiceMinutesUsed)
  return (
    <>
      <button type="button" className="ink-link" onClick={() => setOpen(true)}>
        Tạo sẵn cả chương
      </button>
      {open && (
        <Sheet title="Tạo giọng đọc cả chương" onClose={() => setOpen(false)}>
          <h2 className="sheet-call">Tạo giọng đọc cả chương</h2>
          <p className="soft">Audio làm sẵn, lúc nghe không phải chờ.</p>
          <p className="soft">{`Khoảng ${durationLabel(source.option.minutes)} giọng, còn ${left} phút tháng này. Huỷ thì trả lại phần chưa tạo.`}</p>
          <Button busy={create.isPending} onClick={() => create.mutate()}>
            Tạo giọng đọc
          </Button>
          <Button quiet onClick={() => setOpen(false)}>
            Để sau
          </Button>
        </Sheet>
      )}
    </>
  )
}

/** "tạo giọng đọc 40%" under a cover while a task works on the book. */
export function TaskCaption({ bookId, fallback }: { bookId: string; fallback: React.ReactNode }) {
  const { data: tasks = [] } = useQuery(tasksQuery())
  const working = tasks.findLast((task) => task.bookId === bookId && isActive(task))
  if (!working) return fallback
  const percent = percentOf(working)
  return (
    <span className="hand">
      {working.kind === 'bookTranslation' ? `đang dịch ${percent}%` : `tạo giọng đọc ${percent}%`}
    </span>
  )
}
