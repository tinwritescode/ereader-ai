import { test } from '@playwright/test'
import type { Page } from '@playwright/test'

/** The stub of the browser running this test. */
const stubUrl = () => `http://localhost:${test.info().project.metadata.stub}`

export const stub = {
  reset: () => fetch(`${stubUrl()}/__stub/reset`, { method: 'POST' }),
  expire: () => fetch(`${stubUrl()}/__stub/expire`, { method: 'POST' }),
  set: (values: object) => fetch(`${stubUrl()}/__stub/set`, { method: 'POST', body: JSON.stringify(values) }),
  task: (task: object) => fetch(`${stubUrl()}/__stub/task`, { method: 'POST', body: JSON.stringify(task) }),
  state: async (): Promise<{
    refreshCalls: number
    speechCalls: string[]
    sharedSpeech: string[]
    uploads: string[]
    requestedPlan: string | null
    accounts: { id: string; plan: string }[]
  }> => (await fetch(`${stubUrl()}/__stub/state`)).json(),
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
