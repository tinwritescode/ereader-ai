import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/_shelf/tasks')({
  component: () => <h1>Tasks</h1>,
})
