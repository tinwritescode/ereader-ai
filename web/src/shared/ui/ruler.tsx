import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { nearestStop, stepStop } from './ruler-stops'

// Keeps the labels of the first and last stops inside the ruler.
const INSET_PX = 30

export type RulerStop = { id: string; fraction: number; label: ReactNode; name?: string }

const placedAt = (fraction: number): CSSProperties & { '--at': string } => ({ '--at': `${fraction}` })

const STEPS: Record<string, 1 | -1> = { ArrowRight: 1, ArrowUp: 1, ArrowDown: -1, ArrowLeft: -1 }

/** A school ruler with labelled stops: click or drag to one, or walk it with the arrow keys. */
export function Ruler({
  label,
  stops,
  selectedId,
  ticks,
  onChoose,
}: {
  label: string
  stops: RulerStop[]
  selectedId: string
  ticks: number[]
  onChoose: (id: string) => void
}) {
  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const { left, width } = event.currentTarget.getBoundingClientRect()
    const fraction = (event.clientX - left - INSET_PX) / (width - 2 * INSET_PX)
    const stop = nearestStop({ stops, fraction })
    if (stop && stop.id !== selectedId) onChoose(stop.id)
  }
  const walk = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = STEPS[event.key]
    if (!step) return
    event.preventDefault()
    const stop = stepStop({ stops, selectedId, step })
    if (!stop) return
    onChoose(stop.id)
    event.currentTarget.querySelectorAll('button')[stops.indexOf(stop)]?.focus()
  }
  const selected = stops.find(({ id }) => id === selectedId)
  return (
    <div
      className="ruler"
      role="radiogroup"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={walk}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        pick(event)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event)
      }}
    >
      {ticks.map((tick) => (
        <span key={tick} className="tick" style={placedAt(tick)} />
      ))}
      {selected && <span className="pin" style={placedAt(selected.fraction)} />}
      {stops.map(({ id, fraction, label: stopLabel, name }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={id === selectedId}
          aria-label={name}
          tabIndex={id === selectedId ? 0 : -1}
          style={placedAt(fraction)}
          onClick={() => onChoose(id)}
        >
          {stopLabel}
        </button>
      ))}
    </div>
  )
}
