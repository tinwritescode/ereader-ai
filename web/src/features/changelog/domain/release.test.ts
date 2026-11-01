import { expect, it } from 'vitest'
import { dateLabel, isUnseen } from './release'

it('marks the newest version until it is read, but not on a first visit', () => {
  expect(isUnseen({ newest: '1.1.0', seen: '1.0.0' })).toBe(true)
  expect(isUnseen({ newest: '1.1.0', seen: '1.1.0' })).toBe(false)
  expect(isUnseen({ newest: '1.1.0', seen: null })).toBe(false)
  expect(isUnseen({ newest: null, seen: '1.0.0' })).toBe(false)
})

it('writes a date the way the app does', () => {
  expect(dateLabel('2026-11-01')).toBe('1 tháng 11, 2026')
})
