import { useHotkey } from '@tanstack/react-hotkeys'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Book, ChapterSummary, TextBlock } from '~/features/books/domain/book'
import { chapterName } from '~/features/books/domain/book'
import { durationLabel } from '~/features/books/domain/words'
import type { LengthOption } from '~/features/reading/domain/length'
import { sameOption } from '~/features/reading/domain/length'
import { Button } from '~/shared/ui/button'
import type { ListenSource, ListenState } from '../domain/controller'
import { useListenState, useListening } from './listen-provider'
import { VoiceSheet } from './voice-sheet'
import { failureWords, preparingLine, rateLabel } from './words'

type Marked = { block: number; start: number; end: number } | null
export type PrepareJob = { source: ListenSource; voiceCode: string; sentences: string[] }

type Port = {
  voice: {
    marked: Marked
    start: (args: { blocks: TextBlock[]; option: LengthOption; block: number; offset: number }) => void
    heardHere: (option: LengthOption) => boolean
  }
  bar: (blocks: TextBlock[] | null, option: LengthOption, topBlock: () => number) => ReactNode
}

const isHere = ({ state, chapterId, option }: { state: ListenState; chapterId: string; option: LengthOption }) =>
  state.stage.kind !== 'off' && state.source?.chapterId === chapterId && sameOption(state.source.option, option)

/** Lends the reader the app's one voice, for this chapter. */
export function ListenPort({
  book,
  chapters,
  chapterId,
  option,
  prepare,
  children,
}: {
  book: Book
  chapters: ChapterSummary[]
  chapterId: string
  option: LengthOption
  prepare?: (job: PrepareJob) => ReactNode
  children: (port: Port) => ReactNode
}) {
  const { controller } = useListening()
  const state = useListenState()
  const index = chapters.findIndex((chapter) => chapter.chapterId === chapterId)
  const chapter = chapters[index]
  const next = chapters[index + 1]
  const sourceFor = (chosen: LengthOption): ListenSource | null =>
    chapter
      ? {
          bookId: book.bookId,
          bookTitle: book.title,
          chapterId,
          chapterLabel: chapterName(chapter),
          option: chosen,
          next: next ? { chapterId: next.chapterId, chapterLabel: chapterName(next), minutes: next.minutes } : null,
        }
      : null
  const here = isHere({ state, chapterId, option })
  const { stage } = state
  const port: Port = {
    voice: {
      marked: here && stage.kind === 'playing' ? stage.sentence : null,
      heardHere: (chosen) => isHere({ state: controller.state, chapterId, option: chosen }),
      start: ({ blocks, option: chosen, block, offset }) => {
        const source = sourceFor(chosen)
        if (source) controller.request({ blocks, source, block, offset })
      },
    },
    bar: (blocks, shown, topBlock) =>
      blocks && (
        <ListenBar
          here={here}
          state={state}
          minutes={shown.minutes}
          onStart={() => {
            const source = sourceFor(shown)
            if (source) controller.request({ blocks, source, block: topBlock(), offset: 0 })
          }}
          prepare={(voiceCode) => {
            const source = sourceFor(shown)
            return source && prepare?.({ source, voiceCode, sentences: controller.sentences })
          }}
        />
      ),
  }
  return children(port)
}

function ListenBar({
  here,
  state,
  minutes,
  onStart,
  prepare,
}: {
  here: boolean
  state: ListenState
  minutes: number
  onStart: () => void
  prepare: (voiceCode: string) => ReactNode
}) {
  const { controller } = useListening()
  const [choosing, setChoosing] = useState(false)
  const stage = here ? state.stage : { kind: 'off' as const }
  const playing = stage.kind === 'playing'
  useHotkey('Space', () => controller.togglePause(), { enabled: playing, preventDefault: true })
  useHotkey('ArrowLeft', () => controller.skip(-1), { enabled: playing })
  useHotkey('ArrowRight', () => controller.skip(1), { enabled: playing })
  const voiceButton = (
    <button type="button" className="tools-open" onClick={() => setChoosing(true)} aria-label="Đổi giọng">
      {state.voice?.name ?? 'Chọn giọng'}
    </button>
  )
  return (
    <div className={`dock ${stage.kind}`} role="region" aria-label="Nghe">
      {(() => {
        switch (stage.kind) {
          case 'off':
            return (
              <>
                <button type="button" className="pl" aria-label="Nghe" onClick={onStart}>
                  ▶
                </button>
                <span className="quiet">Nghe từ đoạn đang đọc</span>
                {state.voice && voiceButton}
              </>
            )
          case 'preparing':
            return (
              <>
                <span>{preparingLine(stage)}</span>
                <span className="quiet">
                  {stage.slow
                    ? 'Lượt đầu sau khi nghỉ mất khoảng một phút, các câu sau đọc ngay.'
                    : stage.needed > 0 &&
                      `Đủ ${stage.needed} câu là ${state.voice?.name ?? ''} đọc, để nghe liền mạch.`}
                </span>
                <Button quiet onClick={controller.stop}>
                  Tắt
                </Button>
              </>
            )
          case 'playing': {
            const left = Math.ceil(minutes * (1 - state.done))
            return (
              <>
                {voiceButton}
                <span className="track" aria-hidden="true">
                  <i style={{ width: `${state.done * 100}%` }} />
                </span>
                <div className="where" aria-live="off">
                  <span>{`Câu ${stage.index + 1} trên ${stage.total}`}</span>
                  <span>{`còn ${durationLabel(left)}`}</span>
                </div>
                <button
                  type="button"
                  className="pl"
                  aria-label={stage.paused ? 'Đọc tiếp' : 'Tạm dừng'}
                  onClick={controller.togglePause}
                >
                  {stage.paused ? '▶' : '❚❚'}
                </button>
                <button type="button" aria-label="Lùi một câu" onClick={() => controller.skip(-1)}>
                  ‹ Lùi
                </button>
                <button type="button" aria-label="Tới câu sau" onClick={() => controller.skip(1)}>
                  Tới ›
                </button>
                <button type="button" aria-label={`Tốc độ ${rateLabel(state.rate)}`} onClick={controller.cycleRate}>
                  {`Tốc độ ${rateLabel(state.rate)}`}
                </button>
                {state.voice && prepare(state.voice.code)}
                <Button quiet onClick={controller.stop}>
                  Tắt
                </Button>
              </>
            )
          }
          case 'failed': {
            const { title, text } = failureWords(stage.code)
            return (
              <>
                <span role="alert">
                  <b>{title}</b> <span className="quiet">{text}</span>
                </span>
                <Button quiet onClick={controller.retry}>
                  Thử lại
                </Button>
                <Button quiet onClick={() => setChoosing(true)}>
                  Chọn giọng
                </Button>
                <Button quiet onClick={controller.stop}>
                  Đóng
                </Button>
              </>
            )
          }
          default: {
            const _exhaustive: never = stage
            return _exhaustive
          }
        }
      })()}
      {choosing && (
        <VoiceSheet current={state.voice} onChoose={controller.chooseVoice} onClose={() => setChoosing(false)} />
      )}
    </div>
  )
}
