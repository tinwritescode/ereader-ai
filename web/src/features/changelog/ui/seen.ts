import { z } from 'zod'
import { createStored } from '~/shared/ui/stored'

/** The newest version this browser has been shown. */
export const seenRelease = createStored({ key: 'changelog.seen', schema: z.string().nullable(), fallback: null })
