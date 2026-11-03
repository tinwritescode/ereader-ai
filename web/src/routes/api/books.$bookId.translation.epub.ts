import { createFileRoute } from '@tanstack/react-router'
import { translatedEpubResponse } from '~/shared/server/binary'

export const Route = createFileRoute('/api/books/$bookId/translation/epub')({
  server: { handlers: { GET: ({ params }) => translatedEpubResponse(params.bookId) } },
})
