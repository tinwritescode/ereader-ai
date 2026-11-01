import { createFileRoute } from '@tanstack/react-router'
import { imageResponse } from '~/shared/server/binary'

export const Route = createFileRoute('/api/images/$name')({
  server: { handlers: { GET: ({ params }) => imageResponse(params.name) } },
})
