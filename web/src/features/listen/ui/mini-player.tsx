import { Link, useRouterState } from '@tanstack/react-router'
import { AnimatePresence, m } from 'motion/react'
import { useListenState, useListening } from './listen-provider'

/** Keeps the voice in reach on every page but its own chapter. */
export function MiniPlayer() {
  const { controller } = useListening()
  const state = useListenState()
  const path = useRouterState({ select: (router) => router.location.pathname })
  const { source, stage } = state
  const showing =
    source &&
    stage.kind !== 'off' &&
    decodeURIComponent(path) !== `/books/${source.bookId}/chapters/${source.chapterId}`
  const heard = stage.kind === 'playing' ? controller.sentences[stage.index] : undefined
  return (
    <AnimatePresence>
      {showing && (
        <m.div
          key="mini"
          className="fixed inset-x-2 bottom-3 z-20 flex min-h-17 items-center gap-3 overflow-hidden rounded-xl bg-night px-3.5 text-sm font-semibold text-night-text md:right-10 md:bottom-5 md:left-[calc(var(--m)+var(--gap))] [&_button]:min-h-11 [&_button]:min-w-11"
          role="region"
          aria-label="Đang nghe"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {stage.kind === 'playing' && (
            <button type="button" aria-label={stage.paused ? 'Đọc tiếp' : 'Tạm dừng'} onClick={controller.togglePause}>
              {stage.paused ? '▶' : '❚❚'}
            </button>
          )}
          <Link
            className="min-w-0 flex-1 no-underline"
            to="/books/$bookId/chapters/$chapterId"
            params={{ bookId: source.bookId, chapterId: source.chapterId }}
            search={source.option}
          >
            <strong className="block truncate font-normal">{heard ?? source.bookTitle}</strong>
            <small className="block truncate text-xs/4.25 font-normal text-night-muted">
              {[source.bookTitle, source.chapterLabel, state.voice?.name].filter(Boolean).join(', ')}
            </small>
          </Link>
          <button type="button" onClick={controller.stop}>
            Tắt
          </button>
          <i
            className="absolute bottom-0 left-0 h-[3px] bg-butter"
            aria-hidden="true"
            style={{ width: `${state.done * 100}%` }}
          />
        </m.div>
      )}
    </AnimatePresence>
  )
}
