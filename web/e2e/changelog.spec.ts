import { expect, test } from '@playwright/test'
import { signIn, stub } from './helpers'

test.beforeEach(async () => {
  await stub.reset()
})

test.describe('changelog', () => {
  test('the account page leads to what each version changed, and the newest is marked until read', async ({ page }) => {
    await signIn(page)
    await page.evaluate(() => localStorage.setItem('changelog.seen', JSON.stringify('1.0.0')))
    await page.getByRole('link', { name: 'Tài khoản' }).click()
    const link = page.getByRole('link', { name: /Có gì mới/ })
    await expect(link).toContainText('bản 1.1.0')
    await expect(link.getByText('bản 1.1.0')).toHaveClass(/bg-marker/)

    await link.click()
    await expect(page.getByRole('heading', { name: 'Có gì mới' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Theo dõi tác vụ' })).toBeVisible()
    await expect(page.getByText('Trang Tác vụ', { exact: true })).toBeVisible()
    await expect(page.getByText('Bản đầu tiên')).toBeVisible()

    await page.goBack()
    await expect(page.getByRole('link', { name: /Có gì mới/ }).getByText('bản 1.1.0')).not.toHaveClass(/bg-marker/)
  })
})
