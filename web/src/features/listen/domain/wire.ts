import { z } from 'zod'

export const VoiceWire = z.object({ code: z.string(), name: z.string(), gender: z.string() })
