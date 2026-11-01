import { m, useReducedMotion } from 'motion/react'
import type { TargetAndTransition, Transition } from 'motion/react'

export type NutMood = 'asleep' | 'waiting' | 'singing'

const NUT_WIDTH = 38
const STROKE = 'M2 6c6-5 9 4 15 0s9-4 14 0 9 3 13 0 8-3 14 0'
const HOP = {
  scaleX: [1.16, 0.9, 1, 1.2, 1],
  scaleY: [0.8, 1.12, 1, 0.74, 1],
  y: [0, -6, -27, 0, 0],
}
const SWAY: Record<NutMood, { animate: TargetAndTransition; transition: Transition }> = {
  asleep: {
    animate: { rotate: -14, scaleX: [1, 1.07, 1], scaleY: [1, 0.94, 1] },
    transition: { duration: 2.6, repeat: Infinity, ease: 'easeInOut' },
  },
  waiting: {
    animate: { rotate: 0, scaleX: [1, 1.05, 1], scaleY: [1, 0.95, 1] },
    transition: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' },
  },
  singing: {
    animate: { rotate: [-7, 7], y: [0, -10] },
    transition: {
      duration: 0.25,
      repeat: Infinity,
      repeatType: 'reverse',
      ease: 'easeInOut',
    },
  },
}
const FLOATS = {
  asleep: { marks: ['z', 'z', 'z'], duration: 2.6, at: 'left-9' },
  waiting: null,
  singing: { marks: ['♪', '♫', '♪'], duration: 1.3, at: '-left-3.5' },
} as const

function Eyes() {
  return [14, 24].map((cx) => (
    <m.circle
      key={cx}
      className="fill-chestnut-ink"
      cx={cx}
      cy="18"
      r="2.2"
      animate={{ scaleY: [1, 1, 0.1, 1] }}
      transition={{
        duration: 3.4,
        repeat: Infinity,
        times: [0, 0.92, 0.96, 1],
      }}
    />
  ))
}

function Face({ mood }: { mood: NutMood }) {
  switch (mood) {
    case 'asleep':
      return (
        <path
          className="stroke-chestnut-ink"
          fill="none"
          strokeWidth="2.2"
          strokeLinecap="round"
          d="M12 19q2.5 2 5 0M21 19q2.5 2 5 0"
        />
      )
    case 'waiting':
      return (
        <>
          <Eyes />
          <path
            className="stroke-chestnut-ink"
            fill="none"
            strokeWidth="2.2"
            strokeLinecap="round"
            d="M16 22.5q3 2.5 6 0"
          />
        </>
      )
    case 'singing':
      return (
        <>
          <Eyes />
          <ellipse className="fill-chestnut-ink" cx="19" cy="24" rx="3" ry="3.6" />
        </>
      )
    default: {
      const _exhaustive: never = mood
      return _exhaustive
    }
  }
}

/** A chestnut crossing one pen stroke per sentence: where it stands is how far the voice has got. */
export function WaitingNut({ ready, needed, mood }: { ready: number; needed: number; mood: NutMood }) {
  const calm = useReducedMotion()
  const strokes = Math.max(needed, 1)
  const float = calm ? null : FLOATS[mood]
  return (
    <div className="relative h-15.5 w-full" aria-hidden="true">
      <div className="absolute inset-x-0 bottom-0 flex gap-[7%]">
        {Array.from({ length: strokes }, (_, stroke) => (
          <svg
            key={stroke}
            className={`h-2.5 min-w-0 flex-1 overflow-visible transition-colors ${stroke < ready ? 'text-butter' : 'text-white/30'}`}
            viewBox="0 0 60 10"
            preserveAspectRatio="none"
          >
            <path
              d={STROKE}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ))}
      </div>
      <div
        data-nut={mood}
        className="absolute bottom-2.5 h-10.5 transition-[left] duration-450 ease-out motion-reduce:transition-none"
        style={{
          width: NUT_WIDTH,
          left: `calc((100% - ${NUT_WIDTH}px) * ${Math.min(ready / strokes, 1)})`,
        }}
      >
        <m.div key={ready} className="origin-bottom" animate={HOP} transition={{ duration: 0.46, ease: 'easeOut' }}>
          <m.svg
            key={mood}
            className="block h-10.5 w-9.5 origin-bottom overflow-visible"
            viewBox="0 0 38 42"
            {...SWAY[mood]}
          >
            <path className="stroke-butter" strokeWidth="2.5" strokeLinecap="round" d="M14 36v4M24 36v4" />
            <path className="fill-chestnut" d="M19 1c3 5 15 10 15 22 0 9-7 14-15 14S4 32 4 23C4 11 16 6 19 1Z" />
            <path className="fill-chestnut-belly" d="M5.3 26c5 4 22.4 4 27.4 0-1.5 7-7 11-13.7 11S6.8 33 5.3 26Z" />
            <Face mood={mood} />
          </m.svg>
        </m.div>
        {float?.marks.map((mark, index) => (
          <m.span
            key={index}
            className={`absolute top-0.5 font-hand text-[17px] text-butter ${float.at}`}
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, 1, 0],
              x: [0, 24],
              y: [0, -36],
              rotate: [-8, 12],
            }}
            transition={{
              duration: float.duration,
              repeat: Infinity,
              ease: 'linear',
              delay: (index * float.duration) / float.marks.length,
            }}
          >
            {mark}
          </m.span>
        ))}
      </div>
    </div>
  )
}
