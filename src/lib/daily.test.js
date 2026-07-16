import { describe, it, expect } from 'vitest'
import { dailyStreak } from './daily'

describe('dailyStreak', () => {
  const today = 20650

  it('is 0 with no plays', () => {
    expect(dailyStreak([], today)).toBe(0)
  })

  it('counts a run ending today', () => {
    expect(dailyStreak([today], today)).toBe(1)
    expect(dailyStreak([today - 2, today - 1, today], today)).toBe(3)
  })

  it('gives a one-day grace when today is unplayed', () => {
    expect(dailyStreak([today - 3, today - 2, today - 1], today)).toBe(3)
  })

  it('breaks on a missed day', () => {
    expect(dailyStreak([today - 4, today - 3, today - 1, today], today)).toBe(2)
    expect(dailyStreak([today - 5, today - 4], today)).toBe(0)
  })

  it('ignores duplicates and unrelated days', () => {
    expect(dailyStreak([today, today, today - 1, today - 10], today)).toBe(2)
  })
})
