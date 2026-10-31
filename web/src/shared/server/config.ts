import '@tanstack/react-start/server-only'
import { z } from 'zod'

const Env = z.object({
  BACKEND_URL: z.url().transform((url) => url.replace(/\/$/, '')),
  WEB_URL: z.url().transform((url) => url.replace(/\/$/, '')),
  WORKOS_CLIENT_ID: z.string().min(1),
  WORKOS_AUTHORIZE_URL: z.url().default('https://api.workos.com/user_management/authorize'),
  // WebKit drops Secure cookies on http://localhost; only the test server sets this.
  WEB_INSECURE_COOKIES: z.literal('1').optional(),
})

export type Config = z.infer<typeof Env>

let loaded: Config | undefined

export function config(): Config {
  loaded ??= Env.parse(process.env)
  return loaded
}
