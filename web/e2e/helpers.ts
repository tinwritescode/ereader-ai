import type { Page } from '@playwright/test'

const STUB = 'http://localhost:4010'

export const stub = {
  reset: () => fetch(`${STUB}/__stub/reset`, { method: 'POST' }),
  expire: () => fetch(`${STUB}/__stub/expire`, { method: 'POST' }),
  set: (values: object) => fetch(`${STUB}/__stub/set`, { method: 'POST', body: JSON.stringify(values) }),
  task: (task: object) => fetch(`${STUB}/__stub/task`, { method: 'POST', body: JSON.stringify(task) }),
  state: async (): Promise<{
    refreshCalls: number
    speechCalls: string[]
    uploads: string[]
    requestedPlan: string | null
    accounts: { id: string; plan: string }[]
  }> => (await fetch(`${STUB}/__stub/state`)).json(),
}

export const hydrated = (page: Page) => page.locator('html[data-app-ready]').waitFor({ state: 'attached' })

export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await hydrated(page)
}

export async function signIn(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByRole('link', { name: 'Đăng nhập' }).click()
  await page.getByRole('heading', { name: 'Thư viện' }).waitFor()
  await hydrated(page)
}
