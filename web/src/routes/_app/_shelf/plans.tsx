import { createFileRoute } from '@tanstack/react-router'
import { PlansPage } from '~/features/account/ui/plans-page'

export const Route = createFileRoute('/_app/_shelf/plans')({
  component: PlansPage,
})
