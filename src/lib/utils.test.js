import { describe, it, expect } from 'vitest'
import { challengeDeadline, parseDob, formatMoney, detectPlatform, formatViews } from './utils'

describe('challengeDeadline', () => {
  it('keeps a challenge open through the whole of its end date', () => {
    // end_date 30 Jun → closes at 00:00 on 1 Jul (local).
    const deadline = challengeDeadline('2026-06-30')
    expect(deadline.getDate()).toBe(1)
    expect(deadline.getMonth()).toBe(6) // July (0-indexed)
    expect(deadline.getHours()).toBe(0)
  })

  it('treats a date before its deadline as still open and after as closed', () => {
    const deadline = challengeDeadline('2026-06-30')
    expect(new Date('2026-06-30T23:00:00').getTime()).toBeLessThan(deadline.getTime())
    expect(new Date('2026-07-01T01:00:00').getTime()).toBeGreaterThan(deadline.getTime())
  })
})

describe('parseDob', () => {
  it('parses a valid DD/MM/YYYY into an ISO date', () => {
    expect(parseDob('25/01/2005')).toBe('2005-01-25')
  })
  it('rejects impossible dates', () => {
    expect(parseDob('31/02/2005')).toBeNull()
    expect(parseDob('not a date')).toBeNull()
  })
})

describe('formatMoney', () => {
  it('drops decimals for whole amounts and keeps pennies otherwise', () => {
    expect(formatMoney(600)).toBe('£600')
    expect(formatMoney(12.5)).toBe('£12.50')
    expect(formatMoney(0)).toBe('£0')
  })
})

describe('detectPlatform', () => {
  it('detects the platform from a pasted link', () => {
    expect(detectPlatform('https://www.tiktok.com/@x/video/1')).toBe('TikTok')
    expect(detectPlatform('https://instagram.com/reel/1')).toBe('Instagram')
    expect(detectPlatform('https://youtu.be/abc')).toBe('YouTube')
    expect(detectPlatform('https://example.com')).toBe('Other')
  })
})

describe('formatViews', () => {
  it('compacts large numbers', () => {
    expect(formatViews(1_500_000)).toBe('1.5M')
    expect(formatViews(2_000)).toBe('2k')
    expect(formatViews(950)).toBe('950')
  })
})
