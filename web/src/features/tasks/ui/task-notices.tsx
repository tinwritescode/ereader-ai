import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { m } from 'motion/react'
import { useEffect } from 'react'
import { z } from 'zod'
import { useNotice } from '~/shared/ui/notice'
import { createStored } from '~/shared/ui/stored'
import { freshFinishes, isActive, noticeOf } from '../domain/task'
import type { LongTask } from '../domain/task'
import { tasksQuery } from '../data/tasks'

const seenFinishes = createStored({ key: 'tasks.seen', schema: z.array(z.string()), fallback: [] })

/** The marker circle beside "Tác vụ". */
export function TasksCount() {
  const { data = [] } = useQuery(tasksQuery())
  const active = data.filter(isActive).length
  return active > 0 ? (
    <m.span
      key={active}
      className="mr-0.5 inline-block size-7 rounded-full bg-marker text-center leading-7 text-plum"
      initial={{ scale: 0.6 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 18 }}
    >
      {active}
    </m.span>
  ) : null
}

/** Tells the reader once about each task that finished or stopped, wherever they are. */
export function TaskNotices() {
  const { data } = useQuery(tasksQuery())
  const notice = useNotice()
  const navigate = useNavigate()
  // Device storage and the notice list live outside React.
  useEffect(() => {
    if (!data) return
    const { fresh, seen } = freshFinishes({ tasks: data, seen: seenFinishes.read() })
    if (fresh.length === 0) return
    seenFinishes.write(seen)
    const open = (task: LongTask) => {
      if (task.state === 'stopped') return navigate({ to: '/tasks' })
      if (task.kind !== 'chapterVoice') return navigate({ to: '/books/$bookId', params: { bookId: task.bookId } })
      return navigate({
        to: '/books/$bookId/chapters/$chapterId',
        params: { bookId: task.bookId, chapterId: task.chapterId },
        search:
          task.minutes === null
            ? { length: 'original', minutes: 0, listen: true }
            : { length: 'shortened', minutes: task.minutes, listen: true },
      })
    }
    for (const task of fresh) {
      const { text, action } = noticeOf(task)
      notice({ text, action: { label: action, run: () => void open(task) } })
    }
  }, [data, navigate, notice])
  return null
}
