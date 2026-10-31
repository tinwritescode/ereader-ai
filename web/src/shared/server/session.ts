import '@tanstack/react-start/server-only'
import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { config } from './config'
import type { Tokens } from './renewal'

const ACCESS = 'sd_access'
const REFRESH = 'sd_refresh'
const SIGN_IN = 'sd_sign_in'
const THIRTY_DAYS = 30 * 24 * 60 * 60
const TEN_MINUTES = 10 * 60

const PendingSignIn = z.object({ verifier: z.string().min(1), state: z.string().min(1) })
export type PendingSignIn = z.infer<typeof PendingSignIn>

/** Never reachable from page JS, and sent on top-level returns from WorkOS. */
function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: config().WEB_INSECURE_COOKIES === undefined,
    sameSite: 'lax',
    path: '/',
    maxAge,
  } as const
}

export function readTokens(): Tokens | null {
  const access = getCookie(ACCESS)
  const refresh = getCookie(REFRESH)
  return access && refresh ? { access, refresh } : null
}

export function writeTokens({ access, refresh }: Tokens): void {
  setCookie(ACCESS, access, cookieOptions(THIRTY_DAYS))
  setCookie(REFRESH, refresh, cookieOptions(THIRTY_DAYS))
}

export function clearTokens(): void {
  deleteCookie(ACCESS, cookieOptions(0))
  deleteCookie(REFRESH, cookieOptions(0))
}

export function writePendingSignIn(pending: PendingSignIn): void {
  setCookie(SIGN_IN, JSON.stringify(pending), cookieOptions(TEN_MINUTES))
}

export function takePendingSignIn(): PendingSignIn | null {
  const raw = getCookie(SIGN_IN)
  deleteCookie(SIGN_IN, cookieOptions(0))
  if (!raw) return null
  try {
    const parsed = PendingSignIn.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
