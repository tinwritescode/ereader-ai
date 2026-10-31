import { Link, useRouterState } from '@tanstack/react-router'
import { useListenState, useListening } from './listen-provider'

/** Keeps the voice in reach on every page but its own chapter. */
export function MiniPlayer() {
  const { controller } = useListening()
  const state = useListenState()
  const path = useRouterState({ select: (router) => router.location.pathname })
  const { source, stage } = state
  if (!source || stage.kind === 'off') return null
  const heard = stage.kind === 'playing' ? controller.sentences[stage.index] : undefined
  const chapterPath = `/books/${source.bookId}/chapters/${source.chapterId}`
  if (decodeURIComponent(path) === chapterPath) return null
  return (
    <div className="mini" role="region" aria-label="Đang nghe">
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
        className="mini-text"
        to="/books/$bookId/chapters/$chapterId"
        params={{ bookId: source.bookId, chapterId: source.chapterId }}
        search={source.option}
      >
        <strong>{heard ?? source.bookTitle}</strong>
        <small>{[source.bookTitle, source.chapterLabel, state.voice?.name].filter(Boolean).join(', ')}</small>
      </Link>
      <button type="button" onClick={controller.stop}>
        Tắt
      </button>
      <i className="mini-done" aria-hidden="true" style={{ width: `${state.done * 100}%` }} />
    </div>
  )
}
