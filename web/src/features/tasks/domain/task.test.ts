import { describe, expect, it } from 'vitest'
import { chaptersWithin, failureText, freshFinishes, noticeOf, rowOf, translateOfferFor, translationMark, turnOf, voiceOfferFor } from './task'
import type { BookTranslationTask, BookVoiceTask, ChapterVoiceTask } from './task'

const base = { bookId: 'b', bookTitle: 'Sách', code: null, position: null, createdAt: '2026-10-01T00:00:00Z', finishedAt: null }
const translation = (over: Partial<BookTranslationTask> = {}): BookTranslationTask => ({
  ...base,
  id: 't',
  kind: 'bookTranslation',
  state: 'running',
  done: 1,
  total: 3,
  percent: 40,
  current: { chapterId: 'c2', percent: 30 },
  waiting: ['c2', 'c3'],
  ...over,
})
const chapterVoice = (over: Partial<ChapterVoiceTask> = {}): ChapterVoiceTask => ({
  ...base,
  id: 'v',
  kind: 'chapterVoice',
  state: 'done',
  chapterId: 'c1',
  chapterLabel: 'Chương Một',
  minutes: null,
  voiceCode: 'a',
  voiceName: 'Hạt Dẻ',
  done: 4,
  total: 4,
  finishedAt: '2026-10-02T00:00:00Z',
  ...over,
})
const bookVoice = (over: Partial<BookVoiceTask> = {}): BookVoiceTask => ({
  ...translation(),
  id: 'bv',
  kind: 'bookVoice',
  voiceCode: 'a',
  voiceName: 'Hạt Dẻ',
  voiced: ['c1'],
  ...over,
})

describe('chapters in a whole-book task', () => {
  it('knows which is being worked on and which wait', () => {
    expect(turnOf(translation(), 'c2')).toBe('now')
    expect(turnOf(translation(), 'c3')).toBe('later')
    expect(turnOf(translation(), 'c1')).toBe('none')
    expect(turnOf(translation({ state: 'stopped' }), 'c2')).toBe('none')
  })

  it('marks a chapter row with how far it is', () => {
    expect(translationMark({ chapterId: 'c1', translated: ['c1'], task: translation() })).toBe('đã dịch')
    expect(translationMark({ chapterId: 'c2', translated: [], task: translation() })).toBe('đang dịch 30%')
    expect(translationMark({ chapterId: 'c3', translated: [], task: translation() })).toBe('chờ dịch')
    expect(translationMark({ chapterId: 'c9', translated: [], task: null })).toBeNull()
  })
})

describe('whole-book offers', () => {
  it('offers translation only for a foreign book on a plan that has it', () => {
    expect(translateOfferFor({ foreign: false, chapterCount: 3, monthly: 3, standing: null })).toEqual({ kind: 'hidden' })
    expect(translateOfferFor({ foreign: true, chapterCount: 3, monthly: 0, standing: null })).toEqual({ kind: 'locked' })
    expect(translateOfferFor({ foreign: true, chapterCount: 3, monthly: 3, standing: null })).toEqual({ kind: 'open' })
    expect(translateOfferFor({ foreign: true, chapterCount: 2, monthly: 3, standing: { translated: ['a', 'b'], task: null } })).toEqual({ kind: 'done' })
  })

  it('follows a task under way or stopped before anything else', () => {
    const task = translation({ state: 'stopped' })
    expect(translateOfferFor({ foreign: true, chapterCount: 3, monthly: 0, standing: { translated: [], task } })).toEqual({ kind: 'stopped', task })
    expect(voiceOfferFor({ allowed: false, standing: { chapters: 3, skipped: 0, minutes: 30, task: bookVoice() } }).kind).toBe('underWay')
    expect(voiceOfferFor({ allowed: true, standing: { chapters: 3, skipped: 0, minutes: 30, task: bookVoice({ state: 'done' }) } })).toEqual({ kind: 'done' })
    expect(voiceOfferFor({ allowed: true, standing: { chapters: 3, skipped: 1, minutes: 30, task: bookVoice({ state: 'done' }) } })).toEqual({ kind: 'open' })
  })

  it('counts how many chapters the minutes left pay for', () => {
    expect(chaptersWithin({ chapters: 10, minutes: 100, left: 200 })).toBe(10)
    expect(chaptersWithin({ chapters: 10, minutes: 100, left: 35 })).toBe(3)
  })
})

describe('finishes the reader is told about', () => {
  it('tells each finish once', () => {
    const done = chapterVoice()
    const first = freshFinishes({ tasks: [done, translation()], seen: [] })
    expect(first.fresh).toEqual([done])
    expect(freshFinishes({ tasks: [done], seen: first.seen }).fresh).toEqual([])
  })

  it('tells a stop and a later finish of the same task apart', () => {
    const stopped = translation({ state: 'stopped', finishedAt: '2026-10-02T00:00:00Z' })
    const { seen } = freshFinishes({ tasks: [stopped], seen: [] })
    const finished = translation({ state: 'done', finishedAt: '2026-10-03T00:00:00Z' })
    expect(freshFinishes({ tasks: [finished], seen }).fresh).toEqual([finished])
  })

  it('words a notice as the app does', () => {
    expect(noticeOf(chapterVoice())).toEqual({ text: 'Đã tạo xong giọng đọc Chương Một.', action: 'Nghe ngay' })
    expect(noticeOf(translation({ state: 'done' }))).toEqual({ text: 'Đã dịch xong Sách.', action: 'Đọc ngay' })
    expect(noticeOf(bookVoice({ state: 'stopped', percent: 36 }))).toEqual({ text: 'Dừng tạo giọng đọc Sách ở 36%.', action: 'Xem tác vụ' })
  })
})

describe('a task row', () => {
  it('says what, how far and why it stopped', () => {
    expect(rowOf(chapterVoice({ state: 'running', done: 2 }))).toMatchObject({ kind: 'Tạo giọng đọc, Hạt Dẻ', name: 'Chương Một, Sách', progress: 'Câu 2 trên 4', percent: 50 })
    expect(rowOf(translation({ state: 'queued', position: 1 })).kind).toBe('Dịch cả sách, thứ 1 trong hàng')
    expect(rowOf(bookVoice({ state: 'stopped', code: 'VOICE_LIMIT', percent: 36 }))).toMatchObject({ stoppedNote: 'Tạo giọng cả sách, bị dừng ở 36%', failure: 'Hết phút giọng qua mạng' })
    expect(failureText('TRANSLATE_FAILED')).toBe('Không kết nối được tới máy dịch')
    expect(failureText('X')).toBe('Không kết nối được tới máy đọc')
  })
})
