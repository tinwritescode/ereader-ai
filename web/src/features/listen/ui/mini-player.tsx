import { Link, useRouterState } from '@tanstack/react-router'
import { useListenState, useListening } from './listen-provider'

/** Keeps the voice in reach on every page but its own chapter. */
export function MiniPlayer() {
  const { controller } = useListening()
  const state = useListenState()
  const path = useRouterState({ select: (router) => router.location.pathname })
  const { source, stage } = state
  if (!source || stage.kind === 'off') return null
  const chapterPath = `/books/${source.bookId}/chapters/${source.chapterId}`
  if (decodeURIComponent(path) === chapterPath) return null
  return (
    <div className="bar" role="region" aria-label="Đang nghe">
      {stage.kind === 'playing' && (
        <button
          type="button"
          className="pl"
          aria-label={stage.paused ? 'Đọc tiếp' : 'Tạm dừng'}
          onClick={controller.togglePause}
        >
          {stage.paused ? '▶' : '❚❚'}
        </button>
      )}
      <Link
        to="/books/$bookId/chapters/$chapterId"
        params={{ bookId: source.bookId, chapterId: source.chapterId }}
        search={source.option}
      >
        <b>{source.bookTitle}</b> <span className="quiet">{`${source.chapterLabel}, ${state.voice?.name ?? ''}`}</span>
      </Link>
      <button type="button" className="ink-link" onClick={controller.stop}>
        Tắt
      </button>
    </div>
  )
}
