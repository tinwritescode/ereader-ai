import { Link, useNavigate } from '@tanstack/react-router'
import { useDebouncedCallback } from '@tanstack/react-pacer'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { chapterHeading, chapterName, isForeign } from '~/features/books/domain/book'
import type { Book, ChapterSummary, TextBlock } from '~/features/books/domain/book'
import { durationLabel, errorMessage } from '~/features/books/domain/words'
import { Button } from '~/shared/ui/button'
import { Sheet } from '~/shared/ui/sheet'
import { lengthOptionsFor, sameOption } from '../domain/length'
import type { LengthOption, ReaderSearch } from '../domain/length'
import { LINE_SPACINGS, TEXT_SIZES } from '../domain/look'
import { minutesLeft, nextChapterSpot } from '../domain/spot'
import type { ReadingSpot } from '../domain/spot'
import { LookSheet } from './look-sheet'
import { clearSpot, readingLook, readingSpots, recordSpot } from './stores'
import { useChapterText } from './use-chapter-text'

const SAVE_SPOT_MS = 500
const END_SLACK_PX = 24
const TOP_BAR_PX = 60

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

function savedSpotFor({ spot, chapterId, option, blocks }: { spot: ReadingSpot | undefined; chapterId: string; option: LengthOption; blocks: TextBlock[] }): ReadingSpot | null {
  if (!spot?.option || spot.chapterId !== chapterId || !sameOption(spot.option, option)) return null
  return (spot.block > 0 || spot.offset > 0) && spot.block < blocks.length ? spot : null
}

function Block({ block, index, marked, onPick }: { block: TextBlock; index: number; marked: ReaderVoice['marked']; onPick?: (block: number) => void }) {
  const Tag = block.kind === 'heading' ? 'h2' : 'p'
  if (marked?.block !== index) {
    return (
      <Tag data-block={index} onClick={onPick && (() => onPick(index))}>
        {block.text}
      </Tag>
    )
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

export function ReaderPage({
  book,
  chapters,
  chapterId,
  search,
  voice = NO_VOICE,
  bar,
  translationNotice,
}: {
  book: Book
  chapters: ChapterSummary[]
  chapterId: string
  search: ReaderSearch
  voice?: ReaderVoice
  bar?: (blocks: TextBlock[] | null, option: LengthOption, topBlock: () => number) => ReactNode
  translationNotice?: (args: { chapterId: string; onOriginal: () => void }) => ReactNode
}) {
  const navigate = useNavigate()
  const look = readingLook.useValue()
  const [showLook, setShowLook] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const option = useMemo<LengthOption>(() => ({ length: search.length, minutes: search.minutes }), [search.length, search.minutes])
  const index = chapters.findIndex((chapter) => chapter.chapterId === chapterId)
  const chapter = chapters[index]
  const next = chapters[index + 1]
  const text = useChapterText({ chapterId, option })
  const { read, finished } = useRead()
  const left = minutesLeft({ minutes: option.minutes, read })
  const [offer, setOffer] = useState<ReadingSpot | null>(null)
  const placed = useRef<string | null>(null)
  const options = chapter ? lengthOptionsFor({ chapterMinutes: chapter.minutes, vietnamese: isForeign(book) }) : []
  const blocks = text.kind === 'loaded' ? text.blocks : null
  const key = `${chapterId}:${option.length}:${option.minutes}`

  const goTo = useCallback((block: number) => {
    document.querySelector(`[data-block="${block}"]`)?.scrollIntoView({ block: 'start' })
    window.scrollBy(0, -TOP_BAR_PX)
  }, [])

  const remember = useCallback(() => {
    if (offer || !blocks || !chapter || voice.heardHere(option)) return
    if (finished()) {
      if (next) recordSpot({ bookId: book.bookId, spot: nextChapterSpot({ chapterId: next.chapterId, chapterLabel: chapterName(next), minutes: next.minutes, listened: false }) })
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

  const choose = (chosen: LengthOption) => {
    void navigate({ to: '.', search: { ...chosen }, replace: true })
  }
  const original = options.find(({ length }) => length === 'original')
  const heading = chapterHeading(chapter)
  const style: CSSProperties & Record<'--text-size' | '--line-height', string> = {
    '--text-size': `${TEXT_SIZES[look.size]}px`,
    '--line-height': `${LINE_SPACINGS[look.spacing]}`,
  }

  return (
    <div className={`reader ${look.paper === 'night' ? 'night' : ''}`} style={style}>
      <div className="top">
        <Link to="/books/$bookId" params={{ bookId: book.bookId }}>{`‹ ${book.title}, ${chapterName(chapter)}`}</Link>
        <div className="vs" role="group" aria-label="Bản đọc">
          {options.map((entry) => (
            <button key={entry.length} type="button" aria-pressed={sameOption(entry, option)} onClick={() => choose(entry)}>
              {versionName(entry)}
            </button>
          ))}
        </div>
        <button type="button" aria-label="Trang giấy" onClick={() => setShowLook(true)}>
          Aa
        </button>
      </div>
      <div className="pg">
        <div className="pg-column">
          <div className="margin-line" aria-hidden="true">
            <i style={{ height: `${read * 100}%` }} />
            <u>{`còn ${left}'`}</u>
          </div>
          {offer && (
            <div className="offer">
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
          <h1 className="chapter-title">{heading.title}</h1>
          {option.length !== 'original' && <p className="soft">{option.length === 'vietnamese' ? 'AI dịch từ bản gốc' : 'AI viết lại từ bản gốc'}</p>}
          <ReaderBody
            text={text}
            voice={voice}
            onOriginal={original ? () => choose(original) : undefined}
            onPick={bar && !voice.heardHere(option) ? setPicked : undefined}
            translationNotice={translationNotice?.({ chapterId, onOriginal: () => (original ? choose(original) : undefined) })}
          />
          {blocks && (
            <div className="finished">
              <p className="hand">{`Xong ${chapterName(chapter)}`}</p>
              <p className="soft">{next ? `Tiếp theo là ${chapterName(next)}, dài ${durationLabel(next.minutes)}.` : 'Đây là chương cuối.'}</p>
              {next && (
                <Link
                  className="primary"
                  to="/books/$bookId/chapters/$chapterId"
                  params={{ bookId: book.bookId, chapterId: next.chapterId }}
                  search={{ length: 'original', minutes: next.minutes }}
                >
                  {`Đọc ${chapterName(next)}`}
                </Link>
              )}
              <Link className={next ? 'ink-link' : 'primary'} to="/books/$bookId" params={{ bookId: book.bookId }}>
                Về danh sách chương
              </Link>
            </div>
          )}
        </div>
      </div>
      {picked !== null && blocks && (
        <div className="offer" style={{ position: 'fixed', top: 'auto', bottom: 76, left: '50%', transform: 'translateX(-50%)' }}>
          <Button
            quiet
            onClick={() => {
              voice.start({ blocks, option, block: picked, offset: 0 })
              setPicked(null)
            }}
          >
            Nghe từ câu này
          </Button>
          <Button quiet onClick={() => setPicked(null)}>
            Đóng
          </Button>
        </div>
      )}
      {showLook && <LookSheet onClose={() => setShowLook(false)} />}
      {bar?.(blocks, option, topBlock)}
    </div>
  )
}

function DigestLimit({ onOriginal, onClose }: { onOriginal: (() => void) | undefined; onClose: () => void }) {
  return (
    <Sheet title="Hết lượt rút gọn tháng này" onClose={onClose}>
      <h2 className="hand">Hết lượt rút gọn tháng này</h2>
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
  onPick,
  translationNotice,
}: {
  text: ReturnType<typeof useChapterText>
  voice: ReaderVoice
  onOriginal: (() => void) | undefined
  onPick: ((block: number) => void) | undefined
  translationNotice: ReactNode
}) {
  const [limitClosed, setLimitClosed] = useState(false)
  switch (text.kind) {
    case 'loading':
      return <p className="soft">{text.shortening ? 'AI đang rút gọn chương, thường mất 15–30 giây.' : 'Đang mở chương…'}</p>
    case 'failed':
      return (
        <>
          <p className="failure">
            {errorMessage(text.code)}{' '}
            <Button quiet onClick={text.retry}>
              Thử lại
            </Button>
          </p>
          {text.code === 'DIGEST_LIMIT' && !limitClosed && <DigestLimit onOriginal={onOriginal} onClose={() => setLimitClosed(true)} />}
        </>
      )
    case 'untranslated':
      return (
        <>
          {translationNotice}
          <div className="text faded">
            {text.blocks.map((block, index) => (
              <Block key={index} block={block} index={index} marked={null} />
            ))}
          </div>
        </>
      )
    case 'loaded':
      return (
        <div className="text">
          {text.blocks.map((block, index) => (
            <Block key={index} block={block} index={index} marked={voice.marked} onPick={onPick} />
          ))}
        </div>
      )
    default: {
      const _exhaustive: never = text
      return _exhaustive
    }
  }
}
