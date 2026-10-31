import { createFileRoute } from '@tanstack/react-router'
import { PlansPage } from '~/features/account/ui/plans-page'
import { pageTitle } from '~/shared/ui/page-title'

export const Route = createFileRoute('/_app/_shelf/plans')({
  head: () => ({ meta: [{ title: pageTitle('Các gói') }] }),
  component: PlansPage,
})
