import { describe, it, expect } from 'vitest'
import { countDuration, countEase, COUNT_MS } from './Motion'

// THE COUNTER CANNOT BE WATCHED IN THE PREVIEW BROWSER.
// `document.hidden` is true there and requestAnimationFrame never ticks, so a
// counter renders its starting value and stops. The arithmetic is therefore
// what gets checked, and it is the arithmetic that was wrong.

describe('countDuration', () => {
  it('gives every number the same clock, so a row of figures lands together', () => {
    // THE REGRESSION THIS GUARDS. The duration used to follow the magnitude
    // logarithmically, so "6 markets open" finished a full half second before
    // the kilometre total sitting beside it in the same row and read as having
    // given up. A row of statistics is one sentence; it has to finish at once.
    const together = [0, 6, 44, 1_200, 1_200_000, 9e15].map((n) => countDuration(n))
    expect(new Set(together).size).toBe(1)
  })

  it('is long enough to be watched and short enough not to be waited on', () => {
    expect(countDuration(6)).toBeGreaterThan(1200)
    expect(countDuration(6)).toBeLessThanOrEqual(2000)
  })

  it('matches the exported constant, which is what the row shares', () => {
    expect(countDuration(44)).toBe(COUNT_MS)
  })
})

describe('countEase', () => {
  it('starts at nothing and lands exactly on the value', () => {
    expect(countEase(0)).toBe(0)
    expect(countEase(1)).toBe(1)
  })

  it('is at the halfway value at the halfway time', () => {
    expect(countEase(0.5)).toBeCloseTo(0.5, 6)
  })

  it('does not skip the first half of a small count on the first frames', () => {
    // THE REGRESSION THIS GUARDS. The old curve was `1 - (1-t)^3`, which is at
    // 0.488 by t=0.2 - so a count to 44 read 21 almost immediately and then
    // crawled, which is what "animates up instantly" actually was.
    const oldEaseOut = (t) => 1 - (1 - t) ** 3
    expect(oldEaseOut(0.2)).toBeGreaterThan(0.48)
    expect(countEase(0.2)).toBeLessThan(0.15)
  })

  it('is symmetric, so it decelerates as much as it accelerates', () => {
    for (const t of [0.1, 0.25, 0.4]) {
      expect(countEase(t) + countEase(1 - t)).toBeCloseTo(1, 6)
    }
  })
})
