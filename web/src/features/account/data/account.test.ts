import { expect, it } from 'vitest'
import { AccountWire } from './account'

const limits = { books: 3, monthlyDigests: 10, monthlyVbeeMinutes: 30, maxFileBytes: 1, chapterVoice: false, monthlyBookTranslations: 0 }

it('turns the wire into an account, leaving provider names behind', () => {
  const account = AccountWire.parse({
    email: 'a@b.c',
    role: 'super_admin',
    plan: 'free',
    requestedPlan: null,
    usage: { digests: 1, vbeeMinutes: 2, bookTranslations: 3 },
    resetsOn: '2026-12-01T00:00:00.000Z',
    plans: { free: limits, plus: limits, max: limits },
  })
  expect(account).toMatchObject({ isSuperAdmin: true, digestsUsed: 1, voiceMinutesUsed: 2, bookTranslationsUsed: 3 })
  expect(account.plans.free.monthlyVoiceMinutes).toBe(30)
  expect(JSON.stringify(account)).not.toMatch(/vbee/i)
})

it('refuses a plan it does not know', () => {
  expect(AccountWire.safeParse({ plan: 'gold' }).success).toBe(false)
})
