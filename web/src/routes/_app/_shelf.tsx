import { Outlet, createFileRoute } from '@tanstack/react-router'
import { Shell } from '~/shared/ui/shell'

export const Route = createFileRoute('/_app/_shelf')({
  component: () => (
    <Shell tasksCount={null}>
      <Outlet />
    </Shell>
  ),
})
