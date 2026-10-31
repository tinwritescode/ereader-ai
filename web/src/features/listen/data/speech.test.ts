import { expect, it } from 'vitest'
import { speechCode } from './speech'

it('names running out of minutes without the provider', () => {
  expect(speechCode({ status: 429, body: { code: 'VBEE_LIMIT' } })).toBe('VOICE_LIMIT')
  expect(speechCode({ status: 400, body: { code: 'VOICE_UNKNOWN' } })).toBe('VOICE_UNKNOWN')
  expect(speechCode({ status: 502, body: 'nonsense' })).toBe('HTTP_502')
})
