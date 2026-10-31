import { z } from 'zod'

export const PlanName = z.enum(['free', 'plus', 'max'])
export type PlanName = z.infer<typeof PlanName>

export const PLAN_NAMES = PlanName.options

const LABELS: Record<PlanName, string> = { free: 'Free', plus: 'Plus', max: 'Max' }
export const planLabel = (plan: PlanName): string => LABELS[plan]

export type PlanLimits = {
  books: number
  monthlyDigests: number
  monthlyVoiceMinutes: number
  /** May prepare a whole chapter's audio ahead of listening. */
  chapterVoice: boolean
  /** Whole books translated into Vietnamese a month. */
  monthlyBookTranslations: number
}

export type Account = {
  email: string
  isSuperAdmin: boolean
  plan: PlanName
  requestedPlan: PlanName | null
  digestsUsed: number
  voiceMinutesUsed: number
  bookTranslationsUsed: number
  /** The day the monthly counters start again. */
  resetsOn: string
  plans: Record<PlanName, PlanLimits>
}

/** One line of the super admin's list. */
export type ManagedAccount = Pick<Account, 'email' | 'isSuperAdmin' | 'plan' | 'requestedPlan' | 'digestsUsed'> & { id: string }

export const limitsOf = ({ plan, plans }: Pick<Account, 'plan' | 'plans'>): PlanLimits => plans[plan]

/** How people read the reset day, e.g. "ngày 1/12". */
export function resetLabel({ resetsOn }: Pick<Account, 'resetsOn'>): string {
  const day = new Date(resetsOn)
  return `ngày ${day.getUTCDate()}/${day.getUTCMonth() + 1}`
}

/** "1.500", the way Vietnamese writes thousands. */
export function countLabel(value: number): string {
  return value >= 1000 ? `${Math.floor(value / 1000)}.${String(value % 1000).padStart(3, '0')}` : `${value}`
}

export const isHigher = (plan: PlanName, than: PlanName): boolean => PLAN_NAMES.indexOf(plan) > PLAN_NAMES.indexOf(than)

export function planLines(limits: PlanLimits): string[] {
  return [
    `${countLabel(limits.books)} cuốn sách`,
    `${countLabel(limits.monthlyDigests)} chương AI mỗi tháng`,
    `${countLabel(limits.monthlyVoiceMinutes)} phút giọng qua mạng mỗi tháng`,
    ...(limits.chapterVoice ? ['Tạo sẵn giọng đọc cả chương và cả sách'] : []),
    ...(limits.monthlyBookTranslations > 0
      ? [`Dịch ${countLabel(limits.monthlyBookTranslations)} cuốn sách sang tiếng Việt mỗi tháng`]
      : []),
  ]
}

export function adminNote({ isSuperAdmin, requestedPlan, digestsUsed }: Pick<ManagedAccount, 'isSuperAdmin' | 'requestedPlan' | 'digestsUsed'>): string {
  if (isSuperAdmin) return 'super admin'
  if (requestedPlan) return `muốn lên ${planLabel(requestedPlan)}`
  return `${digestsUsed} chương AI tháng này`
}
