import { Link, linkOptions, useNavigate } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { m, useReducedMotion } from 'motion/react'
import { useDebouncedCallback } from '@tanstack/react-pacer'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { chapterHeading, chapterName, isForeign } from '~/features/books/domain/book'
import type { Book, ChapterSummary, TextBlock } from '~/features/books/domain/book'
import { durationLabel, errorMessage } from '~/features/books/domain/words'
import { Button } from '~/shared/ui/button'
import { Sheet } from '~/shared/ui/sheet'
import type { ChapterText } from '../domain/chapter-text'
import { lengthOptionsFor, sameOption } from '../domain/length'
import type { LengthOption, ReaderSearch } from '../domain/length'
import { LINE_SPACINGS, TEXT_SIZES } from '../domain/look'
import { minutesLeft, nextChapterSpot } from '../domain/spot'
import type { ReadingSpot } from '../domain/spot'
import { LookSheet } from './look-sheet'
import { usePickedSpot } from './sentence-pick'
import { clearSpot, readingLook, readingSpots, recordSpot } from './stores'
import { useChapterText } from './use-chapter-text'

const SAVE_SPOT_MS = 500
const END_SLACK_PX = 24
const TOP_BAR_PX = 60
// The margin's tools on a wide window, the bar across the top on a narrow one.
const TOOLS =
  'sticky top-0 z-10 flex h-13 items-center justify-between gap-3 border-b border-rule bg-paper px-3 font-hand text-[21px]/7 whitespace-nowrap text-muted md:fixed md:left-0 md:h-auto md:w-[calc(var(--m)-42px)] md:flex-col md:items-end md:justify-start md:gap-0 md:border-0 md:bg-transparent md:pt-line md:pr-0 md:pl-3.5'

/** What the listening feature lends the page. */
export type ReaderVoice = {
  /** The sentence being heard here, when the voice is on this version of this chapter. */
  marked: { block: number; start: number; end: number } | null
  /** Starts reading these blocks aloud. */
  start: (args: { blocks: TextBlock[]; option: LengthOption; block: number; offset: number }) => void
  /** The voice keeps the spot itself while it reads this version. */
  heardHere: (option: LengthOption) => boolean
}

const NO_VOICE: ReaderVoice = { marked: null, start: () => {}, heardHere: () => false }

function versionName({ length, minutes }: LengthOption): string {
  if (length === 'original') return 'gốc'
  if (length === 'vietnamese') return 'Việt'
  return length === 'keyPoints' ? 'ý chính' : `${minutes} phút`
}

function savedSpotFor({
  spot,
  chapterId,
  option,
  blocks,
}: {
  spot: ReadingSpot | undefined
  chapterId: string
  option: LengthOption
  blocks: TextBlock[]
}): ReadingSpot | null {
  if (!spot?.option || spot.chapterId !== chapterId || !sameOption(spot.option, option)) return null
  return (spot.block > 0 || spot.offset > 0) && spot.block < blocks.length ? spot : null
}

function Block({ block, index, marked }: { block: TextBlock; index: number; marked: ReaderVoice['marked'] }) {
  const Tag = block.kind === 'heading' ? 'h2' : 'p'
  if (marked?.block !== index) {
    return <Tag data-block={index}>{block.text}</Tag>
  }
  return (
    <Tag data-block={index}>
      {block.text.slice(0, marked.start)}
      <mark>{block.text.slice(marked.start, marked.end)}</mark>
      {block.text.slice(marked.end)}
    </Tag>
  )
}

function topBlock(): number {
  for (const node of document.querySelectorAll<HTMLElement>('[data-block]')) {
    if (node.getBoundingClientRect().bottom > TOP_BAR_PX) return Number(node.dataset['block'])
  }
  return 0
}

function useRead(): { read: number; finished: () => boolean } {
  const [read, setRead] = useState(0)
  useEffect(() => {
    const measure = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setRead(max <= 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / max)))
    }
    measure()
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [])
  const finished = useCallback(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    return max <= 0 || window.scrollY >= max - END_SLACK_PX
  }, [])
  return { read, finished }
}

type ReaderSlots = {
  book: Book
  chapters: ChapterSummary[]
  chapterId: string
  search: ReaderSearch
  voice?: ReaderVoice
  bar?: (blocks: TextBlock[] | null, option: LengthOption, topBlock: () => number) => ReactNode
  translationNotice?: (args: { chapterId: string; onOriginal: () => void }) => ReactNode
}

/** The page a chapter is read on, whoever is reading it; [text] and the links come from outside. */
export function Reader({
  book,
  chapters,
  chapterId,
  search,
  text,
  options,
  onChoose,
  contents,
  chapterLink,
  note,
  voice = NO_VOICE,
  bar,
  translationNotice,
}: ReaderSlots & {
  text: ChapterText
  /** The versions on offer here. */
  options: LengthOption[]
  onChoose: (option: LengthOption) => void
  contents: LinkProps
  chapterLink: (chapter: ChapterSummary) => LinkProps
  /** Written in the margin under the tools. */
  note?: ReactNode
}) {
  const look = readingLook.useValue()
  const [showLook, setShowLook] = useState(false)
  const option = useMemo<LengthOption>(
    () => ({ length: search.length, minutes: search.minutes }),
    [search.length, search.minutes],
  )
  const index = chapters.findIndex((chapter) => chapter.chapterId === chapterId)
  const chapter = chapters[index]
  const next = chapters[index + 1]
  const { read, finished } = useRead()
  const left = minutesLeft({ minutes: option.minutes, read })
  const [offer, setOffer] = useState<ReadingSpot | null>(null)
  const placed = useRef<string | null>(null)
  const blocks = text.kind === 'loaded' ? text.blocks : null
  const key = `${chapterId}:${option.length}:${option.minutes}`
  const { picked, clear: clearPicked } = usePickedSpot(Boolean(bar) && !voice.heardHere(option))
  const still = useReducedMotion()

  const goTo = useCallback((block: number) => {
    document.querySelector(`[data-block="${block}"]`)?.scrollIntoView({ block: 'start' })
    window.scrollBy(0, -TOP_BAR_PX)
  }, [])

  const remember = useCallback(() => {
    if (offer || !blocks || !chapter || voice.heardHere(option)) return
    if (finished()) {
      if (next)
        recordSpot({
          bookId: book.bookId,
          spot: nextChapterSpot({
            chapterId: next.chapterId,
            chapterLabel: chapterName(next),
            minutes: next.minutes,
            listened: false,
          }),
        })
      else clearSpot(book.bookId)
      return
    }
    const block = topBlock()
    const max = document.documentElement.scrollHeight - window.innerHeight
    recordSpot({
      bookId: book.bookId,
      spot: {
        chapterId,
        chapterLabel: chapterName(chapter),
        minutesLeft: minutesLeft({ minutes: option.minutes, read: max <= 0 ? 0 : window.scrollY / max }),
        option,
        block,
        offset: 0,
        quote: blocks[block]?.text.slice(0, 120) ?? null,
        listened: false,
      },
    })
  }, [blocks, book.bookId, chapter, chapterId, finished, next, offer, option, voice])

  const rememberPaced = useDebouncedCallback(remember, { wait: SAVE_SPOT_MS })

  useEffect(() => {
    window.addEventListener('scroll', rememberPaced, { passive: true })
    return () => window.removeEventListener('scroll', rememberPaced)
  }, [rememberPaced])

  const place = useEffectEvent(({ opened, at }: { opened: TextBlock[]; at: string }) => {
    if (placed.current === at) return
    const first = placed.current === null
    placed.current = at
    const saved = savedSpotFor({ spot: readingSpots.read()[book.bookId], chapterId, option, blocks: opened })
    if (search.listen && !voice.heardHere(option)) {
      const from = search.resume ? saved : null
      voice.start({ blocks: opened, option, block: from?.block ?? 0, offset: from?.offset ?? 0 })
    }
    if (!first || !saved) {
      remember()
    } else if (search.resume) {
      goTo(saved.block)
    } else {
      setOffer(saved)
    }
  })

  // The opening text decides once whether to ask about the last spot.
  useEffect(() => {
    // Asks once from the saved spot, then the answer is the reader's: rendering must not re-ask.
    // oxlint-disable-next-line react/set-state-in-effect
    if (blocks) place({ opened: blocks, at: key })
  }, [blocks, key])

  // Keeps the sentence being heard on the page.
  const heardBlock = voice.marked?.block
  useEffect(() => {
    if (heardBlock === undefined) return
    document.querySelector(`[data-block="${heardBlock}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [heardBlock])

  if (!chapter) return <p className="failure">{errorMessage('CHAPTER_NOT_FOUND')}</p>

  const original = options.find(({ length }) => length === 'original')
  const heading = chapterHeading(chapter)
  const style: CSSProperties & Record<'--text-size' | '--line-height' | '--versions' | '--note', string> = {
    '--text-size': `${TEXT_SIZES[look.size]}px`,
    '--line-height': `${LINE_SPACINGS[look.spacing]}`,
    '--versions': `${options.length}`,
    '--note': note ? '48px' : '0px',
  }

  return (
    <div
      className={`reader flex min-h-dvh flex-col bg-paper text-text [--col:620px] [--m:40px] md:[--m:max(150px,calc((100vw-var(--dock,0px)-var(--col))/2))] lg:has-data-docked:[--dock:300px] ${look.paper === 'night' ? 'night' : ''}`}
      style={style}
    >
      <div className={TOOLS}>
        <Link className="pen-line text-ink no-underline md:leading-14" {...contents}>
          ‹ Mục lục
        </Link>
        <div
          className="flex gap-2.5 text-[18px] md:flex-col md:items-end md:gap-0 md:text-[21px] [&_button]:min-h-9 [&_button[aria-pressed=true]]:text-red"
          role="group"
          aria-label="Bản đọc"
        >
          {options.map((entry) => (
            <button
              key={entry.length}
              type="button"
              aria-pressed={sameOption(entry, option)}
              onClick={() => onChoose(entry)}
            >
              {versionName(entry)}
            </button>
          ))}
        </div>
        <button type="button" className="min-h-11 text-ink" aria-label="Trang giấy" onClick={() => setShowLook(true)}>
          Aa
        </button>
        {note}
      </div>
      <div className="relative flex-1 pt-line pr-6 pb-60 pl-(--m) lg:pb-40">
        <div className="relative max-w-(--col)">
          <div
            className="absolute -top-line -bottom-60 -left-3.5 w-[3px] bg-rose md:-left-7.5 lg:-bottom-40"
            aria-hidden="true"
          >
            <i className="block bg-red" style={{ height: `${read * 100}%` }} />
            <u className="sticky top-[60vh] -ml-6 block w-max font-hand text-[18px]/7 text-red no-underline md:top-[max(60vh,380px)] md:-ml-8.5 md:text-[22px]">{`${left}'`}</u>
          </div>
          {offer && (
            <div className="sticky top-3 z-5 mb-3.5 flex flex-wrap items-center gap-2 rounded-md border-[1.5px] border-ink bg-sheet px-3.5 py-2.5 text-sm">
              <span>Lần trước bạn đọc đến</span>
              <Button quiet onClick={() => setOffer(null)}>
                Đọc từ đầu
              </Button>
              <Button
                quiet
                onClick={() => {
                  goTo(offer.block)
                  setOffer(null)
                }}
              >
                Đọc tiếp
              </Button>
            </div>
          )}
          {heading.number && <p className="soft">{heading.number}</p>}
          <h1 className="mb-1 text-2xl/8">{heading.title}</h1>
          {option.length !== 'original' && (
            <p className="soft">{option.length === 'vietnamese' ? 'AI dịch từ bản gốc' : 'AI viết lại từ bản gốc'}</p>
          )}
          <ReaderBody
            text={text}
            voice={voice}
            onOriginal={original ? () => onChoose(original) : undefined}
            translationNotice={translationNotice?.({
              chapterId,
              onOriginal: () => (original ? onChoose(original) : undefined),
            })}
          />
          {blocks && (
            <div className="mt-8 flex flex-col gap-1.5">
              <m.p
                key={chapterId}
                className="hand origin-left -rotate-2 text-3xl"
                initial={{ clipPath: 'inset(-12px 100% -12px 0px)' }}
                whileInView={{ clipPath: 'inset(-12px 0% -12px 0px)' }}
                viewport={{ once: true }}
                transition={{ duration: still ? 0 : 0.8, ease: 'easeInOut' }}
              >{`Xong ${chapterName(chapter)}`}</m.p>
              <p className="soft">
                {next
                  ? `Tiếp theo là ${chapterName(next)}, dài ${durationLabel(next.minutes)}.`
                  : 'Đây là chương cuối.'}
              </p>
              {next && (
                <Link className="primary" {...chapterLink(next)}>
                  {`Đọc ${chapterName(next)}`}
                </Link>
              )}
              <Link className={next ? 'ink-link' : 'primary'} {...contents}>
                Về danh sách chương
              </Link>
            </div>
          )}
        </div>
      </div>
      {picked && blocks && (
        <m.div
          className="fixed z-15 flex -translate-y-[calc(100%+8px)] rounded-[14px] bg-plum text-[15px] font-semibold text-white [&_button]:min-h-11 [&_button]:px-3.5 [&_button]:whitespace-nowrap"
          style={{ left: picked.x, top: picked.y }}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.14 }}
        >
          <button
            type="button"
            onClick={() => {
              voice.start({ blocks, option, block: picked.block, offset: picked.offset })
              clearPicked()
            }}
          >
            Nghe từ câu này
          </button>
          <button type="button" className="text-butter" aria-label="Đóng" onClick={clearPicked}>
            ×
          </button>
        </m.div>
      )}
      {showLook && <LookSheet onClose={() => setShowLook(false)} />}
      {bar?.(blocks, option, topBlock)}
    </div>
  )
}

export function ReaderPage(slots: ReaderSlots) {
  const { book, chapters, chapterId, search } = slots
  const navigate = useNavigate()
  const { bookId } = book
  const chapter = chapters.find((entry) => entry.chapterId === chapterId)
  const option = useMemo<LengthOption>(
    () => ({ length: search.length, minutes: search.minutes }),
    [search.length, search.minutes],
  )
  return (
    <Reader
      {...slots}
      text={useChapterText({ chapterId, option })}
      options={chapter ? lengthOptionsFor({ chapterMinutes: chapter.minutes, vietnamese: isForeign(book) }) : []}
      onChoose={(chosen) => void navigate({ to: '.', search: { ...chosen }, replace: true })}
      contents={linkOptions({ to: '/books/$bookId', params: { bookId } })}
      chapterLink={(next) =>
        linkOptions({
          to: '/books/$bookId/chapters/$chapterId',
          params: { bookId, chapterId: next.chapterId },
          search: { length: 'original', minutes: next.minutes },
          viewTransition: { types: ['page-turn'] },
        })
      }
    />
  )
}

function DigestLimit({ onOriginal, onClose }: { onOriginal: (() => void) | undefined; onClose: () => void }) {
  return (
    <Sheet title="Hết lượt rút gọn tháng này" onClose={onClose}>
      <h2 className="sheet-call">Hết lượt rút gọn tháng này</h2>
      <p>Bạn đã dùng hết lượt của gói này.</p>
      <Button onClick={onOriginal}>Đọc bản gốc</Button>
      <Link className="ink-link" to="/plans">
        Xem các gói
      </Link>
    </Sheet>
  )
}

function ReaderBody({
  text,
  voice,
  onOriginal,
  translationNotice,
}: {
  text: ChapterText
  voice: ReaderVoice
  onOriginal: (() => void) | undefined
  translationNotice: ReactNode
}) {
  const [limitClosed, setLimitClosed] = useState(false)
  switch (text.kind) {
    case 'loading':
      return (
        <p className="soft">{text.shortening ? 'AI đang rút gọn chương, thường mất 15–30 giây.' : 'Đang mở chương…'}</p>
      )
    case 'failed':
      return (
        <>
          <p className="failure">
            {errorMessage(text.code)}{' '}
            <Button quiet onClick={text.retry}>
              Thử lại
            </Button>
          </p>
          {text.code === 'DIGEST_LIMIT' && !limitClosed && (
            <DigestLimit onOriginal={onOriginal} onClose={() => setLimitClosed(true)} />
          )}
        </>
      )
    case 'untranslated':
      return (
        <>
          {translationNotice}
          <div className="text faded reading-text opacity-55">
            {text.blocks.map((block, index) => (
              <Block key={index} block={block} index={index} marked={null} />
            ))}
          </div>
        </>
      )
    case 'loaded':
      return (
        <div className="text reading-text">
          {text.blocks.map((block, index) => (
            <Block key={index} block={block} index={index} marked={voice.marked} />
          ))}
        </div>
      )
    default: {
      const _exhaustive: never = text
      return _exhaustive
    }
  }
}
