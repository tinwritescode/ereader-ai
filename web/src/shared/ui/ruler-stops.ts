type Placed = { fraction: number }

/** The stop closest to `fraction` of the ruler's length. */
export function nearestStop<T extends Placed>({
  stops,
  fraction,
}: {
  stops: readonly T[]
  fraction: number
}): T | undefined {
  const distance = (stop: T) => Math.abs(stop.fraction - fraction)
  return stops.reduce<T | undefined>(
    (best, stop) => (best && distance(best) <= distance(stop) ? best : stop),
    undefined,
  )
}

/** The stop one step along from the selected one, staying on the ruler. */
export function stepStop<T extends { id: string }>({
  stops,
  selectedId,
  step,
}: {
  stops: readonly T[]
  selectedId: string
  step: 1 | -1
}): T | undefined {
  const at = stops.findIndex(({ id }) => id === selectedId)
  return stops[Math.min(stops.length - 1, Math.max(0, at + step))]
}
