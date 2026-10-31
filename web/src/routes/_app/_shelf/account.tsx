import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/_shelf/account')({
  component: () => <h1>Account</h1>,
})
