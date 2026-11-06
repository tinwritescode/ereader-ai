import { describe, expect, it } from 'vitest'
import { HistoryWire, historyDays, keptSession, resumeOf, sendsNow, statusOf } from './history'
import type { HistorySession } from './history'

const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute)

type ReadSession = Extract<HistorySession, { mode: 'read' }>

const session = (over: Partial<ReadSession> = {}): ReadSession => ({
  sessionId: 's1',
  mode: 'read',
  bookId: 'kieu',
  chapterId: 'ch-1',
  chapterLabel: 'Chương Một',
  length: 'shortened',
  minutes: 6,
  block: 4,
  offset: 0,
  quote: 'Kiều càng sắc sảo mặn mà',
  progress: 0.42,
  done: false,
  startedAt: at(6, 21, 0),
  endedAt: at(6, 21, 6),
  ...over,
})
const listened = (over: Partial<ReadSession> = {}): HistorySession => ({
  ...session(over),
  mode: 'listen',
  voice: 'Hạt Dẻ',
})

describe('HistoryWire', () => {
  it('reads dates, and a listen with its voice', () => {
    const parsed = HistoryWire.parse({
      recording: true,
      sessions: [
        {
          ...listened(),
          startedAt: '2026-11-06T14:00:00.000Z',
          endedAt: '2026-11-06T14:05:00.000Z',
        },
      ],
    })
    expect(parsed.sessions[0]).toMatchObject({
      mode: 'listen',
      voice: 'Hạt Dẻ',
      startedAt: new Date('2026-11-06T14:00:00.000Z'),
    })
  })
})

describe('historyDays', () => {
  it('groups sessions by the day they ended, newest first, with the minutes spent', () => {
    const days = historyDays({
      now: at(6, 23),
      sessions: [
        session({ sessionId: 'a', startedAt: at(6, 21, 40), endedAt: at(6, 21, 45) }),
        session({ sessionId: 'b', startedAt: at(6, 21, 12), endedAt: at(6, 21, 18) }),
        session({ sessionId: 'c', startedAt: at(5, 22, 30), endedAt: at(5, 22, 34) }),
        session({ sessionId: 'd', startedAt: at(2, 8, 0), endedAt: at(2, 8, 0) }),
      ],
    })
    expect(
      days.map(({ label, minutes, entries }) => [
        label,
        minutes,
        entries.map((entry) => [entry.session.sessionId, entry.time, entry.minutes]),
      ]),
    ).toEqual([
      [
        'Hôm nay',
        11,
        [
          ['a', '21:40', 5],
          ['b', '21:12', 6],
        ],
      ],
      ['Hôm qua', 4, [['c', '22:30', 4]]],
      ['Thứ Hai, 2/11', 1, [['d', '08:00', 1]]],
    ])
  })
})

describe('statusOf', () => {
  it('says where it stopped, or that it is done', () => {
    expect(statusOf(session())).toBe('dừng ở 42%')
    expect(statusOf(session({ done: true }))).toBe('xong!')
  })
})

describe('resumeOf', () => {
  it('goes on from the spot it stopped at, listening when it was heard', () => {
    expect(resumeOf(listened({ offset: 7 }))).toEqual({
      label: 'Nghe tiếp từ đây',
      search: { length: 'shortened', minutes: 6, resume: true, block: 4, offset: 7, listen: true },
    })
  })

  it('starts a finished chapter over', () => {
    expect(resumeOf(session({ done: true }))).toEqual({ label: 'Đọc lại', search: { length: 'shortened', minutes: 6 } })
  })
})

describe('keptSession', () => {
  const kept = { id: 'old', key: 'ch-1:shortened:6', lastAt: at(6, 21, 0).getTime() }

  it('goes on with the same chapter and version soon after', () => {
    expect(keptSession({ kept, key: kept.key, now: at(6, 21, 20).getTime(), newId: () => 'new' })).toEqual({
      ...kept,
      lastAt: at(6, 21, 20).getTime(),
      fresh: false,
    })
  })

  it('starts anew for another chapter, or after a long break', () => {
    expect(
      keptSession({ kept, key: 'ch-2:original:12', now: at(6, 21, 1).getTime(), newId: () => 'new' }),
    ).toMatchObject({ id: 'new', fresh: true })
    expect(keptSession({ kept, key: kept.key, now: at(6, 22, 1).getTime(), newId: () => 'new' })).toMatchObject({
      id: 'new',
      fresh: true,
    })
    expect(keptSession({ kept: null, key: kept.key, now: 0, newId: () => 'new' })).toMatchObject({
      id: 'new',
      fresh: true,
    })
  })
})

describe('sendsNow', () => {
  it('sends a new or finished session at once, and the rest no more than every few seconds', () => {
    expect(sendsNow({ fresh: true, done: false, lastSentAt: 1_000, now: 1_001 })).toBe(true)
    expect(sendsNow({ fresh: false, done: true, lastSentAt: 1_000, now: 1_001 })).toBe(true)
    expect(sendsNow({ fresh: false, done: false, lastSentAt: 1_000, now: 5_000 })).toBe(false)
    expect(sendsNow({ fresh: false, done: false, lastSentAt: 1_000, now: 11_000 })).toBe(true)
  })
})
