import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { HistorySession } from '../domain/history'
import { lengthWord } from '../domain/length'
import { BUDGETS, todayPlan } from '../domain/today'
import type { Budget, PlanItem, Shelf } from '../domain/today'
import { CHOICE_PILL, LINE_NOTE } from './notebook'

const DEFAULT_BUDGET: Budget = 15

const readerLink = ({ book, chapter }: PlanItem) =>
  ({
    to: '/books/$bookId/chapters/$chapterId',
    params: { bookId: book.bookId, chapterId: chapter.chapterId },
  }) as const

function PlanLine({ item }: { item: PlanItem }) {
  const goesOn = item.search.resume === true ? ['đọc tiếp chỗ dừng'] : []
  return (
    <li className="flex items-start gap-x-2 border-t-[1.5px] border-ink/40 py-3">
      <span className={LINE_NOTE}>{`${item.minutes}'`}</span>
      <span className="flex min-w-0 flex-col">
        <Link
          className="self-start text-[15.5px]/6 font-semibold text-ink no-underline"
          {...readerLink(item)}
          search={item.search}
        >
          {item.chapter.label}
        </Link>
        <small className="text-[13px]/4.5 text-muted">
          {[item.book.title, lengthWord(item.option.length), ...goesOn].join(' · ')}
        </small>
      </span>
    </li>
  )
}

/** Starts from the minutes the reader has, and fills them with the chapters waiting. */
export function TodayPage({ sessions, shelves }: { sessions: HistorySession[]; shelves: Shelf[] }) {
  const [budget, setBudget] = useState<Budget>(DEFAULT_BUDGET)
  const plan = todayPlan({ budget, sessions, shelves })
  const [first] = plan.items
  return (
    <>
      <h1>Hôm nay</h1>
      <p className="soft mb-4">Có bao nhiêu phút, đọc vừa bấy nhiêu: phần còn dở trước, rồi các chương kế tiếp.</p>
      <div className="flex gap-1.5" role="group" aria-label="Số phút">
        {BUDGETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className={CHOICE_PILL}
            aria-pressed={budget === minutes}
            onClick={() => setBudget(minutes)}
          >
            {`${minutes}'`}
          </button>
        ))}
      </div>
      {first ? (
        <>
          <ol className="mt-7" aria-label="Kế hoạch">
            {plan.items.map((item) => (
              <PlanLine key={item.chapter.chapterId} item={item} />
            ))}
          </ol>
          <div className="mt-6 grid max-w-md justify-items-start gap-1">
            <Link className="primary" {...readerLink(first)} search={first.search}>
              {`Đọc ${plan.total} phút này`}
            </Link>
            <Link className="ink-link" {...readerLink(first)} search={{ ...first.search, listen: true }}>
              Nghe thay vì đọc
            </Link>
          </div>
        </>
      ) : (
        <p className="mt-7 font-hand text-[22px]/7 text-muted">
          {shelves.length === 0
            ? 'Thư viện chưa có sách nào để đọc.'
            : `Không còn chương nào vừa ${budget} phút. Thử nhiều phút hơn.`}
        </p>
      )}
    </>
  )
}
