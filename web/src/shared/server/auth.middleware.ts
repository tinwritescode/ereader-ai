import { createMiddleware } from '@tanstack/react-start'
import { backend } from './backend'

/** Gives a server function the backend, called as the signed-in reader. */
export const authMiddleware = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { backend } }),
)
