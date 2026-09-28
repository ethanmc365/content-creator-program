import { describe, it, expect } from 'vitest'
import { postingStreak } from './postingStreak'

const DAY = 24 * 3600 * 1000
const now = Date.parse('2026-09-28T12:00:00Z')
const ago = (d) => now - d * DAY

describe('postingStreak', () => {
  it('is zero with no entries', () => {
    expect(postingStreak([], now)).toEqual({ weeks: 0, live: false })
  })
  it('counts consecutive weeks including this one', () => {
    expect(postingStreak([ago(1), ago(9), ago(16)], now)).toEqual({ weeks: 3, live: true })
  })
  it('keeps the run when this week is still empty', () => {
    expect(postingStreak([ago(8), ago(15)], now)).toEqual({ weeks: 2, live: false })
  })
  it('ends the run after a missed week', () => {
    expect(postingStreak([ago(1), ago(20)], now)).toEqual({ weeks: 1, live: true })
    expect(postingStreak([ago(15)], now)).toEqual({ weeks: 0, live: false })
  })
  it('counts several posts in one week once', () => {
    expect(postingStreak([ago(1), ago(2), ago(3)], now)).toEqual({ weeks: 1, live: true })
  })
  it('ignores entries before the challenge opened', () => {
    expect(postingStreak([ago(1), ago(9), ago(16)], now, ago(10))).toEqual({ weeks: 2, live: true })
  })
})
