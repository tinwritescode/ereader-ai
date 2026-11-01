import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '~/shared/server/auth.middleware'
import type { Release } from '../domain/release'

const Note = z.array(z.object({ text: z.string(), marked: z.boolean() }))

export const ReleaseWire = z.object({
  version: z.string(),
  date: z.string(),
  title: z.string(),
  added: z.array(Note),
  fixed: z.array(Note),
})

const listReleases = createServerFn()
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Release[]> => {
    const { releases } = await context.backend.json({
      path: '/changelog',
      schema: z.object({ releases: z.array(ReleaseWire) }),
    })
    return releases
  })

/** Every release, newest first. */
export const changelogQuery = () =>
  queryOptions({ queryKey: ['changelog'], queryFn: () => listReleases(), staleTime: 60 * 60 * 1000 })
