import { createFileRoute } from '@tanstack/react-router'
import { uploadResponse } from '~/shared/server/binary'

export const Route = createFileRoute('/api/books/upload')({
  server: { handlers: { POST: ({ request }) => uploadResponse(request) } },
})
