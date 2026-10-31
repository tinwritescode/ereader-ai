import { Outlet, createFileRoute } from '@tanstack/react-router'
import { TasksCount } from '~/features/tasks/ui/task-notices'
import { Shell } from '~/shared/ui/shell'

export const Route = createFileRoute('/_app/_shelf')({
  component: () => (
    <Shell tasksCount={<TasksCount />}>
      <Outlet />
    </Shell>
  ),
})
