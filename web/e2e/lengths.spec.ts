import { expect, test } from '@playwright/test'
import { open, signIn, stub } from './helpers'

test.beforeEach(async () => {
  await stub.reset()
})

test('a chapter row offers its lengths, and one opens that version straight away', async ({ page }) => {
  await signIn(page)
  await open(page, '/books/deep')
  const lengths = page.getByRole('group', { name: /Chương Một/ })
  await expect(lengths.getByRole('link')).toHaveText(["12' gốc", "12' Việt", "6' rút gọn", "3' ý chính"])

  await lengths.getByRole('link', { name: "6' rút gọn" }).click()
  await expect(page).toHaveURL(/\/books\/deep\/chapters\/deep-1\?length=shortened&minutes=6$/)
  await expect(page.getByText('Bản 6 phút của deep-1.')).toBeVisible()
})

test('a short chapter is read whole, and a book in Vietnamese needs no translation', async ({ page }) => {
  await signIn(page)
  await open(page, '/books/viet')
  await expect(page.getByRole('group', { name: /Chương Ba/ }).getByRole('link')).toHaveText(["3' gốc"])
  await expect(page.getByRole('group', { name: /Chương Một/ }).getByRole('link')).toHaveText([
    "12' gốc",
    "6' rút gọn",
    "3' ý chính",
  ])
})

test('the title still opens the length sheet, which can start listening', async ({ page }) => {
  await signIn(page)
  await open(page, '/books/viet')
  await page.getByRole('button', { name: /Chương Một/ }).click()
  await expect(page.getByRole('heading', { name: /dài 12 phút/ })).toBeVisible()
})
