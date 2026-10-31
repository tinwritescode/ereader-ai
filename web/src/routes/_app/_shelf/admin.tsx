import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/_shelf/admin')({
  component: () => <h1>Admin</h1>,
})
