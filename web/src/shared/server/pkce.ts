import { createHash, randomBytes } from 'node:crypto'

export function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

export function challengeOf(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}
