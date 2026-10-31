import { z } from 'zod'

export const TEXT_SIZES = { small: 15, medium: 17, large: 19.5 } as const
export const LINE_SPACINGS = { tight: 1.5, normal: 1.7, loose: 1.95 } as const

/** How the reader likes the page to look. Kept between chapters and visits. */
export const ReadingLook = z.object({
  size: z.enum(['small', 'medium', 'large']),
  spacing: z.enum(['tight', 'normal', 'loose']),
  paper: z.enum(['day', 'night']),
})
export type ReadingLook = z.infer<typeof ReadingLook>

export const DEFAULT_LOOK: ReadingLook = { size: 'medium', spacing: 'normal', paper: 'day' }

export const SPACING_NAMES: Record<ReadingLook['spacing'], string> = { tight: 'Sít', normal: 'Vừa', loose: 'Thoáng' }
