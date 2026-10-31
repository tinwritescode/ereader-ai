import { createFileRoute, redirect } from '@tanstack/react-router'
import { accountsQuery, requireAccount } from '~/features/account/data/account'
import { AdminPage } from '~/features/account/ui/admin-page'

export const Route = createFileRoute('/_app/_shelf/admin')({
  beforeLoad: async ({ context }) => {
    if (!(await requireAccount(context.queryClient)).isSuperAdmin) throw redirect({ to: '/account' })
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(accountsQuery()),
  component: AdminPage,
})
