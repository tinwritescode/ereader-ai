import { defineConfig, devices } from '@playwright/test'

const CHROMIUM_STUB = 4010
const WEBKIT_STUB = 4011
const env = (port: number, stub: number, extra: Record<string, string> = {}) => ({
  PORT: String(port),
  BACKEND_URL: `http://localhost:${stub}`,
  WEB_URL: `http://localhost:${port}`,
  WORKOS_CLIENT_ID: 'client_test',
  WORKOS_AUTHORIZE_URL: `http://localhost:${stub}/user_management/authorize`,
  ...extra,
})

export default defineConfig({
  testDir: 'e2e',
  // One stub holds one reader's state, so each browser runs alone against its own.
  workers: 2,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      workers: 1,
      metadata: { stub: CHROMIUM_STUB },
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3100' },
    },
    // WebKit drops Secure cookies on http://localhost, so this server leaves the flag off.
    {
      name: 'webkit',
      workers: 1,
      metadata: { stub: WEBKIT_STUB },
      use: { ...devices['Desktop Safari'], baseURL: 'http://localhost:3101' },
    },
  ],
  webServer: [
    ...[CHROMIUM_STUB, WEBKIT_STUB].map((stub) => ({
      command: 'node e2e/stub/backend.ts',
      port: stub,
      env: { STUB_PORT: String(stub) },
      reuseExistingServer: false,
    })),
    { command: 'node .output/server/index.mjs', port: 3100, env: env(3100, CHROMIUM_STUB), reuseExistingServer: false },
    {
      command: 'node .output/server/index.mjs',
      port: 3101,
      env: env(3101, WEBKIT_STUB, { WEB_INSECURE_COOKIES: '1' }),
      reuseExistingServer: false,
    },
  ],
})
