import { describe, expect, it } from 'vitest'
import { lengthOptionsFor, sameOption } from './length'
import { ReadingSpots, latestSpot, minutesLeft, nextChapterSpot, wholeLength, withSpot } from './spot'

describe('lengthOptionsFor', () => {
  it('offers only the whole chapter when it is short', () => {
    expect(lengthOptionsFor({ chapterMinutes: 4, vietnamese: false })).toEqual([{ length: 'original', minutes: 4 }])
  })

  it('scales the shorter lengths with the chapter', () => {
    expect(lengthOptionsFor({ chapterMinutes: 26, vietnamese: false })).toEqual([
      { length: 'original', minutes: 26 },
      { length: 'shortened', minutes: 13 },
      { length: 'keyPoints', minutes: 7 },
    ])
  })

  it('never goes under two minutes', () => {
    expect(lengthOptionsFor({ chapterMinutes: 5, vietnamese: false }).at(-1)).toEqual({ length: 'keyPoints', minutes: 2 })
  })

  it('puts the translation after the original', () => {
    expect(lengthOptionsFor({ chapterMinutes: 4, vietnamese: true })).toEqual([
      { length: 'original', minutes: 4 },
      { length: 'vietnamese', minutes: 4 },
    ])
  })
})

describe('sameOption', () => {
  it('compares both length and minutes', () => {
    expect(sameOption({ length: 'shortened', minutes: 3 }, { length: 'shortened', minutes: 4 })).toBe(false)
  })
})

describe('ReadingSpots', () => {
  it('keeps what parses and drops the rest', () => {
    const good = nextChapterSpot({ chapterId: 'c', chapterLabel: 'Chương Hai', minutes: 9, listened: false })
    expect(ReadingSpots.parse({ a: good, b: { chapterId: 1 } })).toEqual({ a: good })
  })
})

describe('minutesLeft', () => {
  it('rounds up what is left', () => {
    expect(minutesLeft({ minutes: 10, read: 0.25 })).toBe(8)
    expect(minutesLeft({ minutes: 10, read: 1 })).toBe(0)
  })
})

describe('the spot read last', () => {
  const spot = nextChapterSpot({ chapterId: 'c', chapterLabel: 'Chương Một', minutes: 5, listened: false })

  it('is the one recorded last, among books still on the shelf', () => {
    const spots = withSpot({ spots: withSpot({ spots: { a: spot, b: spot }, bookId: 'a', spot }), bookId: 'gone', spot })
    expect(latestSpot({ spots, bookIds: ['a', 'b'] })?.bookId).toBe('a')
    expect(latestSpot({ spots: {}, bookIds: ['a'] })).toBeNull()
  })

  it('gives a whole version the chapter length', () => {
    expect(wholeLength({ search: { length: 'original', minutes: 0 }, chapterMinutes: 12 })).toEqual({ length: 'original', minutes: 12 })
    expect(wholeLength({ search: { length: 'shortened', minutes: 6 }, chapterMinutes: 12 })).toBeNull()
  })
})
