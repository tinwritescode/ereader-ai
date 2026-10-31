import { createFileRoute } from '@tanstack/react-router'
import { coverResponse } from '~/shared/server/binary'

export const Route = createFileRoute('/api/covers/$id')({
  server: { handlers: { GET: ({ params }) => coverResponse(params.id) } },
})
