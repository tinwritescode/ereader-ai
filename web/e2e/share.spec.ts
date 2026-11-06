import { expect, test } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { hydrated, open, signIn, stub } from './helpers'

const PASSWORD = 'mat-khau-1'
const LINK = '/s/link-1'

const machines: BrowserContext[] = []

test.beforeEach(async () => {
  await stub.reset()
})

// A page left open starves the next test's in WebKit.
test.afterEach(async () => {
  await Promise.all(machines.splice(0).map((context) => context.close()))
})

/** Another machine: nothing of the reader's, and none of its cookies. */
async function machine(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext({ baseURL })
  machines.push(context)
  return context.newPage()
}

async function makeLink(page: Page): Promise<void> {
  await signIn(page)
  await open(page, '/books/deep')
  await page.getByRole('button', { name: 'Chia sẻ' }).click()
  await page.getByLabel('Mật khẩu cho người nhận').fill(PASSWORD)
  await page.getByRole('button', { name: 'Tạo link' }).click()
}

async function enter(page: Page, password = PASSWORD): Promise<void> {
  await open(page, LINK)
  await page.getByLabel('Mật khẩu').fill(password)
  await page.getByRole('button', { name: 'Mở sách' }).click()
}

test('the owner makes a link, sees it once, and takes it back', async ({ page, browser, baseURL }) => {
  await makeLink(page)
  await expect(page.getByLabel('Link chia sẻ')).toHaveValue(new RegExp(`${LINK}$`))
  await expect(page.getByText('Chưa ai mở')).toBeVisible()

  const viewer = await machine(browser, baseURL)
  await enter(viewer)
  await expect(viewer.getByRole('heading', { name: 'Deep Work' })).toBeVisible()

  await open(page, '/books/deep')
  await page.getByRole('button', { name: 'Chia sẻ' }).click()
  await expect(page.getByLabel('Link chia sẻ')).toHaveCount(0)
  await expect(page.getByText('Đã khóa vào một máy')).toBeVisible()
  await page.getByRole('button', { name: 'Thu hồi' }).click()
  await expect(page.getByText('Đã khóa vào một máy')).toHaveCount(0)

  await viewer.reload()
  await expect(viewer.getByText('Link này không còn dùng được.')).toBeVisible()
})

test('a viewer signs in nowhere, reads the book, and has nothing to edit', async ({ page, browser, baseURL }) => {
  await makeLink(page)
  const viewer = await machine(browser, baseURL)

  await enter(viewer, 'sai-mat-khau')
  await expect(viewer.getByText('Sai mật khẩu.')).toBeVisible()
  await expect(viewer.getByRole('heading', { name: 'Deep Work' })).toHaveCount(0)

  await viewer.getByLabel('Mật khẩu').fill(PASSWORD)
  await viewer.getByRole('button', { name: 'Mở sách' }).click()
  await expect(viewer.getByRole('heading', { name: 'Deep Work' })).toBeVisible()
  await expect(viewer.getByText('chỉ đọc')).toBeVisible()

  await viewer.getByRole('button', { name: /Chương Hai/ }).click()
  await expect(viewer.locator('[data-block="0"]')).toBeVisible()
  await expect(viewer.getByText('chỉ đọc')).toBeVisible()
  await expect(viewer.locator('input, textarea, [contenteditable]')).toHaveCount(0)

  await viewer.reload()
  await hydrated(viewer)
  await expect(viewer.locator('[data-block="0"]')).toBeVisible()
})

test('a translated chapter opens in Vietnamese, with the original a press away', async ({ page, browser, baseURL }) => {
  await makeLink(page)
  await stub.set({ translationReady: true })
  const viewer = await machine(browser, baseURL)
  await enter(viewer)

  await viewer.getByRole('button', { name: /Chương Hai/ }).click()
  await expect(viewer.locator('[data-block="0"]')).toContainText('Bản dịch:')

  await viewer.getByRole('button', { name: 'gốc' }).click()
  await expect(viewer.locator('[data-block="0"]')).not.toContainText('Bản dịch:')
})

test('the contents read like the book page, with only reading on offer', async ({ page, browser, baseURL }) => {
  await makeLink(page)
  const viewer = await machine(browser, baseURL)
  await open(viewer, LINK)
  await expect(viewer.getByRole('heading', { name: 'Deep Work' })).toHaveCount(0)
  await enter(viewer)

  await expect(viewer.getByRole('heading', { name: 'Deep Work' })).toBeVisible()
  await expect(viewer.locator('[data-cover]')).toBeVisible()
  await expect(viewer.getByText('Cal Newport, 3 chương')).toBeVisible()
  await expect(viewer.getByRole('button', { name: 'Chia sẻ' })).toHaveCount(0)
  await expect(viewer.getByText('Dịch cả sách sang tiếng Việt')).toHaveCount(0)
  await expect(viewer.getByRole('link', { name: 'Thư viện' })).toHaveCount(0)
})

test('a chapter reads in the same reader, without what costs the owner', async ({ page, browser, baseURL }) => {
  await makeLink(page)
  await stub.set({ translationReady: true })
  const viewer = await machine(browser, baseURL)
  await enter(viewer)
  await viewer.getByRole('button', { name: /Chương Hai/ }).click()

  await expect(viewer.getByRole('group', { name: 'Bản đọc' }).getByRole('button')).toHaveText(["gốc 12'", "Việt 12'"])
  await expect(viewer.getByRole('button', { name: 'Trang giấy' })).toBeVisible()
  await expect(viewer.getByRole('link', { name: '‹ Mục lục' })).toBeVisible()
  await expect(viewer.getByText('Nghe từ đoạn đang đọc')).toHaveCount(0)

  await viewer.getByRole('button', { name: 'Trang giấy' }).click()
  await viewer.keyboard.press('Escape')
  await viewer.getByText('Xong Chương Hai').scrollIntoViewIfNeeded()
  await viewer.getByRole('link', { name: 'Đọc Chương Ba' }).click()
  await expect(viewer.getByText('Tên chương 3')).toBeVisible()

  await viewer.getByRole('link', { name: '‹ Mục lục' }).click()
  await expect(viewer.getByRole('heading', { name: 'Deep Work' })).toBeVisible()
})

test('a viewer hears a chapter already voiced, in the voices it has, and starts nothing new', async ({
  page,
  browser,
  baseURL,
}) => {
  await makeLink(page)
  await stub.set({ sharedVoices: ['nam-an'] })
  const viewer = await machine(browser, baseURL)
  await enter(viewer)
  await viewer.getByRole('button', { name: /Chương Hai/ }).click()

  const play = viewer.getByRole('button', { name: 'Nghe', exact: true })
  const note = await viewer.getByText('chỉ đọc').boundingBox()
  const button = await play.boundingBox()
  if (!note || !button) throw new Error('margin not laid out')
  expect(button.y).toBeGreaterThanOrEqual(note.y + note.height)

  await play.click()

  await expect(viewer.getByText(/^Câu \d+ trên \d+$/)).toBeVisible()
  const { sharedSpeech, speechCalls } = await stub.state()
  expect(sharedSpeech.length).toBeGreaterThan(0)
  expect(speechCalls).toEqual([])
  await expect(viewer.getByRole('button', { name: 'Nghe bản này' })).toHaveCount(0)

  await viewer.getByRole('button', { name: 'Đổi giọng' }).click()
  await expect(viewer.getByRole('radio')).toHaveCount(1)
  await expect(viewer.getByRole('radio')).toContainText('Nam An')
  await expect(viewer.getByText('tính vào phút của gói')).toHaveCount(0)
})

test('a chapter with no stored voice has no way to listen', async ({ page, browser, baseURL }) => {
  await makeLink(page)
  await stub.set({ sharedVoices: ['nam-an'], sharedVoicesChapter: 'deep-3' })
  const viewer = await machine(browser, baseURL)
  await enter(viewer)

  await viewer.getByRole('button', { name: /Chương Hai/ }).click()
  await expect(viewer.locator('[data-block="0"]')).toBeVisible()
  await expect(viewer.getByRole('button', { name: 'Nghe', exact: true })).toHaveCount(0)

  await viewer.getByText('Xong Chương Hai').scrollIntoViewIfNeeded()
  await viewer.getByRole('link', { name: 'Đọc Chương Ba' }).click()
  await expect(viewer.getByRole('button', { name: 'Nghe', exact: true })).toBeVisible()
})

test('a second machine is turned away and asked for nothing', async ({ page, browser, baseURL }) => {
  await makeLink(page)
  const first = await machine(browser, baseURL)
  await enter(first)
  await expect(first.getByRole('heading', { name: 'Deep Work' })).toBeVisible()

  const second = await machine(browser, baseURL)
  await open(second, LINK)

  await expect(second.getByText('Link này đã được mở trên một máy khác.')).toBeVisible()
  await expect(second.getByLabel('Mật khẩu')).toHaveCount(0)
  await expect(second.getByRole('heading', { name: 'Deep Work' })).toHaveCount(0)
})

test('the page asks to stay out of search and out of referrers', async ({ page, browser, baseURL }) => {
  await makeLink(page)
  const viewer = await machine(browser, baseURL)
  await open(viewer, LINK)

  await expect(viewer.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  await expect(viewer.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
})

test('a button at work says so until the server answers', async ({ page }) => {
  await signIn(page)
  await open(page, '/books/deep')
  await page.getByRole('button', { name: 'Chia sẻ' }).click()
  await page.getByLabel('Mật khẩu cho người nhận').fill(PASSWORD)
  await stub.set({ writeDelay: 800 })
  const make = page.getByRole('button', { name: 'Tạo link' })
  await make.click()
  await expect(make).toHaveAttribute('aria-busy', 'true')
  await expect(make).toBeDisabled()
  await expect(page.getByLabel('Link chia sẻ')).toBeVisible()
  await expect(make).not.toHaveAttribute('aria-busy', 'true')
})
