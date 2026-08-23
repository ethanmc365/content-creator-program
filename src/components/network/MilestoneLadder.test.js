import { describe, it, expect } from 'vitest'
import { requirementLine, remainingLine, fractionOf, METRIC_COPY } from './MilestoneLadder'

// THE NUMBERS ON THE MILESTONE PAGE.
//
// "It seems inaccurate" was the report, and it was correct: the drawing it
// replaced worked out which milestone was next by indexing the list with a
// COUNT of reached ones, which is only right if the ones you have are the first
// n. They are not - five metrics move at five speeds. These pin down the
// arithmetic that the page and the profile snippet both read from.

const m = (over) => ({ metric: 'videos', threshold: 10, value: 4, ...over })

describe('what a milestone asks for', () => {
  it('reads as a sentence, with the unit', () => {
    expect(requirementLine('videos', 4, 10)).toBe('4 of 10 videos')
    expect(requirementLine('challenges', 1, 3)).toBe('1 of 3 challenges')
    expect(requirementLine('days', 61, 90)).toBe('61 of 90 days')
    expect(requirementLine('referrals', 0, 2)).toBe('0 of 2 creators')
  })

  // A MILLION IS NOT A READABLE NUMBER. Views are the one metric whose
  // thresholds run into seven figures, and "643122 of 1000000 views" is a
  // string nobody parses.
  it('abbreviates views', () => {
    expect(requirementLine('views', 6400, 10000)).toMatch(/6\.4k of 10k views/)
  })

  it('never shows a negative or a fraction', () => {
    expect(requirementLine('videos', -3, 10)).toBe('0 of 10 videos')
    expect(requirementLine('videos', 4.8, 10)).toBe('4 of 10 videos')
  })

  it('every metric the admin editor offers has copy for it', () => {
    for (const key of ['videos', 'views', 'referrals', 'challenges', 'days']) {
      expect(METRIC_COPY[key], key).toBeTruthy()
      expect(METRIC_COPY[key].what.length, key).toBeGreaterThan(20)
    }
  })
})

describe('how far off it is', () => {
  it('counts down in the metric, not in per cent', () => {
    expect(remainingLine(m({ value: 4, threshold: 10 }))).toBe('6 more videos to go.')
    expect(remainingLine(m({ metric: 'days', value: 89, threshold: 90 }))).toBe('1 more day to go.')
    expect(remainingLine(m({ metric: 'referrals', value: 1, threshold: 2 }))).toBe('1 more creator to go.')
  })

  it('abbreviates the views it is short of', () => {
    expect(remainingLine(m({ metric: 'views', value: 6400, threshold: 10000 }))).toBe('3.6k more views to go.')
  })

  // A CREATOR PAST THE THRESHOLD WHOSE ROW HAS NOT FLIPPED YET. The metrics are
  // recomputed on a schedule, so this state is real and lasts hours.
  it('says something sensible when the number is already there', () => {
    expect(remainingLine(m({ value: 12, threshold: 10 }))).toMatch(/lands next time/)
  })
})

describe('the fraction a bar is drawn from', () => {
  it('is the value over the threshold', () => {
    expect(fractionOf(m({ value: 4, threshold: 10 }))).toBeCloseTo(0.4)
  })

  it('never leaves 0..1, whatever the row says', () => {
    expect(fractionOf(m({ value: 99, threshold: 10 }))).toBe(1)
    expect(fractionOf(m({ value: -5, threshold: 10 }))).toBe(0)
    // A threshold of zero is a bad row, not a division by zero.
    expect(fractionOf(m({ value: 5, threshold: 0 }))).toBe(1)
    expect(fractionOf(null)).toBe(0)
  })
})
