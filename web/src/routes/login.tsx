import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SignInPage } from '~/features/account/ui/sign-in-page'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ failure: z.string().optional() }),
  component: () => <SignInPage failure={Route.useSearch().failure} />,
})
