import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { open, signIn, stub } from './helpers'

const style = (locator: Locator, property: string, pseudo?: string) =>
  locator.evaluate(
    (node, [name, after]) => getComputedStyle(node, after).getPropertyValue(name ?? ''),
    [property, pseudo],
  )

const coverOf = (page: Page, title: string) => page.getByRole('link', { name: title }).locator('[data-cover]')

/** Records what each view transition was started with; the page keeps working as usual. */
async function watchTransitions(page: Page) {
  await page.addInitScript(() => {
    const started: unknown[] = []
    Object.assign(window, { startedTransitions: started })
    const original = document.startViewTransition?.bind(document)
    if (original)
      document.startViewTransition = ((update: Parameters<typeof original>[0]) => {
        started.push(typeof update === 'function' ? [] : (update?.types ?? []))
        return original(update)
      }) as typeof document.startViewTransition
  })
}

const transitions = (page: Page) =>
  page.evaluate(() => (window as unknown as { startedTransitions: string[][] }).startedTransitions)

test.beforeEach(async () => {
  await stub.reset()
})

test('a book opens on its spine under the pointer and shuts when it leaves', async ({ page }) => {
  await signIn(page)
  const cover = coverOf(page, 'Deep Work')
  expect(await style(cover, 'transform')).toBe('none')

  await cover.hover()
  await expect.poll(() => style(cover, 'transform')).toContain('matrix3d')

  await page.mouse.move(0, 0)
  await expect.poll(() => style(cover, 'transform')).toBe('none')
})

test('a book opens under the keyboard too', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Safari tabs past links unless the reader turns that on')
  await signIn(page)
  await page.getByRole('link', { name: 'Deep Work' }).focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect.poll(() => style(coverOf(page, 'Deep Work'), 'transform')).toContain('matrix3d')
})

test('a reader who asks for less motion keeps every book shut', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signIn(page)
  const cover = coverOf(page, 'Deep Work')
  await cover.hover()
  await page.waitForTimeout(100)
  expect(await style(cover, 'transform')).toBe('none')
})

test('a book carries its cover from the shelf to its page and back', async ({ page }) => {
  await watchTransitions(page)
  await signIn(page)
  const onShelf = await style(
    page.getByRole('link', { name: 'Deep Work' }).locator('[data-book]'),
    'view-transition-name',
  )
  expect(onShelf).not.toBe('none')

  await page.getByRole('link', { name: 'Deep Work' }).click()
  await expect(page.getByRole('heading', { name: 'Deep Work' })).toBeVisible()
  expect(await transitions(page)).toHaveLength(1)
  expect(await style(page.locator('[data-book]'), 'view-transition-name')).toBe(onShelf)

  await page.getByRole('link', { name: '‹ Thư viện' }).click()
  await expect(page.getByRole('heading', { name: 'Thư viện' })).toBeVisible()
  expect(await transitions(page)).toHaveLength(2)
})

test('the next chapter comes with a turned page', async ({ page }) => {
  await watchTransitions(page)
  await signIn(page)
  await open(page, '/books/viet/chapters/viet-1?length=original&minutes=3')
  await page.getByRole('link', { name: /^Đọc / }).click()
  await expect(page).toHaveURL(/viet-2/)
  expect(await transitions(page)).toEqual([['page-turn']])
})

test('the end of a chapter is written out when it comes into view', async ({ page }) => {
  await signIn(page)
  await open(page, '/books/viet/chapters/viet-1?length=original&minutes=3')
  const note = page.getByText(/^Xong /)
  await note.scrollIntoViewIfNeeded()
  await expect.poll(() => style(note, 'clip-path')).toMatch(/inset\(-12px 0(%|px)? -12px 0(px)?\)/)
})

test('a chapter takes the marker from left to right under the pointer', async ({ page }) => {
  await signIn(page)
  await open(page, '/books/viet')
  const row = page.getByRole('button', { name: /Chương Một/ })
  expect(await style(row, 'background-size')).toBe('0% 100%')
  await row.hover()
  await expect.poll(() => style(row, 'background-size')).toBe('100% 100%')
})

test('the pen underlines a way round the margin, and leaves the current page underlined', async ({ page }) => {
  await signIn(page)
  const shelf = page.getByRole('link', { name: 'Thư viện', exact: true })
  const tasks = page.getByRole('link', { name: 'Tác vụ' })
  await expect.poll(() => style(shelf, 'clip-path', '::after')).toMatch(/inset\(0(px)?\)/)
  expect(await style(tasks, 'clip-path', '::after')).toMatch(/100%/)

  await tasks.hover()
  await expect.poll(() => style(tasks, 'clip-path', '::after')).toMatch(/inset\(0(px)?\)/)
})
