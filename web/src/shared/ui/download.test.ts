import { describe, expect, it } from 'vitest'
import { fileNameOf } from './download'

describe('fileNameOf', () => {
  it('takes the UTF-8 name over the plain one', () => {
    expect(
      fileNameOf(
        `attachment; filename="Deep Work (ti?ng Vi?t).epub"; filename*=UTF-8''Deep%20Work%20%28ti%E1%BA%BFng%20Vi%E1%BB%87t%29.epub`,
      ),
    ).toBe('Deep Work (tiếng Việt).epub')
  })
  it('falls back to the plain name', () => {
    expect(fileNameOf('attachment; filename="book.epub"')).toBe('book.epub')
  })
  it('has no name without the header or with a broken one', () => {
    expect(fileNameOf(null)).toBeNull()
    expect(fileNameOf('attachment')).toBeNull()
    expect(fileNameOf("attachment; filename*=UTF-8''%E1%ZZ")).toBeNull()
  })
})
