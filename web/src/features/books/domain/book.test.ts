import { describe, expect, it } from 'vitest'
import { chapterHeading, chapterName, displayTitle, isForeign } from './book'
import { codeOf, durationLabel, errorMessage } from './words'

describe('isForeign', () => {
  it('knows Vietnamese in any spelling, and asks nothing of an unknown language', () => {
    expect(isForeign({ language: 'en' })).toBe(true)
    expect(isForeign({ language: 'VI-vn' })).toBe(false)
    expect(isForeign({ language: null })).toBe(false)
  })
})

describe('chapter names', () => {
  it('puts headings in capitals into sentence case', () => {
    expect(displayTitle('ĐỨNG THẲNG')).toBe('Đứng thẳng')
    expect(displayTitle('Đứng Thẳng')).toBe('Đứng Thẳng')
    expect(displayTitle('123')).toBe('123')
  })

  it('reads a number over a title', () => {
    expect(chapterHeading({ label: 'Chương Một', subtitle: 'Ngày chọn người' })).toEqual({
      number: 'Chương Một',
      title: 'Ngày chọn người',
    })
  })

  it('splits a title that repeats its number', () => {
    expect(chapterHeading({ label: 'Quy luật 1', subtitle: 'QUY LUẬT 1 ĐỨNG THẲNG' })).toEqual({
      number: 'Quy luật 1',
      title: 'Đứng thẳng',
    })
  })

  it('treats a repeated heading as one title', () => {
    expect(chapterHeading({ label: 'Mở đầu', subtitle: 'MỞ ĐẦU' })).toEqual({
      number: null,
      title: 'MỞ ĐẦU'.toLowerCase().replace('m', 'M'),
    })
  })

  it('names a chapter by its number when it has one', () => {
    expect(chapterName({ label: 'Chương Hai', subtitle: 'Bánh mì cháy' })).toBe('Chương Hai')
    expect(chapterName({ label: 'Lời nói đầu', subtitle: null })).toBe('Lời nói đầu')
  })
})

describe('durationLabel', () => {
  it('reads minutes and hours', () => {
    expect(durationLabel(45)).toBe('45 phút')
    expect(durationLabel(60)).toBe('1 giờ')
    expect(durationLabel(557)).toBe('9 giờ 17 phút')
  })
})

describe('errors', () => {
  it('words known codes and names unknown ones', () => {
    expect(errorMessage('BOOK_LIMIT')).toBe('Đã đủ số sách của gói này.')
    expect(errorMessage('X')).toBe('Máy chủ báo lỗi X.')
  })

  it('takes a code from a failed call, and calls anything else the network', () => {
    expect(codeOf(new Error('BOOK_LIMIT'))).toBe('BOOK_LIMIT')
    expect(codeOf(new Error('fetch failed'))).toBe('NETWORK_ERROR')
    expect(codeOf('x')).toBe('NETWORK_ERROR')
  })
})
