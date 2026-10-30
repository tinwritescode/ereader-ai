export const PLAN_NAMES = ['free', 'plus', 'max'] as const;
export type PlanName = (typeof PLAN_NAMES)[number];

export type PlanLimits = {
  books: number;
  monthlyDigests: number;
  monthlyVbeeMinutes: number;
  maxFileBytes: number;
};

const MB = 1024 * 1024;

export const PLANS = {
  free: { books: 3, monthlyDigests: 10, monthlyVbeeMinutes: 30, maxFileBytes: 20 * MB },
  plus: { books: 30, monthlyDigests: 100, monthlyVbeeMinutes: 300, maxFileBytes: 100 * MB },
  max: { books: 200, monthlyDigests: 500, monthlyVbeeMinutes: 1_500, maxFileBytes: 100 * MB },
} satisfies Record<PlanName, PlanLimits>;

export type Role = 'user' | 'super_admin';

export type Meter = 'digests' | 'vbeeSeconds';

export type Account = {
  id: string;
  email: string;
  role: Role;
  plan: PlanName;
  /** The plan the account asked for, until a super admin decides. */
  requestedPlan: PlanName | null;
};

export type MonthlyUsage = Record<Meter, number>;

export const NO_USAGE: MonthlyUsage = { digests: 0, vbeeSeconds: 0 };

/** The calendar month usage counts against, in UTC, e.g. "2026-11". */
export function usageMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

/** The day the counters of [now]'s month start again. */
export function nextReset(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}
