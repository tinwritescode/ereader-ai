import { describe, expect, it } from 'vitest'
import { nearestStop, stepStop } from './ruler-stops'

const stops = [
  { id: 'short', fraction: 0.1 },
  { id: 'half', fraction: 0.5 },
  { id: 'whole', fraction: 1 },
]

describe('the ruler', () => {
  it('picks the stop closest to where the pointer is', () => {
    expect(nearestStop({ stops, fraction: 0 })?.id).toBe('short')
    expect(nearestStop({ stops, fraction: 0.4 })?.id).toBe('half')
    expect(nearestStop({ stops, fraction: 0.9 })?.id).toBe('whole')
  })

  it('takes one step along the ruler and stops at its ends', () => {
    expect(stepStop({ stops, selectedId: 'short', step: 1 })?.id).toBe('half')
    expect(stepStop({ stops, selectedId: 'half', step: -1 })?.id).toBe('short')
    expect(stepStop({ stops, selectedId: 'whole', step: 1 })?.id).toBe('whole')
    expect(stepStop({ stops, selectedId: 'short', step: -1 })?.id).toBe('short')
  })
})
