import type { ReactNode } from 'react'

/** How a critter feels about its job: nothing to do yet, at work, or stopped part way. */
export type Mood = 'idle' | 'busy' | 'tired'

const OUTLINE = { strokeWidth: 1.5, strokeLinejoin: 'round', strokeLinecap: 'round' } as const

/** Drawn in the notebook's pen: a 48-unit square that sits on two ruled lines. */
function Critter({ mood, children }: { mood: Mood; children: ReactNode }) {
  return (
    <svg
      className="critter block size-12 overflow-visible"
      data-mood={mood}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse className="fill-ink/10" cx="24" cy="45.5" rx="12" ry="1.8" />
      {children}
    </svg>
  )
}

/** Open eyes blink now and then; tired ones are shut. */
function Eyes({ at, mood }: { at: [number, number][]; mood: Mood }) {
  if (mood === 'tired')
    return at.map(([cx, cy]) => (
      <path key={cx} className="stroke-chestnut-ink" fill="none" {...OUTLINE} d={`M${cx - 2} ${cy}q2 1.6 4 0`} />
    ))
  return at.map(([cx, cy]) => (
    <circle key={cx} className="critter-eye fill-chestnut-ink" cx={cx} cy={mood === 'busy' ? cy + 1 : cy} r="2.1" />
  ))
}

/** Marks that drift up from a critter at work, and once from any critter under the pointer. */
function Floats({ marks, x, y }: { marks: string[]; x: number; y: number }) {
  return marks.map((mark, index) => (
    <text
      key={index}
      className="critter-float fill-red font-hand text-[11px]"
      x={x + index * 5}
      y={y}
      style={{ animationDelay: `${index * 0.55}s` }}
    >
      {mark}
    </text>
  ))
}

/** Hạt Dẻ in a nón lá: the one who turns a book into Vietnamese. */
export function TranslatorNut({ mood, holdingBook = false }: { mood: Mood; holdingBook?: boolean }) {
  return (
    <Critter mood={mood}>
      <path className="stroke-chestnut-ink" {...OUTLINE} d="M19 40.5v4M29 40.5v4" />
      <path
        className="fill-chestnut stroke-chestnut-ink"
        {...OUTLINE}
        d="M24 5c3 5 15 10 15 22 0 9-7 14-15 14S9 36 9 27C9 15 21 10 24 5Z"
      />
      <path className="fill-chestnut-belly" d="M10.3 30c5 4 22.4 4 27.4 0-1.5 7-7 10.4-13.7 10.4S11.8 37 10.3 30Z" />
      <Eyes
        at={[
          [19.5, 22],
          [28.5, 22],
        ]}
        mood={mood}
      />
      <ellipse className="fill-rose" cx="16" cy="26" rx="2.4" ry="1.4" />
      <ellipse className="fill-rose" cx="32" cy="26" rx="2.4" ry="1.4" />
      <path
        className="stroke-chestnut-ink"
        fill="none"
        {...OUTLINE}
        d={mood === 'tired' ? 'M22 28.5h4' : 'M21.5 26.5q2.5 2.2 5 0'}
      />
      <path className="fill-butter stroke-chestnut-ink" {...OUTLINE} d="M5 14.5 24 3l19 11.5q-19 4-38 0Z" />
      <path className="stroke-chestnut-ink" {...OUTLINE} strokeWidth={0.9} d="M24 3l-6 13M24 3l6 13" />
      {holdingBook && (
        <>
          <rect className="fill-red stroke-chestnut-ink" {...OUTLINE} x="17" y="29" width="14" height="10" rx="1.5" />
          <path className="stroke-sheet" {...OUTLINE} d="M24 30v8" />
          <circle className="fill-chestnut stroke-chestnut-ink" {...OUTLINE} cx="16.5" cy="33" r="2.2" />
          <circle className="fill-chestnut stroke-chestnut-ink" {...OUTLINE} cx="31.5" cy="33" r="2.2" />
        </>
      )}
      <Floats marks={['ă', 'ơ', 'ê']} x={38} y={12} />
    </Critter>
  )
}

/** A sparrow that sings the book aloud. */
export function SingingBird({ mood }: { mood: Mood }) {
  return (
    <Critter mood={mood}>
      <path className="stroke-chestnut-ink" {...OUTLINE} d="M21 39v5.5M28 39v5.5" />
      <path className="fill-butter stroke-ink" {...OUTLINE} d="M12 31 4 27.5l1.5 8.5Z" />
      <ellipse className="fill-butter stroke-ink" {...OUTLINE} cx="24" cy="28" rx="13" ry="12" />
      <ellipse className="fill-chestnut-belly" cx="26.5" cy="32.5" rx="8" ry="5.5" />
      <path className="fill-ruler-edge stroke-ink" {...OUTLINE} d="M14.5 27q7-2.5 10.5 4-6 4.5-11 0Z" />
      <path className="stroke-ink" fill="none" {...OUTLINE} d="M21.5 16.5q1-5 4-2 .5-4 3.5-1" />
      <Eyes at={[[29.5, 24]]} mood={mood} />
      <ellipse className="fill-rose" cx="32" cy="28.5" rx="2.2" ry="1.3" />
      <path
        className="fill-chestnut stroke-ink"
        {...OUTLINE}
        d={mood === 'busy' ? 'M36.5 23.5 43 22l-6.5 3.5ZM36.5 26.5l6.5 3.5-6.5-1.5Z' : 'M36.5 24l6.5 2.2-6.5 2.3Z'}
      />
      <Floats marks={['♪', '♫', '♪']} x={40} y={14} />
    </Critter>
  )
}

/** A cat peeking over a letter: the link someone else will open. */
export function LetterCat({ mood }: { mood: Mood }) {
  return (
    <Critter mood={mood}>
      <path className="fill-sheet stroke-ink" {...OUTLINE} d="M13 19 15.5 7.5l7.5 6.5ZM35 19 32.5 7.5 25 14Z" />
      <path className="fill-rose" d="m15.5 16.5 1.2-5.5 3.6 3.2ZM32.5 16.5l-1.2-5.5-3.6 3.2Z" />
      <ellipse className="fill-sheet stroke-ink" {...OUTLINE} cx="24" cy="22" rx="12" ry="10" />
      <path className="stroke-ink" fill="none" {...OUTLINE} d="M17.5 21q2-2.2 4 0M26.5 21q2-2.2 4 0" />
      <path className="fill-rose" d="M22.5 24.5h3L24 26.3Z" />
      <path
        className="stroke-ink"
        fill="none"
        {...OUTLINE}
        strokeWidth={0.9}
        d="M8 22.5l6 1M8 26l6-.5M40 22.5l-6 1M40 26l-6-.5"
      />
      <rect className="fill-chestnut-belly stroke-ink" {...OUTLINE} x="9" y="27" width="30" height="16.5" rx="2" />
      <path className="stroke-ink" fill="none" {...OUTLINE} d="m9.5 28 14.5 9 14.5-9" />
      <path
        className="fill-red"
        d="M24 39.5c-3-2-4.5-3.6-4.5-5.2 0-2 2.7-2.6 4.5-.6 1.8-2 4.5-1.4 4.5.6 0 1.6-1.5 3.2-4.5 5.2Z"
      />
      <ellipse className="fill-sheet stroke-ink" {...OUTLINE} cx="16.5" cy="27.5" rx="3" ry="2" />
      <ellipse className="fill-sheet stroke-ink" {...OUTLINE} cx="31.5" cy="27.5" rx="3" ry="2" />
      <Floats marks={['♥']} x={40} y={14} />
    </Critter>
  )
}
