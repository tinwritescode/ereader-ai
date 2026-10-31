import { createFileRoute } from '@tanstack/react-router'
import { tasksQuery } from '~/features/tasks/data/tasks'
import { TasksPage } from '~/features/tasks/ui/tasks-page'

export const Route = createFileRoute('/_app/_shelf/tasks')({
  loader: ({ context }) => context.queryClient.ensureQueryData(tasksQuery()),
  component: TasksPage,
})
