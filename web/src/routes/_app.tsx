import { Outlet, createFileRoute } from '@tanstack/react-router'
import { requireAccount } from '~/features/account/data/account'

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context }) => requireAccount(context.queryClient),
  component: Outlet,
})
