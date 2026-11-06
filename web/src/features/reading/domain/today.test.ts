import { describe, expect, it } from 'vitest'
import type { Book, ChapterSummary } from '~/features/books/domain/book'
import type { HistorySession } from './history'
import { planBookIds, todayPlan } from './today'

const book = (bookId: string, language = 'vi'): Book => ({
  bookId,
  title: `Sách ${bookId}`,
  author: null,
  language,
  hasCover: false,
  chapterCount: 3,
  minutes: 30,
})

const chapter = (chapterId: string, minutes: number, kind: ChapterSummary['kind'] = 'main'): ChapterSummary => ({
  chapterId,
  label: `Chương ${chapterId}`,
  subtitle: null,
  kind,
  minutes,
})

const read = (over: Partial<Extract<HistorySession, { mode: 'read' }>>): HistorySession => ({
  sessionId: 's',
  mode: 'read',
  bookId: 'kieu',
  chapterId: 'k1',
  chapterLabel: 'Chương k1',
  length: 'original',
  minutes: 12,
  block: 4,
  offset: 9,
  quote: null,
  progress: 0.5,
  done: false,
  startedAt: new Date(2026, 10, 6, 21),
  endedAt: new Date(2026, 10, 6, 21, 6),
  ...over,
})

const kieu = { book: book('kieu'), chapters: [chapter('k0', 1, 'front'), chapter('k1', 12), chapter('k2', 12)] }

const brief = (plan: ReturnType<typeof todayPlan>) =>
  plan.items.map(({ chapter: { chapterId }, option, minutes, search }) => [
    chapterId,
    option.length,
    minutes,
    search.resume ?? false,
  ])

describe('planBookIds', () => {
  it('takes the books read last, newest first, then the library when nothing was read', () => {
    const sessions = [read({ bookId: 'b' }), read({ bookId: 'a' }), read({ bookId: 'b' }), read({ bookId: 'gone' })]
    expect(planBookIds({ sessions, books: [book('a'), book('b'), book('c')] })).toEqual(['b', 'a'])
    expect(planBookIds({ sessions: [], books: [book('a'), book('b')] })).toEqual(['a'])
    const four = ['a', 'b', 'c', 'd']
    expect(
      planBookIds({ sessions: four.map((bookId) => read({ bookId })), books: four.map((bookId) => book(bookId)) }),
    ).toEqual(['a', 'b', 'c'])
  })
})

describe('todayPlan', () => {
  it('goes on with the unfinished chapter for the minutes it has left, then fits the next one', () => {
    const plan = todayPlan({ budget: 15, sessions: [read({})], shelves: [kieu] })
    expect(brief(plan)).toEqual([
      ['k1', 'original', 6, true],
      ['k2', 'shortened', 6, false],
    ])
    expect(plan.items[0]?.search).toEqual({ length: 'original', minutes: 12, resume: true, block: 4, offset: 9 })
    expect(plan.total).toBe(12)
  })

  it('reads a shorter version of the unfinished chapter when what is left runs past the minutes', () => {
    const plan = todayPlan({ budget: 5, sessions: [read({ progress: 0.1 })], shelves: [kieu] })
    expect(brief(plan)).toEqual([['k1', 'keyPoints', 3, false]])
    expect(brief(todayPlan({ budget: 6, sessions: [read({})], shelves: [kieu] }))).toEqual([
      ['k1', 'original', 6, true],
    ])
  })

  it('starts the chapter after a finished one, and never skips a chapter that does not fit', () => {
    const done = read({ done: true, progress: 1 })
    expect(brief(todayPlan({ budget: 30, sessions: [done], shelves: [kieu] }))).toEqual([['k2', 'original', 12, false]])
    const tight = { ...kieu, chapters: [chapter('k1', 12), chapter('k2', 40), chapter('k3', 2)] }
    expect(brief(todayPlan({ budget: 5, sessions: [done], shelves: [tight] }))).toEqual([])
  })

  it('moves on to the next book once one runs out', () => {
    const other = { book: book('poe', 'en'), chapters: [chapter('p1', 12), chapter('p2', 12)] }
    const sessions = [read({ done: true, chapterId: 'k2' }), read({ bookId: 'poe', chapterId: 'p1', done: true })]
    expect(brief(todayPlan({ budget: 30, sessions, shelves: [kieu, other] }))).toEqual([
      ['p2', 'vietnamese', 12, false],
    ])
  })

  it('opens a book never read at its first chapter past the front matter', () => {
    expect(brief(todayPlan({ budget: 5, sessions: [], shelves: [kieu] }))).toEqual([['k1', 'keyPoints', 3, false]])
    expect(brief(todayPlan({ budget: 12, sessions: [], shelves: [kieu] }))).toEqual([['k1', 'original', 12, false]])
  })

  it('leaves out a book whose chapter is gone, rather than guess where it stood', () => {
    const gone = read({ chapterId: 'gone', done: true })
    expect(todayPlan({ budget: 30, sessions: [gone], shelves: [kieu] }).items).toEqual([])
  })
})
