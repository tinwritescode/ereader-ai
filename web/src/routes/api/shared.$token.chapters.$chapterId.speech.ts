import { createFileRoute } from '@tanstack/react-router'
import { sharedSpeechResponse } from '~/shared/server/binary'

export const Route = createFileRoute('/api/shared/$token/chapters/$chapterId/speech')({
  server: { handlers: { POST: ({ request, params }) => sharedSpeechResponse({ request, ...params }) } },
})
