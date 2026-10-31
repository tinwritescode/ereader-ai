import { describe, expect, it } from 'vitest'
import { pageTitle } from './page-title'

describe('pageTitle', () => {
  it('puts the page before the app', () => {
    expect(pageTitle('Thư viện')).toBe('Thư viện – eReader')
  })
  it('names a chapter by its label and book', () => {
    expect(pageTitle('Chương Một', 'Deep Work')).toBe('Chương Một, Deep Work – eReader')
  })
  it('skips a chapter with no label', () => {
    expect(pageTitle('', 'Deep Work')).toBe('Deep Work – eReader')
  })
})
