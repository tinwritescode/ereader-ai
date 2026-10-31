import { describe, expect, it, vi } from 'vitest'
import { createRenewal } from './renewal'

const tokens = { access: 'a2', refresh: 'r2' }

describe('createRenewal', () => {
  it('spends a refresh token once when requests fail together', async () => {
    const exchange = vi.fn(async () => ({ kind: 'renewed' as const, tokens }))
    const renew = createRenewal({ exchange, keepMs: 1000, now: () => 0 })
    expect(await Promise.all([renew('r1'), renew('r1')])).toEqual([
      { kind: 'renewed', tokens },
      { kind: 'renewed', tokens },
    ])
    expect(exchange).toHaveBeenCalledTimes(1)
  })

  it('answers a late request carrying the spent token', async () => {
    const exchange = vi.fn(async () => ({ kind: 'renewed' as const, tokens }))
    const renew = createRenewal({ exchange, keepMs: 1000, now: () => 0 })
    await renew('r1')
    await renew('r1')
    expect(exchange).toHaveBeenCalledTimes(1)
  })

  it('forgets the answer once the browser must have the new cookies', async () => {
    let time = 0
    const exchange = vi.fn(async () => ({ kind: 'renewed' as const, tokens }))
    const renew = createRenewal({ exchange, keepMs: 1000, now: () => time })
    await renew('r1')
    time = 2000
    await renew('r1')
    expect(exchange).toHaveBeenCalledTimes(2)
  })

  it('lets a failed exchange be tried again: a tunnel is not a lost session', async () => {
    const exchange = vi.fn<() => Promise<{ kind: 'lost' }>>().mockRejectedValueOnce(new Error('down')).mockResolvedValue({ kind: 'lost' })
    const renew = createRenewal({ exchange, keepMs: 1000, now: () => 0 })
    await expect(renew('r1')).rejects.toThrow('down')
    expect(await renew('r1')).toEqual({ kind: 'lost' })
  })
})
