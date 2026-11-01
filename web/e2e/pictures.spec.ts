import { expect, test } from '@playwright/test'
import { open, signIn, stub } from './helpers'

const CHAPTER = '/books/deep/chapters/deep-1?length=original&minutes=12'
const FIGURE = { before: 1, image: `${'a'.repeat(64)}.png`, alt: 'Bản đồ thành phố', width: 1, height: 1 }

test.beforeEach(async () => {
  await stub.reset()
})

test.describe('pictures in a chapter', () => {
  test('stands between the blocks it stood between in the book', async ({ page }) => {
    await signIn(page)
    await stub.set({ figures: [FIGURE] })
    await open(page, CHAPTER)

    const picture = page.getByRole('img', { name: 'Bản đồ thành phố' })
    await expect(picture).toBeVisible()
    await expect.poll(() => picture.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
    const before = await page.locator('[data-block="0"]').boundingBox()
    const shown = await picture.boundingBox()
    const after = await page.locator('[data-block="1"]').boundingBox()
    expect(before!.y).toBeLessThan(shown!.y)
    expect(shown!.y).toBeLessThan(after!.y)
  })

  test('a chapter with no pictures shows none', async ({ page }) => {
    await signIn(page)
    await open(page, CHAPTER)
    await expect(page.locator('[data-block="0"]')).toBeVisible()
    await expect(page.locator('figure')).toHaveCount(0)
  })
})
