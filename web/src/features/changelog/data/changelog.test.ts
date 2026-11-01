import { expect, it } from 'vitest'
import { ReleaseWire } from './changelog'

const release = {
  version: '1.0.0',
  date: '2026-11-01',
  title: 'Bản đầu tiên',
  added: [[{ text: 'Đọc sách', marked: true }]],
  fixed: [],
}

it('reads a release as the backend sends it', () => {
  expect(ReleaseWire.parse(release)).toEqual(release)
})

it('refuses a note that is not a list of runs', () => {
  expect(ReleaseWire.safeParse({ ...release, added: ['Đọc sách'] }).success).toBe(false)
})
