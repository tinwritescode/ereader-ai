import '@tanstack/react-start/server-only'
import type { z } from 'zod'
import { config } from './config'
import { createRenewal } from './renewal'
import type { Renewed, Tokens } from './renewal'
import { clearTokens, keepDevice, readDevice, readTokens, writeTokens } from './session'

const KEEP_RENEWAL_MS = 30_000

/** A failed call; `message` is the backend's stable code, which survives the trip to the browser. */
export class BackendFailure extends Error {}

async function failureOf(response: Response): Promise<BackendFailure> {
  const body: unknown = await response.json().catch(() => null)
  const code = typeof body === 'object' && body !== null && 'code' in body ? body.code : null
  return new BackendFailure(typeof code === 'string' ? code : `HTTP_${response.status}`)
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${config().BACKEND_URL}${path}`, init)
  } catch {
    throw new BackendFailure('NETWORK_ERROR')
  }
}

const jsonInit = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

function tokensFrom(body: unknown): Tokens {
  if (typeof body === 'object' && body !== null && 'accessToken' in body && 'refreshToken' in body) {
    const { accessToken, refreshToken } = body
    if (typeof accessToken === 'string' && typeof refreshToken === 'string')
      return { access: accessToken, refresh: refreshToken }
  }
  throw new BackendFailure('UNEXPECTED_RESPONSE')
}

const renew = createRenewal({
  keepMs: KEEP_RENEWAL_MS,
  now: Date.now,
  exchange: async (refreshToken): Promise<Renewed> => {
    const response = await send('/auth/refresh', jsonInit({ refreshToken }))
    if (response.status === 401) return { kind: 'lost' }
    if (!response.ok) throw await failureOf(response)
    return { kind: 'renewed', tokens: tokensFrom(await response.json()) }
  },
})

export async function exchangeCode({ code, codeVerifier }: { code: string; codeVerifier: string }): Promise<Tokens> {
  const response = await send('/auth/token', jsonInit({ code, codeVerifier }))
  if (!response.ok) throw await failureOf(response)
  return tokensFrom(await response.json())
}

function signedOut(): BackendFailure {
  clearTokens()
  return new BackendFailure('SIGN_IN_REQUIRED')
}

function withBearer(init: RequestInit, access: string): RequestInit {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${access}`)
  return { ...init, headers }
}

async function renewed(tokens: Tokens): Promise<Tokens> {
  const result = await renew(tokens.refresh)
  if (result.kind === 'lost') throw signedOut()
  writeTokens(result.tokens)
  return result.tokens
}

/** Sends with the session's token, renewing it once when it has expired. */
export async function authedResponse(path: string, init: RequestInit = {}): Promise<Response> {
  const tokens = readTokens()
  if (!tokens) throw signedOut()
  const response = await send(path, withBearer(init, tokens.access))
  if (response.status !== 401) return response
  return send(path, withBearer(init, (await renewed(tokens)).access))
}

/** For a body that can be read only once: renews, and leaves the retry to the caller. */
export async function authedOnce(
  path: string,
  init: RequestInit,
): Promise<{ kind: 'sent'; response: Response } | { kind: 'expired' }> {
  const tokens = readTokens()
  if (!tokens) throw signedOut()
  const response = await send(path, withBearer(init, tokens.access))
  if (response.status !== 401) return { kind: 'sent', response }
  await renewed(tokens)
  return { kind: 'expired' }
}

type JsonCall<Schema extends z.ZodType> = {
  path: string
  method?: 'GET' | 'POST' | 'PATCH'
  body?: unknown
  schema: Schema
}
type EmptyCall = { path: string; method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown }

function initOf({ method = 'GET', body }: { method?: string; body?: unknown }): RequestInit {
  return body === undefined
    ? { method }
    : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

/** Checks what comes back, the one place outside data enters. */
async function checked<Schema extends z.ZodType>(response: Response, schema: Schema): Promise<z.output<Schema>> {
  if (!response.ok) throw await failureOf(response)
  const parsed = schema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new BackendFailure('UNEXPECTED_RESPONSE')
  return parsed.data
}

export const backend = {
  async json<Schema extends z.ZodType>({ schema, ...call }: JsonCall<Schema>): Promise<z.output<Schema>> {
    return checked(await authedResponse(call.path, initOf(call)), schema)
  },
  async empty(call: EmptyCall): Promise<void> {
    const response = await authedResponse(call.path, initOf(call))
    if (!response.ok) throw await failureOf(response)
  },
}

export type Backend = typeof backend

/** Sends as this machine, for what comes back as it is. */
export function viewerResponse(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const device = readDevice()
  if (device) headers.set('x-share-device', device)
  return send(path, { ...init, headers })
}

/** For a shared link: no session, only the key that stands for this machine. */
export const viewerBackend = {
  async json<Schema extends z.ZodType>({ path, schema }: { path: string; schema: Schema }): Promise<z.output<Schema>> {
    return checked(await viewerResponse(path), schema)
  },
  async open({ path, password }: { path: string; password: string }): Promise<void> {
    const response = await send(path, jsonInit({ password, device: keepDevice() }))
    if (!response.ok) throw await failureOf(response)
  },
}

/** Without a session, for the one public route: covers. */
export function publicResponse(path: string): Promise<Response> {
  return send(path, {})
}
