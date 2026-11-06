import type { Heard } from '~/features/listen/domain/controller'
import { reportSession } from '../data/history'
import { REPORT_EVERY_MS, keptSession, sendsNow } from '../domain/history'
import type { HistoryMode, KeptSession, SessionReport } from '../domain/history'

/** Reading and listening are kept apart: the voice may read one chapter while the eyes are on another. */
type Lane = {
  kept: KeptSession | null
  last: SessionReport | null
  lastSentAt: number
  waiting: { id: string; report: SessionReport } | null
  timer: ReturnType<typeof setTimeout> | null
}

const lane = (): Lane => ({ kept: null, last: null, lastSentAt: 0, waiting: null, timer: null })
const lanes: Record<HistoryMode, Lane> = { read: lane(), listen: lane() }

// The voice is left out: changing it mid-chapter is still the same sitting.
const keyOf = (report: SessionReport) => `${report.bookId}:${report.chapterId}:${report.length}:${report.minutes}`

function send(target: Lane, id: string, report: SessionReport): void {
  target.lastSentAt = Date.now()
  // History is kept on the side: a report that fails is folded into the next.
  reportSession({ data: { sessionId: id, report } }).catch(() => {})
}

/** Takes the report waiting its turn off the lane, to send now or to drop for a newer one. */
function takeWaiting(target: Lane): Lane['waiting'] {
  if (target.timer) clearTimeout(target.timer)
  target.timer = null
  const { waiting } = target
  target.waiting = null
  return waiting
}

function flush(target: Lane): void {
  const waiting = takeWaiting(target)
  if (waiting) send(target, waiting.id, waiting.report)
}

/** Tells the account where reading or listening got to, a few seconds apart at most. */
export function recordSession(report: SessionReport): void {
  const target = lanes[report.mode]
  const now = Date.now()
  const session = keptSession({ kept: target.kept, key: keyOf(report), now, newId: () => crypto.randomUUID() })
  if (session.fresh) flush(target)
  target.kept = { id: session.id, key: session.key, lastAt: session.lastAt }
  target.last = report
  if (sendsNow({ fresh: session.fresh, done: report.done, lastSentAt: target.lastSentAt, now })) {
    takeWaiting(target)
    send(target, session.id, report)
    return
  }
  target.waiting = { id: session.id, report }
  target.timer ??= setTimeout(() => flush(target), REPORT_EVERY_MS)
}

/** The account's side of what the voice reads, next to the device's spot. */
export function recordHeardSession(heard: Heard): void {
  const { last } = lanes.listen
  if (heard.kind === 'finished') {
    if (last?.chapterId === heard.source.chapterId) recordSession({ ...last, progress: 1, done: true })
    return
  }
  const { source, sentence, done, voice } = heard
  recordSession({
    mode: 'listen',
    voice: voice.name,
    bookId: source.bookId,
    chapterId: source.chapterId,
    chapterLabel: source.chapterLabel,
    length: source.option.length,
    minutes: source.option.minutes,
    block: sentence.block,
    offset: sentence.start,
    quote: sentence.text.slice(0, 300),
    progress: done,
    done: false,
  })
}
