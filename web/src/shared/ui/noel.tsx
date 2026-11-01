import { useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { createStored } from './stored'

const KEY = 'noel'
const noel = createStored({ key: KEY, schema: z.boolean(), fallback: false })

/** Runs ahead of the first paint: the server cannot know this device's choice, and a reload must not show plain paper. */
export const NOEL_BEFORE_PAINT = `try{document.documentElement.classList.toggle('noel',localStorage.getItem('${KEY}')==='true')}catch{}`

/** Keeps the page in step with the choice, here and from other tabs. */
export function NoelClass() {
  noel.useValue()
  // Read afresh: while hydrating, the hook still gives the server's answer and would strip the class for a moment.
  useEffect(() => {
    document.documentElement.classList.toggle('noel', noel.read())
  })
  return null
}

const FLAKES = Array.from({ length: 28 }, (_, index) => ({
  left: `${(index * 61.8) % 100}%`,
  fontSize: 20 + ((index * 7) % 16),
  animationDelay: `${index * 100}ms`,
  '--drift': `${((index * 37) % 90) - 45}px`,
}))

/** Snow as a child draws it in a notebook, falling the once and then gone. */
function Snowfall({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const { dataset } = document.documentElement
    dataset['snowing'] = 'true'
    return () => {
      delete dataset['snowing']
    }
  }, [])
  return (
    <div data-snowfall className="pointer-events-none fixed inset-0 z-30 overflow-clip" aria-hidden="true">
      {FLAKES.map((flake, index) => (
        <i
          key={flake.left}
          className="absolute -top-10 animate-snowfall font-hand text-ink/55 not-italic"
          style={flake}
          onAnimationEnd={index === FLAKES.length - 1 ? onDone : undefined}
        >
          *
        </i>
      ))}
    </div>
  )
}

function Star() {
  return (
    <svg
      className="inline-block size-5 fill-transparent align-[-3px] transition-transform duration-300 ease-hinge group-hover/noel:rotate-72 in-aria-checked:fill-marker"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2.8l2.7 6 6.5.6-4.9 4.3 1.5 6.4-5.8-3.4-5.8 3.4 1.5-6.4-4.9-4.3 6.5-.6z" />
    </svg>
  )
}

/** The way into Christmas: the book's own pen, lights and snow, kept on this device. */
export function NoelSwitch({ className }: { className: string }) {
  const on = noel.useValue()
  const calm = useReducedMotion()
  const [falling, setFalling] = useState(false)
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`group/noel ${className}`}
        onClick={() => {
          noel.write(!on)
          setFalling(!on && !calm)
        }}
      >
        <Star />
        <span className="sr-only md:not-sr-only md:ml-1.5">Giáng sinh</span>
      </button>
      {falling && <Snowfall onDone={() => setFalling(false)} />}
    </>
  )
}

const BULBS = [
  { at: 'translate(15.5 14) rotate(-62)', fill: 'fill-red' },
  { at: 'translate(8.5 42) rotate(62)', fill: 'fill-marker' },
  { at: 'translate(15.5 70) rotate(-62)', fill: 'fill-ink' },
  { at: 'translate(8.5 98) rotate(62)', fill: 'fill-marker' },
]

/** A string of lights drawn in gel pen down the margin line; one repeat is four ruled lines. */
export function Garland() {
  return (
    <svg
      data-garland
      className="pointer-events-none absolute inset-y-0 left-[calc(var(--m)-11px)] hidden h-full w-6 origin-top animate-draw-down noel:block"
      aria-hidden="true"
    >
      <defs>
        <pattern id="garland" width="24" height="112" patternUnits="userSpaceOnUse">
          <path
            d="M12 0c5 9 5 19 0 28s-5 19 0 28 5 19 0 28-5 19 0 28"
            className="stroke-ink"
            fill="none"
            strokeWidth="1.3"
          />
          {BULBS.map(({ at, fill }) => (
            <g key={at} transform={at} className="stroke-ink" strokeWidth="1.1" strokeLinejoin="round">
              <path className="fill-ink" d="M-1.5 -1.5h3v2.6h-3z" />
              <path
                className={fill}
                d="M0 1C2.8 3.4 3.4 6 3 7.6 2.6 9.4 1.4 10 0 10s-2.6-.6-3-2.4C-3.4 6-2.8 3.4 0 1Z"
              />
            </g>
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#garland)" />
    </svg>
  )
}
