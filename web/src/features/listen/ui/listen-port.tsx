import { useHotkey } from '@tanstack/react-hotkeys'
import { m } from 'motion/react'
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

const DOCK =
  'fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-t-3xl bg-plum px-5.5 pt-3.5 pb-4.5 text-sm text-white lg:top-0 lg:left-auto lg:w-75 lg:content-start lg:items-stretch lg:rounded-l-3xl lg:rounded-tr-none lg:p-6 [&_.ink-link]:px-0 [&_.ink-link]:text-inherit [&_button]:min-h-11'
const START =
  'fixed inset-x-0 bottom-0 z-20 flex min-h-15.5 items-center gap-3 border-t border-rule bg-paper py-2 pr-4 pl-(--m) text-ink md:right-auto md:bottom-auto md:top-[calc(84px+36px*var(--versions)+44px)] md:min-h-0 md:w-[calc(var(--m)-42px)] md:flex-col md:items-end md:gap-0 md:border-0 md:bg-transparent md:p-0'
const QUIET = 'text-[13px] text-white/72'

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
  const docked = stage.kind !== 'off'
  useHotkey('Space', () => controller.togglePause(), { enabled: playing, preventDefault: true })
  useHotkey('ArrowLeft', () => controller.skip(-1), { enabled: playing })
  useHotkey('ArrowRight', () => controller.skip(1), { enabled: playing })
  const voiceButton = (
    <button
      type="button"
      className={
        docked ? 'w-full min-h-11 text-left font-hand text-[25px]/7.5 text-butter' : 'font-hand text-[19px]/7 text-ink'
      }
      onClick={() => setChoosing(true)}
      aria-label="Đổi giọng"
    >
      {state.voice?.name ?? 'Chọn giọng'}
    </button>
  )
  return (
    <m.div
      key={docked ? 'docked' : 'start'}
      data-docked={docked || undefined}
      className={docked ? DOCK : START}
      role="region"
      aria-label="Nghe"
      initial={docked ? { opacity: 0, x: 40 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {(() => {
        switch (stage.kind) {
          case 'off':
            return (
              <>
                <button
                  type="button"
                  className="min-h-11 font-hand text-[21px]/7 text-ink"
                  title="Nghe từ đoạn đang đọc"
                  onClick={onStart}
                >
                  Nghe
                </button>
                {state.voice && voiceButton}
              </>
            )
          case 'preparing':
            return (
              <>
                <span>{preparingLine(stage)}</span>
                <span className={QUIET}>
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
                <span className="mt-2 block h-[3px] w-full bg-[rgb(246_245_252/0.28)]" aria-hidden="true">
                  <i className="block h-[3px] bg-butter" style={{ width: `${state.done * 100}%` }} />
                </span>
                <div className="flex w-full justify-between text-[13px]/6.5 text-white/72" aria-live="off">
                  <span>{`Câu ${stage.index + 1} trên ${stage.total}`}</span>
                  <span>{`còn ${durationLabel(left)}`}</span>
                </div>
                <button
                  type="button"
                  className="h-12 flex-[0_0_48px] rounded-full bg-butter text-base text-plum lg:mx-[calc(50%-36px)] lg:my-3.5 lg:h-15 lg:flex-[0_0_60px]"
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
                  <b>{title}</b> <span className={QUIET}>{text}</span>
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
    </m.div>
  )
}
