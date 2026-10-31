import { createFileRoute } from '@tanstack/react-router'
import { speechResponse } from '~/shared/server/binary'

export const Route = createFileRoute('/api/speech')({
  server: { handlers: { POST: ({ request }) => speechResponse(request) } },
})
