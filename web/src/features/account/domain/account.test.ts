import { describe, expect, it } from 'vitest'
import { adminNote, countLabel, isHigher, planLines, resetLabel } from './account'

const limits = { books: 3, monthlyDigests: 1500, monthlyVoiceMinutes: 30, chapterVoice: false, monthlyBookTranslations: 0 }

describe('words about plans', () => {
  it('writes thousands the Vietnamese way', () => {
    expect(countLabel(1500)).toBe('1.500')
    expect(countLabel(2005)).toBe('2.005')
    expect(countLabel(999)).toBe('999')
  })

  it('lists only what the plan has', () => {
    expect(planLines(limits)).toEqual(['3 cuốn sách', '1.500 chương AI mỗi tháng', '30 phút giọng qua mạng mỗi tháng'])
    expect(planLines({ ...limits, chapterVoice: true, monthlyBookTranslations: 3 })).toContain('Dịch 3 cuốn sách sang tiếng Việt mỗi tháng')
  })

  it('reads the reset day', () => {
    expect(resetLabel({ resetsOn: '2026-12-01T00:00:00.000Z' })).toBe('ngày 1/12')
  })

  it('orders plans', () => {
    expect(isHigher('max', 'plus')).toBe(true)
    expect(isHigher('free', 'free')).toBe(false)
  })

  it('notes an account for the admin, the request first', () => {
    expect(adminNote({ isSuperAdmin: true, requestedPlan: 'max', digestsUsed: 1 })).toBe('super admin')
    expect(adminNote({ isSuperAdmin: false, requestedPlan: 'max', digestsUsed: 1 })).toBe('muốn lên Max')
    expect(adminNote({ isSuperAdmin: false, requestedPlan: null, digestsUsed: 2 })).toBe('2 chương AI tháng này')
  })
})
