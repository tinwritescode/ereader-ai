import '@tanstack/react-start/server-only'
import { BackendFailure, authedOnce, authedResponse, publicResponse } from './backend'

const COVER_CACHE = 'public, max-age=86400'

function failed(error: unknown): Response {
  if (!(error instanceof BackendFailure)) throw error
  const status = error.message === 'SIGN_IN_REQUIRED' ? 401 : 502
  return Response.json({ code: error.message }, { status })
}

/** Passes the backend's answer on without holding it in memory. */
function streamed(upstream: Response, extra: Record<string, string> = {}): Response {
  const headers = new Headers(extra)
  const type = upstream.headers.get('content-type')
  if (type) headers.set('content-type', type)
  const length = upstream.headers.get('content-length')
  if (length) headers.set('content-length', length)
  return new Response(upstream.body, { status: upstream.status, headers })
}

export async function coverResponse(id: string): Promise<Response> {
  try {
    const upstream = await publicResponse(`/books/${encodeURIComponent(id)}/cover`)
    return streamed(upstream, upstream.ok ? { 'cache-control': COVER_CACHE } : {})
  } catch (error) {
    return failed(error)
  }
}

export async function speechResponse(request: Request): Promise<Response> {
  try {
    const body = await request.text()
    return streamed(
      await authedResponse('/speech', { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
    )
  } catch (error) {
    return failed(error)
  }
}

/** The file goes straight through, so it can be sent once; on an expired token the browser sends it again. */
export async function uploadResponse(request: Request): Promise<Response> {
  const type = request.headers.get('content-type')
  if (!type?.startsWith('multipart/form-data') || !request.body)
    return Response.json({ code: 'FILE_REQUIRED' }, { status: 400 })
  try {
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: { 'content-type': type },
      body: request.body,
      duplex: 'half',
    }
    const sent = await authedOnce('/books', init)
    return sent.kind === 'sent' ? streamed(sent.response) : Response.json({ code: 'SESSION_RENEWED' }, { status: 401 })
  } catch (error) {
    return failed(error)
  }
}
