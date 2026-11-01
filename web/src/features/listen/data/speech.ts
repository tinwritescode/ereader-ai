import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '~/shared/server/auth.middleware'
import { VoiceWire } from '../domain/wire'

const Voices = z.object({ voices: z.array(VoiceWire) })
const Failure = z.object({ code: z.string() })

const listVoices = createServerFn()
  .middleware([authMiddleware])
  .handler(({ context }) => context.backend.json({ path: '/speech/voices', schema: Voices }))

// Only voices the server offers: the web has none of its own.
export const voicesQuery = () =>
  queryOptions({ queryKey: ['voices'], queryFn: async () => (await listVoices()).voices, staleTime: Infinity })

/** The wire calls running out of minutes after its old provider; past here it is `VOICE_LIMIT`. */
export function speechCode({ status, body }: { status: number; body: unknown }): string {
  const failure = Failure.safeParse(body)
  if (status === 429 || (failure.success && failure.data.code === 'VBEE_LIMIT')) return 'VOICE_LIMIT'
  return failure.success ? failure.data.code : `HTTP_${status}`
}

/** One sentence as audio. */
export async function fetchClip(
  { text, voiceCode }: { text: string; voiceCode: string },
  path = '/api/speech',
): Promise<Blob> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voiceCode }),
    })
  } catch {
    throw new Error('NETWORK_ERROR')
  }
  if (!response.ok)
    throw new Error(speechCode({ status: response.status, body: await response.json().catch(() => null) }))
  return response.blob()
}
