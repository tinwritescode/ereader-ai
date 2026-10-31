import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { planSpeech, sentenceAt, sentencesWithin, spokenMinutes } from './speech-plan'

const GOLDEN = join(import.meta.dirname, '../../../../../backend/src/modules/speech/domain/speech-plan.golden.json')
const golden = z
  .object({
    blocks: z.array(z.string()),
    sentences: z.array(z.object({ block: z.number(), start: z.number(), end: z.number(), text: z.string() })),
  })
  .parse(JSON.parse(readFileSync(GOLDEN, 'utf8')))

describe('planSpeech', () => {
  it('cuts text exactly as the backend and app do, with the same places', () => {
    expect(planSpeech(golden.blocks.map((text) => ({ text })))).toEqual(golden.sentences)
  })
})

describe('spokenMinutes', () => {
  it('rounds up the time to read the sentences', () => {
    expect(spokenMinutes(['a'.repeat(901)])).toBe(2)
    expect(spokenMinutes([])).toBe(0)
  })
})

describe('sentenceAt', () => {
  const plan = planSpeech([{ text: 'Một. Hai. Ba.' }, { text: 'Bốn.' }])

  it('finds the sentence holding a character', () => {
    expect(sentenceAt({ plan, block: 0, offset: 6 })).toBe(1)
    expect(sentenceAt({ plan, block: 1, offset: 0 })).toBe(3)
  })

  it('starts over when the block is gone', () => {
    expect(sentenceAt({ plan, block: 9, offset: 0 })).toBe(0)
  })
})

describe('sentencesWithin', () => {
  it('counts the sentences after one that fill the time', () => {
    const plan = planSpeech([{ text: `${'a'.repeat(14)}. ${'b'.repeat(14)}. ${'c'.repeat(14)}.` }])
    expect(sentencesWithin({ plan, from: 0, seconds: 1 })).toBe(1)
    expect(sentencesWithin({ plan, from: 0, seconds: 60 })).toBe(2)
    expect(sentencesWithin({ plan, from: 2, seconds: 60 })).toBe(0)
  })
})
