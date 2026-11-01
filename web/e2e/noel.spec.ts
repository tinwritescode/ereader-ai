import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { hydrated, open, signIn, stub } from './helpers'

const toggle = (page: Page) => page.getByRole('switch', { name: 'Giáng sinh' })
const inNoel = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('noel'))
const inkOf = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-ink').trim())

test.beforeEach(async () => {
  await stub.reset()
})

test('the notebook is plain until the reader asks for Christmas', async ({ page }) => {
  await signIn(page)
  await expect(toggle(page)).not.toBeChecked()
  expect(await inNoel(page)).toBe(false)
  await expect(page.locator('[data-snow]').first()).toBeHidden()
  await expect(page.locator('[data-garland]')).toBeHidden()
})

test('the switch changes the pen, hangs the lights and lays snow on the books', async ({ page }) => {
  await signIn(page)
  const plain = await inkOf(page)
  await toggle(page).click()

  await expect(toggle(page)).toBeChecked()
  expect(await inkOf(page)).not.toBe(plain)
  await expect(page.locator('[data-garland]')).toBeVisible()
  await expect(page.locator('[data-snow]').first()).toBeVisible()

  await toggle(page).click()
  await expect(toggle(page)).not.toBeChecked()
  expect(await inkOf(page)).toBe(plain)
})

test('snow falls once when the switch is turned on, then the page is still', async ({ page }) => {
  await signIn(page)
  await toggle(page).click()
  const fall = page.locator('[data-snowfall]')
  await expect(fall).toBeAttached()
  await expect(fall).toBeHidden({ timeout: 9_000 })
  await expect(fall).not.toBeAttached()
})

test('the choice survives a reload with no plain frame first', async ({ page }) => {
  await signIn(page)
  await toggle(page).click()
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (document.body) {
        Object.assign(window, { noelAtFirstBody: document.documentElement.classList.contains('noel') })
        observer.disconnect()
      }
    }).observe(document, { childList: true, subtree: true })
  })
  await page.reload()
  await hydrated(page)
  expect(await page.evaluate(() => (window as unknown as { noelAtFirstBody: boolean }).noelAtFirstBody)).toBe(true)
  await expect(toggle(page)).toBeChecked()
  expect(await inNoel(page)).toBe(true)
})

test('snow does not fall again on a reload', async ({ page }) => {
  await signIn(page)
  await toggle(page).click()
  await page.reload()
  await hydrated(page)
  await expect(page.locator('[data-snowfall]')).not.toBeAttached()
})

test('a book shakes its snow off when it opens, and it settles back', async ({ page }) => {
  await signIn(page)
  await toggle(page).click()
  const book = page.getByRole('link', { name: 'Deep Work' })
  const snow = book.locator('[data-snow]')
  const opacity = () => snow.evaluate((node) => getComputedStyle(node).opacity)
  await expect.poll(opacity).toBe('1')

  await book.hover()
  await expect.poll(opacity).toBe('0')

  await page.mouse.move(0, 0)
  await expect.poll(opacity).toBe('1')
})

test('a reader who asks for less motion gets the snow on the books but none falling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signIn(page)
  await toggle(page).click()
  await expect(page.locator('[data-snow]').first()).toBeVisible()
  await expect(page.locator('[data-snowfall]')).not.toBeAttached()

  const book = page.getByRole('link', { name: 'Deep Work' })
  await book.hover()
  await page.waitForTimeout(100)
  await expect(book.locator('[data-snow]')).toHaveCSS('opacity', '1')
})

test('the night paper stays night in Christmas mode', async ({ page }) => {
  await signIn(page)
  await page.evaluate(() => {
    localStorage.setItem('noel', 'true')
    localStorage.setItem('reading.look', JSON.stringify({ size: 'medium', spacing: 'normal', paper: 'night' }))
  })
  await open(page, '/books/viet/chapters/viet-1?length=original&minutes=3')
  expect(await inNoel(page)).toBe(true)
  await expect(page.locator('.reader')).toHaveCSS('background-color', 'rgb(23, 18, 63)')
})

test('the tab shows the notebook', async ({ page, request }) => {
  await signIn(page)
  const href = await page.locator('link[rel=icon][type="image/svg+xml"]').getAttribute('href')
  expect(href).toBe('/favicon.svg')
  for (const path of ['/favicon.svg', '/favicon.ico', '/apple-touch-icon.png']) {
    expect((await request.get(path)).status(), path).toBe(200)
  }
})
