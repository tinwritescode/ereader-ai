import { z } from 'zod'
import { BookWire } from './books'
import type { Book } from '../domain/book'

const Failure = z.object({ code: z.string() })

type Answer = { status: number; body: unknown }

function post({ file, onProgress }: { file: File; onProgress: (share: number) => void }): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    // Only XHR reports upload progress.
    const request = new XMLHttpRequest()
    request.open('POST', '/api/books/upload')
    request.responseType = 'json'
    request.upload.addEventListener('progress', ({ loaded, total }) => {
      if (total > 0) onProgress(loaded / total)
    })
    request.addEventListener('load', () => resolve({ status: request.status, body: request.response }))
    request.addEventListener('error', () => reject(new Error('NETWORK_ERROR')))
    request.send(form)
  })
}

const codeFrom = ({ status, body }: Answer): string => {
  const failure = Failure.safeParse(body)
  return failure.success ? failure.data.code : `HTTP_${status}`
}

/** Puts an EPUB on the shelf. An expired token consumes the stream, so the file goes again once. */
export async function uploadEpub({ file, onProgress }: { file: File; onProgress: (share: number) => void }): Promise<Book> {
  const first = await post({ file, onProgress })
  const answer = first.status === 401 && codeFrom(first) === 'SESSION_RENEWED' ? await post({ file, onProgress }) : first
  if (answer.status < 200 || answer.status >= 300) throw new Error(codeFrom(answer))
  const book = BookWire.safeParse(answer.body)
  if (!book.success) throw new Error('UNEXPECTED_RESPONSE')
  return book.data
}

