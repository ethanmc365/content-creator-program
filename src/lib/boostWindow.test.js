import { describe, it, expect } from 'vitest'
import { wholeDays, windowPhrase } from './boostWindow'

// Built from local dates so the test means the same thing in any timezone.
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString()

describe('wholeDays', () => {
  it('treats 00:01 to 00:01 the next day as one whole day (the live boost on 7 Oct 2026)', () => {
    const days = wholeDays(at(2026, 10, 8, 0, 1), at(2026, 10, 9, 0, 1))
    expect(days).toHaveLength(1)
    expect(days[0].getDate()).toBe(8)
  })
  it('counts two days ending at 23:59', () => {
    expect(wholeDays(at(2026, 10, 8), at(2026, 10, 9, 23, 59))).toHaveLength(2)
  })
  it('is null for a window that starts in the afternoon', () => {
    expect(wholeDays(at(2026, 10, 8, 14), at(2026, 10, 8, 17))).toBeNull()
  })
})

describe('windowPhrase', () => {
  it('names the days, not the minutes', () => {
    const one = windowPhrase(at(2026, 10, 8, 0, 1), at(2026, 10, 9, 0, 1))
    expect(one.startsWith('on ')).toBe(true)
    expect(one).not.toMatch(/00:01/)
    const two = windowPhrase(at(2026, 10, 8), at(2026, 10, 9, 23, 59))
    expect(two).toMatch(/^on .+ and .+$/)
    expect(windowPhrase(at(2026, 10, 8), at(2026, 10, 11, 23, 59))).toMatch(/^from .+ to .+$/)
  })
  it('keeps the times for part of a day', () => {
    expect(windowPhrase(at(2026, 10, 8, 14), at(2026, 10, 8, 17))).toMatch(/14.00.+17.00/)
  })
})
