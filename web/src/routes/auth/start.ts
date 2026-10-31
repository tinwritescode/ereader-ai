import { createFileRoute } from '@tanstack/react-router'
import { startSignIn } from '~/shared/server/sign-in'

export const Route = createFileRoute('/auth/start')({
  server: { handlers: { GET: ({ request }) => startSignIn(request) } },
})
