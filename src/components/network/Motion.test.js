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
    // THE REGRESSION THIS GUARDS. The first curve was `1 - (1-t)^3`, which is at
    // 0.488 by t=0.2 - so a count to 44 read 21 almost immediately and then
    // crawled, which is what "animates up instantly" actually was.
    const oldEaseOut = (t) => 1 - (1 - t) ** 3
    expect(oldEaseOut(0.2)).toBeGreaterThan(0.48)
    expect(countEase(0.2)).toBeLessThan(0.25)
  })

  it('is symmetric, so it decelerates as much as it accelerates', () => {
    for (const t of [0.1, 0.25, 0.4]) {
      expect(countEase(t) + countEase(1 - t)).toBeCloseTo(1, 6)
    }
  })

  // THE REGRESSION THESE TWO GUARD, AND IT IS THE ONE THAT WAS REPORTED LAST.
  //
  // Smoothstep passed every test above and still looked wrong, because none of
  // them asked the question the eye was asking. The readout is an INTEGER, so
  // what a viewer actually sees is how many FRAMES each whole number is on
  // screen for, and on a curve with zero slope at both ends that varies wildly:
  // under smoothstep a count to six holds 0 for eleven frames and flicks
  // through 3 in three. Ethan: "they seem to pause on certain numbers for
  // different amounts of time and it looks bad."
  //
  // A constant rate is the only curve where every integer gets the same dwell,
  // so that is what is asserted - directly, in frames, on the smallest count on
  // the hub's hero row.
  // Frames each whole number is on screen for, on a 60Hz display, over the one
  // clock every counter shares. The two endpoints are half-open (zero is only
  // ever left, the total is only ever landed on) so they are dropped: what has
  // to be even is the run in between, which is the part you watch.
  const dwellFrames = (target, ease) => {
    const frames = Math.round((COUNT_MS / 1000) * 60)
    const held = new Map()
    for (let f = 0; f <= frames; f++) {
      const v = Math.round(target * ease(f / frames))
      held.set(v, (held.get(v) || 0) + 1)
    }
    held.delete(0)
    held.delete(target)
    return [...held.values()]
  }

  it('holds every number on the way for the same number of frames', () => {
    // 44 creators: the smallest of the hub's four figures that still has enough
    // numbers in it for a rhythm to be audible, and the one Ethan was watching.
    const held = dwellFrames(44, countEase)
    expect(Math.max(...held) - Math.min(...held)).toBeLessThanOrEqual(1)
  })

  it('is a real improvement on smoothstep, not a restatement of it', () => {
    // THE REGRESSION THIS GUARDS. Smoothstep put SEVEN frames on the numbers
    // either side of the middle and ONE on the numbers near each end - the same
    // count, in the same second, running seven times slower in places. That is
    // the pause that was reported, measured.
    const smoothstep = (t) => t * t * (3 - 2 * t)
    const old = dwellFrames(44, smoothstep)
    expect(Math.max(...old)).toBeGreaterThanOrEqual(4 * Math.min(...old))
  })

  it('never goes backwards, so a counter only ever climbs', () => {
    let prev = -1
    for (let f = 0; f <= 96; f++) {
      const v = countEase(f / 96)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})
