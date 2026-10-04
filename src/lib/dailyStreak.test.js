import { describe, it, expect } from 'vitest'
import { dailyStreak } from './dailyStreak'

const DAY = 24 * 3600 * 1000
const now = new Date(2026, 9, 4, 15, 0).getTime()
const ago = (d, h = 0) => now - d * DAY - h * 3600 * 1000

describe('dailyStreak', () => {
  it('is nothing with no entries', () => {
    expect(dailyStreak([], now)).toEqual({ current: 0, best: 0, live: false, state: 'none' })
  })
  it('counts consecutive days ending today as live', () => {
    expect(dailyStreak([ago(0), ago(1), ago(2)], now)).toEqual({ current: 3, best: 3, live: true, state: 'live' })
  })
  it('keeps the run alive, waiting, when today is still empty', () => {
    expect(dailyStreak([ago(1), ago(2)], now)).toEqual({ current: 2, best: 2, live: false, state: 'waiting' })
  })
  it('loses the run after a missed day and remembers the best', () => {
    expect(dailyStreak([ago(2), ago(3), ago(4), ago(5)], now)).toEqual({ current: 0, best: 4, live: false, state: 'lost' })
  })
  it('a lost run does not hide a live shorter one', () => {
    expect(dailyStreak([ago(0), ago(1), ago(5), ago(6), ago(7)], now)).toEqual({ current: 2, best: 3, live: true, state: 'live' })
  })
  it('counts several posts in one day once', () => {
    expect(dailyStreak([ago(0), ago(0, 2), ago(0, 3)], now).current).toBe(1)
  })
  it('ignores days before the challenge opened', () => {
    expect(dailyStreak([ago(0), ago(1), ago(2)], now, ago(1, 12))).toMatchObject({ current: 2, best: 2 })
  })
})
