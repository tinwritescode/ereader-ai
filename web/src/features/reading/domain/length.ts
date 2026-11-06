import { z } from 'zod'

export const ReadingLength = z.enum(['original', 'vietnamese', 'shortened', 'keyPoints'])
export type ReadingLength = z.infer<typeof ReadingLength>

export const LengthOption = z.object({ length: ReadingLength, minutes: z.int().min(0) })
export type LengthOption = z.infer<typeof LengthOption>

/** What the reader's address says to open. */
export const ReaderSearch = LengthOption.extend({
  listen: z.boolean().optional(),
  resume: z.boolean().optional(),
  /** The spot to go on from, when it was kept on the account rather than this device. */
  block: z.int().min(0).optional(),
  offset: z.int().min(0).optional(),
})
export type ReaderSearch = z.infer<typeof ReaderSearch>

/** Chapters shorter than this open the original directly. */
export const MINIMUM_SHORTENABLE_MINUTES = 5
const MINIMUM_OPTION_MINUTES = 2

/** AI rewrote it shorter; the original and its translation are whole. */
export function isShortened({ length }: LengthOption): boolean {
  return length === 'shortened' || length === 'keyPoints'
}

export function sameOption(a: LengthOption, b: LengthOption): boolean {
  return a.length === b.length && a.minutes === b.minutes
}

/** Lengths scale with the chapter, so a short chapter is never offered a longer version. */
export function lengthOptionsFor({
  chapterMinutes,
  vietnamese,
}: {
  chapterMinutes: number
  vietnamese: boolean
}): LengthOption[] {
  const whole: LengthOption[] = [
    { length: 'original', minutes: chapterMinutes },
    ...(vietnamese ? [{ length: 'vietnamese' as const, minutes: chapterMinutes }] : []),
  ]
  if (chapterMinutes < MINIMUM_SHORTENABLE_MINUTES) return whole
  return [
    ...whole,
    { length: 'shortened', minutes: Math.round(chapterMinutes * 0.5) },
    {
      length: 'keyPoints',
      minutes: Math.min(Math.max(Math.round(chapterMinutes * 0.25), MINIMUM_OPTION_MINUTES), chapterMinutes),
    },
  ]
}

const NAMES: Record<ReadingLength, string> = {
  original: 'Bản gốc',
  vietnamese: 'Tiếng Việt',
  shortened: 'Rút gọn',
  keyPoints: 'Ý chính',
}

export const lengthName = (length: ReadingLength): string => NAMES[length]

const HINTS: Record<ReadingLength, string> = {
  original: 'Đọc nguyên văn, không qua AI.',
  vietnamese: 'Cả chương, AI dịch sang tiếng Việt.',
  shortened: 'Giữ mọi luận điểm, bỏ ví dụ lặp lại.',
  keyPoints: 'Chỉ những điều tác giả muốn bạn nhớ.',
}

export const lengthHint = (length: ReadingLength): string => HINTS[length]
