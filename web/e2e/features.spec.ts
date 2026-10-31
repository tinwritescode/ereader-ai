import { expect, test } from '@playwright/test'
import { open, signIn, stub } from './helpers'

test.beforeEach(async () => {
  await stub.reset()
})

const CHAPTER = '/books/deep/chapters/deep-1?length=original&minutes=12'

// Linux WebKit in CI has no audio clock, so clips end at once and the mark outruns these checks.
const noAudioClock = (browserName: string) => browserName === 'webkit' && process.platform === 'linux'

test.describe('listening', () => {
  test.skip(({ browserName }) => noAudioClock(browserName), 'needs real playback time')

  test('audio plays and the mark moves on, sentence by sentence', async ({ page }) => {
    await signIn(page)
    await open(page, CHAPTER)
    await page.getByRole('button', { name: 'Nghe', exact: true }).click()
    await expect(page.locator('mark')).toHaveText('Đầu chương deep-1')
    await expect(page.locator('mark')).toHaveText('Câu thứ nhất của deep-1.', { timeout: 10_000 })
    await expect(page.locator('mark')).toHaveText('Câu thứ hai rất ngắn.', { timeout: 10_000 })
    // Moving on needs the clip's `ended` event, so the audio really played.
    expect((await stub.state()).speechCalls).toContain('Câu thứ hai rất ngắn.')
  })

  test('selecting a sentence reads from that sentence, and a plain click does not', async ({ page }) => {
    await signIn(page)
    await stub.set({ speechDelay: 0 })
    await open(page, CHAPTER)
    const paragraph = page.getByText('Câu thứ hai rất ngắn.')
    await paragraph.click()
    await expect(page.getByRole('button', { name: 'Nghe từ câu này' })).toHaveCount(0)
    await paragraph.evaluate((node) => {
      const text = node.firstChild
      const at = node.textContent?.indexOf('Câu thứ hai') ?? 0
      if (text) document.getSelection()?.setBaseAndExtent(text, at, text, at + 3)
    })
    await page.getByRole('button', { name: 'Nghe từ câu này' }).click()
    await expect(page.locator('mark')).toHaveText('Câu thứ hai rất ngắn.', { timeout: 10_000 })
  })

  test('the keyboard pauses and moves between sentences', async ({ page }) => {
    await signIn(page)
    await stub.set({ speechDelay: 0 })
    await open(page, CHAPTER)
    await page.getByRole('button', { name: 'Nghe', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Tạm dừng' })).toBeVisible()
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Đọc tiếp' })).toBeVisible()
    const paused = await page.locator('mark').textContent()
    await page.waitForTimeout(800)
    await expect(page.locator('mark')).toHaveText(paused ?? '')
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Tạm dừng' })).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(page.getByText(/^Câu [3-9] trên/)).toBeVisible()
  })

  test('rates go round', async ({ page }) => {
    await signIn(page)
    await open(page, CHAPTER)
    await page.getByRole('button', { name: 'Nghe', exact: true }).click()
    await page.getByRole('button', { name: 'Tốc độ 1x' }).click()
    await expect(page.getByRole('button', { name: 'Tốc độ 1,25x' })).toBeVisible()
  })

  test('choosing to listen from the length sheet starts reading on arrival', async ({ page }) => {
    await signIn(page)
    await page.getByRole('link', { name: 'Deep Work' }).click()
    await page.getByRole('button', { name: /Chương Một/ }).click()
    await page.getByRole('radio', { name: /Bản gốc/ }).click()
    await page.getByRole('button', { name: 'Nghe bản này' }).click()
    await expect(page.locator('mark')).toHaveText('Câu thứ nhất của deep-1.', { timeout: 10_000 })
  })

  test('the voice keeps going on other pages, and the library offers to go on listening', async ({ page }) => {
    await signIn(page)
    await open(page, CHAPTER)
    await page.getByRole('button', { name: 'Nghe', exact: true }).click()
    await expect(page.locator('mark')).toHaveText('Câu thứ nhất của deep-1.', { timeout: 10_000 })
    await page.getByRole('link', { name: '‹ Mục lục' }).click()
    await expect(page.getByRole('region', { name: 'Đang nghe' })).toContainText('Deep Work')
    await page.getByRole('link', { name: 'Thư viện' }).click()
    await expect(page.getByRole('link', { name: /Nghe tiếp Deep Work/ })).toBeVisible()
    await page.getByRole('region', { name: 'Đang nghe' }).getByRole('button', { name: 'Tắt' }).click()
    await expect(page.getByRole('region', { name: 'Đang nghe' })).toHaveCount(0)
  })

  test('running out of minutes says so in neutral words', async ({ page }) => {
    await signIn(page)
    await stub.set({ speechLimit: true })
    await open(page, CHAPTER)
    await page.getByRole('button', { name: 'Nghe', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Hết phút giọng qua mạng')
    await expect(page.locator('body')).not.toContainText(/vbee/i)
  })

  test('a different voice can be chosen', async ({ page }) => {
    await signIn(page)
    await open(page, CHAPTER)
    await page.getByRole('button', { name: 'Nghe', exact: true }).click()
    await page.getByRole('button', { name: 'Đổi giọng' }).click()
    await page.getByRole('radio', { name: 'Nam An' }).click()
    await expect(page.getByRole('button', { name: 'Đổi giọng' })).toHaveText('Nam An')
  })
})

const queuedTask = {
  kind: 'chapterVoice',
  id: 'v1',
  bookId: 'deep',
  chapterId: 'deep-1',
  bookTitle: 'Deep Work',
  chapterLabel: 'Chương Một',
  minutes: null,
  voiceCode: 'hat-de',
  voiceName: 'Hạt Dẻ',
  state: 'queued',
  code: null,
  done: 0,
  total: 9,
  position: 1,
  progress: -1000,
  createdAt: '2026-10-01T00:00:00Z',
  finishedAt: null,
}

test.describe('whole book and tasks', () => {
  test('translating the whole book is followed to its finish', async ({ page }) => {
    await signIn(page)
    await page.getByRole('link', { name: 'Deep Work' }).click()
    await page.getByRole('button', { name: /Dịch cả sách sang tiếng Việt/ }).click()
    await expect(page.getByRole('dialog')).toContainText('Tháng này còn 2 trên 3 lượt.')
    await page.getByRole('button', { name: 'Dịch cả sách', exact: true }).click()
    await expect(page.getByText('Đang dịch Deep Work. Xong sẽ báo.')).toBeVisible()
    await expect(page.getByText(/Đang dịch cả sách, chương/)).toBeVisible()
    await expect(page.getByText('đang dịch 40%')).toBeVisible()
    await page.getByRole('link', { name: '‹ Thư viện' }).click()
    await page.getByRole('link', { name: /Tác vụ/ }).click()
    await expect(page.getByRole('cell', { name: 'Dịch cả sách' })).toBeVisible()
    await expect(page.getByText('Đã dịch xong Deep Work.')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('region', { name: 'Đã xong' })).toContainText('Deep Work')
  })

  test('voicing the whole book picks a voice first', async ({ page }) => {
    await signIn(page)
    await page.getByRole('link', { name: 'Cuộc chiến sinh tồn' }).click()
    await page.getByRole('button', { name: /Tạo giọng đọc cả sách/ }).click()
    await page.getByRole('radio', { name: 'Nam An' }).click()
    await page.getByRole('button', { name: 'Tạo giọng cả sách' }).click()
    await expect(page.getByText(/Đang tạo giọng cả sách, chương/)).toBeVisible()
  })

  test('a task row keeps keyboard focus when the list refreshes', async ({ page }) => {
    await signIn(page)
    await stub.task(queuedTask)
    await open(page, '/tasks')
    const cancel = page.getByRole('button', { name: 'Huỷ Chương Một, Deep Work' })
    await cancel.focus()
    await page.waitForResponse((response) => response.url().includes('/_serverFn/'), { timeout: 6000 })
    await page.waitForTimeout(300)
    await expect(cancel).toBeFocused()
  })

  test('cancelling a task drops it at once, and a refusal puts it back', async ({ page }) => {
    await signIn(page)
    await stub.task(queuedTask)
    await stub.set({ cancelDelay: 1500, cancelFails: true })
    await open(page, '/tasks')
    const row = page.getByRole('row', { name: /Chương Một, Deep Work/ })
    await expect(row).toBeVisible()
    await page.getByRole('button', { name: 'Huỷ Chương Một, Deep Work' }).click()
    await expect(row).toHaveCount(0)
    await expect(page.getByText(/Chưa huỷ được/)).toBeVisible({ timeout: 5000 })
    await expect(row).toBeVisible()
    await stub.set({ cancelDelay: 0, cancelFails: false })
    await page.getByRole('button', { name: 'Huỷ Chương Một, Deep Work' }).click()
    await expect(row).toHaveCount(0)
    await page.reload()
    await expect(page.getByText('Chưa có tác vụ nào')).toBeVisible()
  })

  test('a stopped task says why and can go on', async ({ page }) => {
    await signIn(page)
    await stub.task({
      kind: 'bookVoice',
      id: 'b1',
      bookId: 'viet',
      bookTitle: 'Cuộc chiến sinh tồn',
      state: 'stopped',
      code: 'VBEE_LIMIT',
      done: 1,
      total: 3,
      percent: 36,
      progress: -1000,
      current: null,
      waiting: [],
      voiceCode: 'hat-de',
      voiceName: 'Hạt Dẻ',
      voiced: [],
      position: null,
      createdAt: '2026-10-01T00:00:00Z',
      finishedAt: '2026-10-02T00:00:00Z',
    })
    await open(page, '/tasks')
    await expect(page.getByText('Tạo giọng cả sách, bị dừng ở 36%')).toBeVisible()
    await expect(page.getByText('Hết phút giọng qua mạng').first()).toBeVisible()
    await expect(page.getByText('Dừng tạo giọng đọc Cuộc chiến sinh tồn ở 36%.')).toBeVisible()
    await page.getByRole('button', { name: /^Chạy tiếp/ }).click()
    await expect(page.getByRole('region', { name: 'Đang chạy' })).toBeVisible()
  })
})
