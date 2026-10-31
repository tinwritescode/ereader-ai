import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/_shelf/plans')({
  component: () => <h1>Plans</h1>,
})
