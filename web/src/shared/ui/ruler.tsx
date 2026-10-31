import { m } from 'motion/react'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { nearestStop, stepStop } from './ruler-stops'

// Keeps the labels of the first and last stops inside the ruler.
const INSET_PX = 30

export type RulerStop = { id: string; fraction: number; label: ReactNode; name?: string }

const placedAt = (fraction: number): CSSProperties & { '--at': number } => ({ '--at': fraction })

const AT = 'absolute left-[calc(30px+(100%-60px)*var(--at))]'

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
      className="relative mt-4.5 mb-2.5 h-21 cursor-pointer touch-pan-y select-none rounded-md border border-ruler-edge bg-ruler text-pencil"
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
        <span key={tick} className={`top-0 h-3.5 w-px bg-pencil ${AT}`} style={placedAt(tick)} />
      ))}
      {selected && (
        <m.span
          className={`-top-3 -ml-2 border-8 border-t-12 border-b-0 border-transparent border-t-pen ${AT}`}
          initial={false}
          animate={{ '--at': selected.fraction }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        />
      )}
      {stops.map(({ id, fraction, label: stopLabel, name }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={id === selectedId}
          aria-label={name}
          tabIndex={id === selectedId ? 0 : -1}
          className={`top-5 -ml-7.5 min-h-11 w-15 text-center font-hand text-[21px]/none text-pencil aria-checked:text-[25px] aria-checked:text-pen [&_small]:block [&_small]:font-read [&_small]:text-[11.5px]/[1.3] [&_small]:text-pencil ${AT}`}
          style={placedAt(fraction)}
          onClick={() => onChoose(id)}
        >
          {stopLabel}
        </button>
      ))}
    </div>
  )
}
