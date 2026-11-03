import { expect, test } from '@playwright/test'
import { open, signIn, stub } from './helpers'

test.beforeEach(async () => {
  await stub.reset()
})

const CHAPTER = '/books/deep/chapters/deep-1?length=original&minutes=12'

test.describe('account', () => {
  test('shows use against the plan without provider names', async ({ page }) => {
    await signIn(page)
    await page.getByRole('link', { name: 'Tài khoản' }).click()
    await expect(
      page.getByText('12 trên 1.500 phút', { exact: false }).or(page.getByText('12 trên 1500 phút', { exact: false })),
    ).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/vbee/i)
  })

  test('a plan request shows as sent at once', async ({ page }) => {
    await signIn(page)
    await stub.set({ plan: 'free', planRequestDelay: 1500 })
    await open(page, '/plans')
    await page.getByRole('region', { name: 'Gói Plus' }).getByRole('button', { name: 'Yêu cầu nâng gói' }).click()
    await expect(page.getByRole('region', { name: 'Gói Plus' }).getByText('đã gửi yêu cầu')).toBeVisible({
      timeout: 700,
    })
    await expect.poll(async () => (await stub.state()).requestedPlan).toBe('plus')
    await page.reload()
    await expect(page.getByRole('region', { name: 'Gói Plus' }).getByText('đã gửi yêu cầu')).toBeVisible()
  })

  test('a refused plan request goes back', async ({ page }) => {
    await signIn(page)
    await stub.set({ plan: 'free', planRequestDelay: 800, planRequestFails: true })
    await open(page, '/plans')
    const plus = page.getByRole('region', { name: 'Gói Plus' })
    await plus.getByRole('button', { name: 'Yêu cầu nâng gói' }).click()
    await expect(plus.getByText('đã gửi yêu cầu')).toBeVisible()
    await expect(page.getByText(/Chưa gửi được yêu cầu/)).toBeVisible()
    await expect(plus.getByRole('button', { name: 'Yêu cầu nâng gói' })).toBeVisible()
  })

  test('an admin changes a plan', async ({ page }) => {
    await signIn(page)
    await open(page, '/admin')
    await expect(page.getByRole('row', { name: /reader@example.com/ })).toContainText('muốn lên Plus')
    await page.getByRole('group', { name: 'Gói của reader@example.com' }).getByText('Max').click()
    await page.getByRole('button', { name: 'Lưu gói của reader@example.com' }).click()
    await expect.poll(async () => (await stub.state()).accounts.find(({ id }) => id === 'a1')?.plan).toBe('max')
  })

  test('someone else cannot open the admin page', async ({ page }) => {
    await signIn(page)
    await stub.set({ role: 'user' })
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/account$/)
  })

  test('signing out clears the session', async ({ page, context }) => {
    await signIn(page)
    await page.getByRole('link', { name: 'Tài khoản' }).click()
    await page.getByRole('button', { name: 'Đăng xuất' }).click()
    await expect(page).toHaveURL(/\/login/)
    expect((await context.cookies()).filter(({ name }) => name.startsWith('sd_'))).toEqual([])
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('fit and access', () => {
  test('no page runs wider than a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await signIn(page)
    for (const path of ['/', '/books/deep', CHAPTER, '/tasks', '/account', '/plans', '/admin']) {
      await open(page, path)
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(wide, path).toBeLessThanOrEqual(0)
    }
  })

  test("a book's head stands in three even columns on a wide screen and on one axis below", async ({ page }) => {
    const ACTIONS = ['Dịch cả sách sang tiếng Việt', 'Tạo giọng đọc cả sách', 'Chia sẻ']
    const boxes = async () => {
      const [cover, title, ...tiles] = await Promise.all([
        page.locator('[data-book]').boundingBox(),
        page.getByRole('heading', { level: 1 }).boundingBox(),
        ...ACTIONS.map((name) => page.getByRole('button', { name }).boundingBox()),
      ])
      if (!cover || !title || tiles.some((tile) => !tile)) throw new Error('missing a box')
      return { cover, title, tiles: tiles.flatMap((tile) => (tile ? [tile] : [])) }
    }
    await signIn(page)
    await open(page, CHAPTER)
    await page.setViewportSize({ width: 1100, height: 800 })
    await open(page, '/books/deep')
    const wide = await boxes()
    const resume = await page.getByRole('link', { name: /^Đọc tiếp/ }).boundingBox()
    if (!resume) throw new Error('no way back')
    // The bookmark sits under the title, in the middle column.
    expect(resume.y).toBeGreaterThanOrEqual(wide.title.y + wide.title.height)
    expect(resume.x).toBeGreaterThanOrEqual(wide.cover.x + wide.cover.width)
    let bottom = 0
    for (const tile of wide.tiles) {
      // The tiles stand in their own column, beside the cover, one under another.
      expect(tile.x).toBeGreaterThanOrEqual(resume.x + resume.width)
      expect(tile.y).toBeGreaterThanOrEqual(bottom)
      bottom = tile.y + tile.height
    }
    expect(wide.tiles[0]?.y).toBeLessThan(wide.cover.y + wide.cover.height)
    for (const width of [320, 360, 412, 900]) {
      await page.setViewportSize({ width, height: 800 })
      await open(page, '/books/deep')
      const narrow = await boxes()
      let above = narrow.cover.y + narrow.cover.height
      for (const tile of narrow.tiles) {
        expect(tile.y, `${width}px`).toBeGreaterThanOrEqual(above)
        expect(tile.x, `${width}px`).toBeLessThanOrEqual(narrow.cover.x)
        expect(tile.width, `${width}px`).toBeGreaterThanOrEqual(Math.min(width - 100, 440))
        above = tile.y + tile.height
      }
    }
  })

  test('keyboard focus shows', async ({ page }) => {
    await signIn(page)
    // WebKit's Tab skips buttons unless the system says otherwise, so focus follows a key press here.
    await page.keyboard.press('Shift')
    const button = page.getByRole('button', { name: 'Thêm sách EPUB hoặc kéo file vào đây' })
    await button.focus()
    await expect(button).toHaveCSS('outline-style', 'solid')
  })

  test('reduced motion turns movement off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await signIn(page)
    await open(page, CHAPTER)
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto')
    expect(await page.locator('.reader').evaluate((node) => getComputedStyle(node).transitionDuration)).toMatch(/^0s/)
  })
})

test('each page names itself in the title', async ({ page }) => {
  await open(page, '/login')
  await expect(page).toHaveTitle('eReader: đọc và nghe sách theo thời gian bạn có')
  await signIn(page)
  await expect(page).toHaveTitle('Thư viện – eReader')
  await open(page, '/tasks')
  await expect(page).toHaveTitle('Tác vụ – eReader')
  await open(page, '/books/deep')
  await expect(page).toHaveTitle('Deep Work – eReader')
  await open(page, '/books/deep/chapters/deep-1?length=original&minutes=12')
  await expect(page).toHaveTitle('Chương Một, Deep Work – eReader')
})
