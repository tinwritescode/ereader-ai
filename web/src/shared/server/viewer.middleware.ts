import { createMiddleware } from '@tanstack/react-start'
import { viewerBackend } from './backend'

/** Gives a server function the backend, called from a shared link, with no account. */
export const viewerMiddleware = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { viewerBackend } }),
)
