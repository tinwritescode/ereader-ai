import { expect, it } from 'vitest'
import { challengeOf, randomToken } from './pkce'

it('matches the RFC 7636 example', () => {
  expect(challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
})

it('never repeats a token', () => {
  expect(randomToken()).not.toBe(randomToken())
})
