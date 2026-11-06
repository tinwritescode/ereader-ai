import { expect, test } from '@playwright/test'
import { open, signIn, stub } from './helpers'

test.beforeEach(async () => {
  await stub.reset()
})

test('someone signed out lands on the sign-in page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('link', { name: 'Tạo tài khoản' })).toBeVisible()
})

test('sign-in leaves tokens where page JS cannot reach them', async ({ page, context, browserName }) => {
  await signIn(page)
  const cookies = await context.cookies()
  const session = cookies.filter(({ name }) => name === 'sd_access' || name === 'sd_refresh')
  expect(session).toHaveLength(2)
  for (const cookie of session) {
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.sameSite).toBe('Lax')
    if (browserName === 'chromium') expect(cookie.secure).toBe(true)
  }
  expect(await page.evaluate(() => document.cookie)).toBe('')
})

test('a wrong state on return from WorkOS does not sign in', async ({ page }) => {
  await page.goto('/auth/callback?code=good-code&state=forged')
  await expect(page).toHaveURL(/failure=SIGN_IN_FAILED/)
  await expect(page.getByText('Chưa đăng nhập được.')).toBeVisible()
})

test('an expired token renews once for requests failing together', async ({ page }) => {
  await signIn(page)
  await stub.expire()
  await page.getByRole('link', { name: 'Deep Work' }).click()
  await expect(page.getByRole('heading', { name: 'Deep Work' })).toBeVisible()
  expect((await stub.state()).refreshCalls).toBe(1)
})

test('a lost session goes back to sign-in', async ({ page }) => {
  await signIn(page)
  await stub.set({ refreshInvalid: true })
  await stub.expire()
  await page.reload()
  await expect(page).toHaveURL(/\/login/)
})

test('covers stream through the web server', async ({ page }) => {
  await signIn(page)
  const answer = await page.request.get('/api/covers/deep')
  expect(answer.headers()['content-type']).toBe('image/png')
  expect((await answer.body()).length).toBeGreaterThan(10)
})

const epub = { name: 'Sách mới.epub', mimeType: 'application/epub+zip', buffer: Buffer.from('epub bytes') }

test('choosing an EPUB puts it on the shelf', async ({ page }) => {
  await signIn(page)
  await page.getByLabel('Thêm sách EPUB').setInputFiles(epub)
  await expect(page.getByRole('link', { name: 'Sách mới' })).toBeVisible()
})

test('dropping an EPUB anywhere on the page puts it on the shelf', async ({ page }) => {
  await signIn(page)
  const data = await page.evaluateHandle(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['epub'], 'Sách thả.epub', { type: 'application/epub+zip' }))
    return transfer
  })
  await page.getByRole('heading', { name: 'Thư viện' }).dispatchEvent('dragenter', { dataTransfer: data })
  await expect(page.getByText('Thả sách vào đây')).toBeVisible()
  await page.getByRole('heading', { name: 'Thư viện' }).dispatchEvent('drop', { dataTransfer: data })
  await expect(page.getByRole('link', { name: 'Sách thả' })).toBeVisible()
})

test('an upload over the limit says so', async ({ page }) => {
  await signIn(page)
  await stub.set({ uploadFails: 'BOOK_LIMIT' })
  await page.getByLabel('Thêm sách EPUB').setInputFiles(epub)
  await expect(page.getByText('Đã đủ số sách của gói này.')).toBeVisible()
})

test('an upload meeting an expired token goes through on its second try', async ({ page }) => {
  await signIn(page)
  await stub.set({ uploadExpireOnce: true })
  await page.getByLabel('Thêm sách EPUB').setInputFiles(epub)
  await expect(page.getByRole('link', { name: 'Sách mới' })).toBeVisible()
  expect((await stub.state()).uploads).toHaveLength(1)
})

test('a book with hundreds of chapters renders only what shows', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Sách rất dài' }).click()
  await expect(page.getByRole('button', { name: /^Chương 1\b/ })).toBeVisible()
  expect(await page.locator('.row').count()).toBeLessThan(60)
  await page.mouse.wheel(0, 10000)
  await expect(page.getByRole('button', { name: /^Chương 18\d\b/ }).first()).toBeVisible()
})

test('choosing a length opens the chapter, and the versions switch', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Deep Work' }).click()
  await page.getByRole('button', { name: /Chương Một/ }).click()
  await page.getByRole('radio', { name: /Bản gốc/ }).click()
  await expect(page.getByRole('dialog')).toContainText('Chương Một dài 12 phút')
  await page.getByRole('button', { name: 'Đọc bản gốc' }).click()
  await expect(page.getByText('Câu thứ hai rất ngắn.')).toBeVisible()
  await page.getByRole('button', { name: "rút gọn 6'" }).click()
  await expect(page.getByText('Bản 6 phút của deep-1.')).toBeVisible()
  await page.getByRole('button', { name: 'Việt' }).click()
  await expect(page.getByText('Chương này chưa được dịch')).toBeVisible()
})

test('running out of digests leaves the original one tap away', async ({ page }) => {
  await signIn(page)
  await stub.set({ digestFails: 'DIGEST_LIMIT' })
  await open(page, '/books/deep/chapters/deep-1?length=shortened&minutes=6')
  await expect(page.getByRole('dialog')).toContainText('Hết lượt rút gọn tháng này')
  await page.getByRole('button', { name: 'Đọc bản gốc' }).click()
  await expect(page.getByText('Câu thứ hai rất ngắn.')).toBeVisible()
})

test('a translation not ready shows the original until it is', async ({ page }) => {
  await signIn(page)
  await open(page, '/books/deep/chapters/deep-1?length=vietnamese&minutes=12')
  await expect(page.locator('.text.faded')).toContainText('Câu thứ hai rất ngắn.')
  await stub.set({ translationReady: true })
  await expect(page.getByText('Bản dịch: Câu thứ nhất')).toBeVisible({ timeout: 10000 })
})

test('night paper stays between chapters', async ({ page }) => {
  await signIn(page)
  await open(page, '/books/deep/chapters/deep-1?length=original&minutes=12')
  await page.getByRole('button', { name: 'Trang giấy' }).click()
  await page.getByRole('button', { name: /Đêm/ }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.reader.night')).toBeVisible()
  await open(page, '/books/deep/chapters/deep-2?length=original&minutes=12')
  await expect(page.locator('.reader.night')).toBeVisible()
  await expect(page.locator('.reader')).toHaveCSS('background-color', 'rgb(23, 18, 63)')
})

test('the reader offers to go back to the last spot', async ({ page }) => {
  await signIn(page)
  await open(page, '/books/deep/chapters/deep-1?length=original&minutes=12')
  await expect(page.getByText('Đoạn 20 kể tiếp')).toBeVisible()
  await page.locator('[data-block="20"]').scrollIntoViewIfNeeded()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('reading.spots') ?? '{}').deep?.block > 10)
  await page.reload()
  await page.getByRole('button', { name: 'Đọc tiếp' }).click()
  await expect(page.locator('[data-block="20"]')).toBeInViewport()
})

test('the ruler is dragged or walked with the arrow keys', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Deep Work' }).click()
  await page.getByRole('button', { name: /Chương Một/ }).click()
  const original = page.getByRole('radio', { name: /Bản gốc/ })
  await original.click()
  await original.press('ArrowLeft')
  await expect(original).not.toBeChecked()
  await page.keyboard.press('ArrowRight')
  await expect(original).toBeChecked()
  const ruler = await page.getByRole('radiogroup', { name: 'Độ dài' }).boundingBox()
  if (!ruler) throw new Error('no ruler')
  await original.hover()
  await page.mouse.down()
  await page.mouse.move(ruler.x + 40, ruler.y + 40, { steps: 4 })
  await page.mouse.up()
  await expect(original).not.toBeChecked()
})

test('front matter folds away above the chapters', async ({ page }) => {
  await signIn(page)
  await open(page, '/books/deep')
  await expect(page.getByText('Deep Work').first()).toBeVisible()
  await expect(page.locator('.row')).toHaveCount(3)
  await page.getByRole('button', { name: /Phần đầu sách/ }).click()
  await expect(page.locator('.row')).toHaveCount(4)
  await expect(page.locator('.row').first()).toContainText('Giới thiệu')
})
