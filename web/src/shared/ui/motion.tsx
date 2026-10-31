import { LazyMotion, MotionConfig, domAnimation } from 'motion/react'
import type { ReactNode } from 'react'

/** Motion's small bundle for the whole app, keeping to the reader's reduced-motion setting. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
