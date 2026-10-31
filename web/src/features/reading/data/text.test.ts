import { expect, it } from 'vitest'
import { digestBlocks } from './text'

it('reads a digest as paragraphs, leaving out blank ones', () => {
  expect(digestBlocks(' Một.\n\n\n\nHai. ')).toEqual([
    { kind: 'paragraph', text: 'Một.' },
    { kind: 'paragraph', text: 'Hai.' },
  ])
})
