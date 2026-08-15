import { describe, it, expect } from 'vitest'
import { dailyStreak, weekOf } from './daily'

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

describe('weekOf', () => {
  // 1 Jan 1970 was a Thursday, so day index 0 is a Thursday and the Monday of
  // that week is index -3. Every assertion below is anchored on that fact
  // rather than on another call to the same function.
  it('starts on Monday', () => {
    expect(weekOf(0)[0]).toBe(-3)
    expect(weekOf(0)).toHaveLength(7)
  })

  it('returns seven consecutive days containing the day asked about', () => {
    for (const d of [0, 1, 2, 3, 4, 5, 6, 20650, 20651, 20656]) {
      const w = weekOf(d)
      expect(w).toHaveLength(7)
      expect(w).toContain(d)
      expect(w[6] - w[0]).toBe(6)
      expect(((w[0] % 7) + 3 + 7) % 7).toBe(0) // Monday
    }
  })

  it('gives the same week to every day inside it, and a new one on Monday', () => {
    const monday = 20650 - ((((20650 + 3) % 7) + 7) % 7)
    for (let i = 0; i < 7; i++) expect(weekOf(monday + i)).toEqual(weekOf(monday))
    expect(weekOf(monday + 7)[0]).toBe(monday + 7)
  })
})
