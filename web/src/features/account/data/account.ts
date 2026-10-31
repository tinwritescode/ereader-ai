import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { codeOf } from '~/features/books/domain/words'
import { authMiddleware } from '~/shared/server/auth.middleware'
import { clearSession } from '~/shared/server/sign-out'
import { PlanName } from '../domain/account'
import type { Account, ManagedAccount, PlanLimits } from '../domain/account'

// The wire's names for voice minutes stop here.
const LimitsWire = z
  .object({
    books: z.int(),
    monthlyDigests: z.int(),
    monthlyVbeeMinutes: z.int(),
    chapterVoice: z.boolean(),
    monthlyBookTranslations: z.int(),
  })
  .transform(({ monthlyVbeeMinutes, ...limits }): PlanLimits => ({
    ...limits,
    monthlyVoiceMinutes: monthlyVbeeMinutes,
  }))

export const AccountWire = z
  .object({
    email: z.string(),
    role: z.string(),
    plan: PlanName,
    requestedPlan: PlanName.nullable(),
    usage: z.object({ digests: z.int(), vbeeMinutes: z.int(), bookTranslations: z.int() }),
    resetsOn: z.coerce.string(),
    plans: z.object({ free: LimitsWire, plus: LimitsWire, max: LimitsWire }),
  })
  .transform(({ role, usage, ...account }): Account => ({
    ...account,
    isSuperAdmin: role === 'super_admin',
    digestsUsed: usage.digests,
    voiceMinutesUsed: usage.vbeeMinutes,
    bookTranslationsUsed: usage.bookTranslations,
  }))

const ManagedWire = z
  .object({
    id: z.string(),
    email: z.string(),
    role: z.string(),
    plan: PlanName,
    requestedPlan: PlanName.nullable(),
    usage: z.object({ digests: z.int() }),
  })
  .transform(({ role, usage, ...account }): ManagedAccount => ({
    ...account,
    isSuperAdmin: role === 'super_admin',
    digestsUsed: usage.digests,
  }))

const getMe = createServerFn()
  .middleware([authMiddleware])
  .handler(({ context }) => context.backend.json({ path: '/me', schema: AccountWire }))

const PlanInput = z.object({ plan: PlanName })

export const requestPlan = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(PlanInput)
  .handler(({ context, data }) => context.backend.empty({ path: '/me/plan-request', method: 'POST', body: data }))

const listAccounts = createServerFn()
  .middleware([authMiddleware])
  .handler(({ context }) =>
    context.backend.json({ path: '/admin/accounts', schema: z.object({ accounts: z.array(ManagedWire) }) }),
  )

export const setPlan = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1), plan: PlanName }))
  .handler(({ context, data: { id, plan } }) =>
    context.backend.empty({ path: `/admin/accounts/${encodeURIComponent(id)}`, method: 'PATCH', body: { plan } }),
  )

export const signOut = createServerFn({ method: 'POST' }).handler(() => clearSession())

export const meQuery = () => queryOptions({ queryKey: ['me'], queryFn: () => getMe() })
export const accountsQuery = () =>
  queryOptions({ queryKey: ['admin', 'accounts'], queryFn: async () => (await listAccounts()).accounts })

/** Lets only a signed-in reader past; anyone else goes to the sign-in page. */
export async function requireAccount(queryClient: QueryClient): Promise<Account> {
  try {
    return await queryClient.ensureQueryData(meQuery())
  } catch (error) {
    if (codeOf(error) === 'SIGN_IN_REQUIRED') throw redirect({ to: '/login' })
    throw error
  }
}
