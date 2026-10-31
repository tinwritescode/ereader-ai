import { defineConfig, devices } from '@playwright/test'

const STUB = 4010
const env = (port: number, extra: Record<string, string> = {}) => ({
  PORT: String(port),
  BACKEND_URL: `http://localhost:${STUB}`,
  WEB_URL: `http://localhost:${port}`,
  WORKOS_CLIENT_ID: 'client_test',
  WORKOS_AUTHORIZE_URL: `http://localhost:${STUB}/user_management/authorize`,
  ...extra,
})

export default defineConfig({
  testDir: 'e2e',
  // One stub holds one reader's state.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3100' } },
    // WebKit drops Secure cookies on http://localhost, so this server leaves the flag off.
    { name: 'webkit', use: { ...devices['Desktop Safari'], baseURL: 'http://localhost:3101' } },
  ],
  webServer: [
    { command: 'node e2e/stub/backend.ts', port: STUB, env: { STUB_PORT: String(STUB) }, reuseExistingServer: false },
    { command: 'node .output/server/index.mjs', port: 3100, env: env(3100), reuseExistingServer: false },
    {
      command: 'node .output/server/index.mjs',
      port: 3101,
      env: env(3101, { WEB_INSECURE_COOKIES: '1' }),
      reuseExistingServer: false,
    },
  ],
})
