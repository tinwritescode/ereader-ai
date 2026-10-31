import '@tanstack/react-start/server-only'
import { BackendFailure, exchangeCode } from './backend'
import { config } from './config'
import { challengeOf, randomToken } from './pkce'
import { takePendingSignIn, writePendingSignIn, writeTokens } from './session'

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } })
}

export const callbackUrl = (): string => `${config().WEB_URL}/auth/callback`

/** Sends the browser to WorkOS, remembering the proof for its return. */
export function startSignIn(request: Request): Response {
  const verifier = randomToken()
  const state = randomToken()
  writePendingSignIn({ verifier, state })
  const url = new URL(config().WORKOS_AUTHORIZE_URL)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config().WORKOS_CLIENT_ID,
    redirect_uri: callbackUrl(),
    provider: 'authkit',
    code_challenge: challengeOf(verifier),
    code_challenge_method: 'S256',
    state,
    ...(new URL(request.url).searchParams.get('screen') === 'sign-up' ? { screen_hint: 'sign-up' } : {}),
  }).toString()
  return redirectTo(url.toString())
}

const failedTo = (code: string) => redirectTo(`/login?failure=${encodeURIComponent(code)}`)

export async function finishSignIn(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams
  const pending = takePendingSignIn()
  const code = query.get('code')
  if (!pending || !code || query.get('state') !== pending.state) return failedTo('SIGN_IN_FAILED')
  try {
    writeTokens(await exchangeCode({ code, codeVerifier: pending.verifier }))
    return redirectTo('/')
  } catch (error) {
    return failedTo(error instanceof BackendFailure ? error.message : 'SIGN_IN_FAILED')
  }
}
