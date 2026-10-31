export type Tokens = { access: string; refresh: string }
export type Renewed = { kind: 'renewed'; tokens: Tokens } | { kind: 'lost' }

type Remembered = { answer: Promise<Renewed>; at: number }

/**
 * Refresh tokens work once, so requests failing together share one exchange, and one that was
 * already on its way with the old cookie gets the same answer. Holds per process: one replica.
 */
export function createRenewal({
  exchange,
  keepMs,
  now,
}: {
  exchange: (refresh: string) => Promise<Renewed>
  keepMs: number
  now: () => number
}): (refresh: string) => Promise<Renewed> {
  const remembered = new Map<string, Remembered>()
  return (refresh) => {
    for (const [token, { at }] of remembered) {
      if (now() - at > keepMs) remembered.delete(token)
    }
    const known = remembered.get(refresh)
    if (known) return known.answer
    const answer = exchange(refresh)
    remembered.set(refresh, { answer, at: now() })
    answer.catch(() => remembered.delete(refresh))
    return answer
  }
}
