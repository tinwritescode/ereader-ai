import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '~/shared/server/auth.middleware'
import { HistoryWire, SessionReport } from '../domain/history'

const SessionId = z.object({ sessionId: z.uuid() })

const listHistory = createServerFn()
  .middleware([authMiddleware])
  .handler(({ context }) => context.backend.json({ path: '/history', schema: HistoryWire }))

/** Sent again as reading goes on; the account keeps one session per id. */
export const reportSession = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(SessionId.extend({ report: SessionReport }))
  .handler(({ context, data: { sessionId, report } }) =>
    context.backend.empty({ path: `/history/sessions/${sessionId}`, method: 'PUT', body: report }),
  )

export const removeSession = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(SessionId)
  .handler(({ context, data: { sessionId } }) =>
    context.backend.empty({ path: `/history/sessions/${sessionId}`, method: 'DELETE' }),
  )

export const clearHistory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(({ context }) => context.backend.empty({ path: '/history', method: 'DELETE' }))

export const setRecording = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ on: z.boolean() }))
  .handler(({ context, data: { on } }) =>
    context.backend.empty({ path: '/history/recording', method: 'PUT', body: { on } }),
  )

export const historyQuery = () => queryOptions({ queryKey: ['history'], queryFn: () => listHistory() })
