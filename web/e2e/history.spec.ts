import { expect, test } from '@playwright/test'
import { open, signIn, stub } from './helpers'

test.beforeEach(async () => {
  await stub.reset()
})

const MINUTE = 60_000
const ago = (minutes: number) => new Date(Date.now() - minutes * MINUTE).toISOString()

const READ = {
  sessionId: '0b7d2a4e-0000-4000-8000-000000000001',
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
  startedAt: ago(8),
  endedAt: ago(2),
}

const HEARD = {
  ...READ,
  sessionId: '0b7d2a4e-0000-4000-8000-000000000002',
  mode: 'listen',
  voice: 'Hạt Dẻ',
  bookId: 'viet',
  chapterId: 'viet-1',
  chapterLabel: 'Chương Một',
  length: 'original',
  minutes: 12,
  quote: 'Câu thứ hai rất ngắn.',
  done: true,
  progress: 1,
  startedAt: ago(30),
  endedAt: ago(20),
}

test('reading a chapter is kept on the account, and its line opens the reader at that spot', async ({ page }) => {
  await signIn(page)
  await open(page, '/books/deep/chapters/deep-1?length=original&minutes=12')
  await expect
    .poll(async () => (await stub.state()).history)
    .toEqual([expect.objectContaining({ mode: 'read', bookId: 'deep', chapterId: 'deep-1', length: 'original' })])

  await open(page, '/')
  await page.getByRole('navigation', { name: 'Chính' }).getByRole('link', { name: 'Lịch sử' }).click()
  await expect(page.getByRole('heading', { name: 'Lịch sử đọc và nghe' })).toBeVisible()
  const line = page.getByRole('listitem').filter({ hasText: 'Deep Work' })
  await expect(page.getByRole('heading', { name: /^Hôm nay/ })).toBeVisible()
  await line.getByRole('link', { name: 'Đọc tiếp từ đây' }).click()
  await expect(page).toHaveURL(/\/books\/deep\/chapters\/deep-1\?.*resume=true/)
  await expect(page).toHaveURL(/block=\d+/)
})

test('a spot from another machine opens where it stopped', async ({ page }) => {
  await signIn(page)
  await stub.set({ history: [{ ...READ, length: 'original', minutes: 12 }] })
  await open(page, '/history')
  await page.getByRole('link', { name: 'Đọc tiếp từ đây' }).click()
  await expect(page).toHaveURL(/\/books\/deep\/chapters\/deep-2\?.*block=7/)
  // The history page stays up until the chapter arrives, and it shows the same quote.
  await expect(page.getByText('Đầu chương deep-2')).toBeAttached()
  await expect(page.getByText('Đầu chương deep-2')).not.toBeInViewport()
  await expect(page.getByText('Đoạn 6 kể tiếp câu chuyện. Nó có hai câu.')).toBeInViewport()
})

test('filters by reading and listening, removes a line, and clears the rest', async ({ page }) => {
  await signIn(page)
  await stub.set({ history: [READ, HEARD] })
  await open(page, '/history')
  const lines = page.getByRole('listitem')
  await expect(lines).toHaveCount(2)
  await expect(lines.first()).toContainText('dừng ở 42%')
  await expect(lines.last()).toContainText('xong!')
  await expect(lines.last()).toContainText('nghe giọng Hạt Dẻ')

  await page.getByRole('button', { name: 'Nghe', exact: true }).click()
  await expect(lines).toHaveCount(1)
  await expect(lines).toContainText('Cuộc chiến sinh tồn')
  await page.getByRole('button', { name: 'Tất cả' }).click()

  await page.getByLabel('Sách').selectOption({ label: 'Deep Work' })
  await expect(lines).toHaveCount(1)
  await page.getByLabel('Sách').selectOption({ label: 'Mọi sách' })

  await lines.first().getByRole('button', { name: 'Xoá dòng này khỏi lịch sử' }).click()
  await expect(lines).toHaveCount(1)
  expect((await stub.state()).history).toEqual([expect.objectContaining({ sessionId: HEARD.sessionId })])

  await page.getByRole('button', { name: 'Xoá toàn bộ lịch sử' }).click()
  await page.getByRole('button', { name: 'Xoá hết' }).click()
  await expect(page.getByText('Chưa có lần đọc hay nghe nào.')).toBeVisible()
  expect((await stub.state()).history).toEqual([])
})

test('pausing the history keeps reading off the account', async ({ page }) => {
  await signIn(page)
  await open(page, '/history')
  await page.getByRole('checkbox', { name: 'Ghi lịch sử khi đọc và nghe' }).uncheck()
  await expect.poll(async () => (await stub.state()).recording).toBe(false)

  await open(page, '/books/deep/chapters/deep-1?length=original&minutes=12')
  await page.waitForTimeout(800)
  expect((await stub.state()).history).toEqual([])

  await open(page, '/history')
  await expect(page.getByRole('checkbox', { name: 'Ghi lịch sử khi đọc và nghe' })).not.toBeChecked()
})
