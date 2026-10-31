import { redact } from '@tanstack/redact/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

// The only switch between the two runtimes: app code imports `react` either way.
const useRedact = process.env.WEB_RUNTIME !== 'react'

export default defineConfig({
  server: { port: 3000 },
  resolve: { tsconfigPaths: true },
  ssr: useRedact ? { noExternal: true } : {},
  plugins: [tanstackStart(), nitro(), react(), ...(useRedact ? [redact()] : [])],
})
