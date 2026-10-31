import { createFileRoute } from '@tanstack/react-router'
import { finishSignIn } from '~/shared/server/sign-in'

export const Route = createFileRoute('/auth/callback')({
  server: { handlers: { GET: ({ request }) => finishSignIn(request) } },
})
