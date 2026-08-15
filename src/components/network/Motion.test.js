import { describe, it, expect } from 'vitest'
import { countDuration, countEase } from './Motion'

// THE COUNTER CANNOT BE WATCHED IN THE PREVIEW BROWSER.
// `document.hidden` is true there and requestAnimationFrame never ticks, so a
// counter renders its starting value and stops. The arithmetic is therefore
// what gets checked, and it is the arithmetic that was wrong.

describe('countDuration', () => {
  it('gives a small number long enough to be seen', () => {
    // The reported bug: "44 creators animates up instantly" while the six
    // figure kilometre total looked fine. Both must run for the best part of a
    // second.
    expect(countDuration(6)).toBeGreaterThan(750)
    expect(countDuration(44)).toBeGreaterThan(950)
  })

  it('gives a bigger number longer, but not much longer', () => {
    expect(countDuration(1_200_000)).toBeGreaterThan(countDuration(44))
    // A count nobody is going to sit through is its own bug.
    expect(countDuration(1_200_000)).toBeLessThanOrEqual(1500)
  })

  it('never runs away, however large the number', () => {
    expect(countDuration(9e15)).toBeLessThanOrEqual(1500)
  })

  it('handles zero and negatives without producing nonsense', () => {
    expect(countDuration(0)).toBe(600)
    expect(countDuration(-40)).toBe(countDuration(40))
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
