import { expect, test } from '@playwright/test'
import { open, signIn, stub } from './helpers'

test.beforeEach(async () => {
  await stub.reset()
})

const UNFINISHED = {
  sessionId: '0b7d2a4e-0000-4000-8000-000000000011',
  mode: 'read',
  bookId: 'deep',
  chapterId: 'deep-2',
  chapterLabel: 'Chương Hai',
  length: 'shortened',
  minutes: 6,
  block: 7,
  offset: 0,
  quote: 'Đoạn 6 kể tiếp câu chuyện.',
  progress: 0.42,
  done: false,
  startedAt: new Date(Date.now() - 600_000).toISOString(),
  endedAt: new Date(Date.now() - 300_000).toISOString(),
}

test('asks for the minutes, then plans the rest of the chapter left unfinished and what fits after it', async ({
  page,
}) => {
  await signIn(page)
  await stub.set({ history: [UNFINISHED] })
  await open(page, '/')
  await page.getByRole('navigation', { name: 'Chính' }).getByRole('link', { name: 'Hôm nay' }).click()
  await expect(page.getByRole('heading', { name: 'Hôm nay' })).toBeVisible()
  await expect(page.getByRole('button', { name: "15'" })).toHaveAttribute('aria-pressed', 'true')

  const plan = page.getByRole('list', { name: 'Kế hoạch' }).getByRole('listitem')
  await expect(plan).toHaveCount(2)
  await expect(plan.first()).toContainText('Chương Hai')
  await expect(plan.first()).toContainText('đọc tiếp chỗ dừng')
  await expect(plan.last()).toContainText('Chương Ba')

  await page.getByRole('button', { name: "5'", exact: true }).click()
  await expect(plan).toHaveCount(1)
  await page.getByRole('link', { name: 'Đọc 3 phút này' }).click()
  await expect(page).toHaveURL(/\/books\/deep\/chapters\/deep-2\?length=shortened&minutes=6&resume=true&block=7/)
})

test('with nothing read yet, starts the first book past its front matter, and can be heard instead', async ({
  page,
}) => {
  await signIn(page)
  await open(page, '/today')
  const plan = page.getByRole('list', { name: 'Kế hoạch' }).getByRole('listitem')
  await expect(plan).toHaveCount(2)
  await expect(plan.first()).toContainText('Chương Một')
  await expect(page.getByRole('link', { name: 'Đọc 15 phút này' })).toBeVisible()

  await page.getByRole('link', { name: 'Nghe thay vì đọc' }).click()
  await expect(page).toHaveURL(/\/books\/deep\/chapters\/deep-1\?length=vietnamese&minutes=12&listen=true$/)
})
