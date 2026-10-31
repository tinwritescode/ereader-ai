import { createFileRoute } from '@tanstack/react-router'
import { tasksQuery } from '~/features/tasks/data/tasks'
import { TasksPage } from '~/features/tasks/ui/tasks-page'
import { pageTitle } from '~/shared/ui/page-title'

export const Route = createFileRoute('/_app/_shelf/tasks')({
  head: () => ({ meta: [{ title: pageTitle('Tác vụ') }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(tasksQuery()),
  component: TasksPage,
})
