import { describe, expect, it } from 'vitest'
import { releasesGesture } from './wheelGesture'

// A spent gesture mid-tail: the month has just turned and momentum is running.
const spent = (mag, last = 1000) => ({ spent: true, last, mag })
const live = (mag, last = 1000) => ({ spent: false, last, mag })

describe('releasesGesture', () => {
  it('releases once the wheel has been quiet for the gap', () => {
    expect(releasesGesture(spent(20), 12, 1000 + 241)).toBe(true)
  })

  it('does not release on the decaying tail of the swipe that just turned', () => {
    // This is the bug. macOS fires momentum for up to a second; each event is
    // within the gap and smaller than the one before it.
    let g = spent(40)
    for (const [mag, t] of [[30, 1016], [22, 1032], [16, 1048], [11, 1064], [7, 1080], [4, 1096], [2, 1112]]) {
      expect(releasesGesture(g, mag, t)).toBe(false)
      g = { ...g, last: t, mag }
    }
  })

  it('releases immediately when the fingers push again mid-tail', () => {
    // The tail is down to 6 and the reader swipes again: the next delta rises.
    expect(releasesGesture(spent(6), 18, 1008)).toBe(true)
  })

  it('needs a real rise, not a wobble in the tail', () => {
    expect(releasesGesture(spent(20), 21, 1008)).toBe(false)   // +5%, still decaying
    expect(releasesGesture(spent(20), 24, 1008)).toBe(false)   // +20%, under 1.25x
    expect(releasesGesture(spent(20), 26, 1008)).toBe(true)    // +30%
  })

  it('ignores a rise that is only a rise because the tail is near zero', () => {
    // 0.4 -> 1.0 is 2.5x but both are noise; the floor of 3 stops it.
    expect(releasesGesture(spent(0.4), 1, 1008)).toBe(false)
    expect(releasesGesture(spent(0.4), 2.9, 1008)).toBe(false)
    expect(releasesGesture(spent(0.4), 3.5, 1008)).toBe(true)
  })

  it('never releases a gesture that is still being accumulated', () => {
    // An unspent gesture is mid-swipe: rising deltas are the swipe itself, and
    // resetting on them would zero the sum and stop the month ever turning.
    expect(releasesGesture(live(5), 40, 1008)).toBe(false)
    expect(releasesGesture(live(40), 80, 1016)).toBe(false)
  })

  it('still releases an unspent gesture across a quiet gap', () => {
    // A swipe too small to turn the month, then a pause: the next swipe starts
    // from zero rather than adding to the abandoned one.
    expect(releasesGesture(live(5), 5, 1000 + 500)).toBe(true)
  })

  it('takes the gap as a parameter', () => {
    expect(releasesGesture(spent(20), 1, 1100, 240)).toBe(false)
    expect(releasesGesture(spent(20), 1, 1100, 50)).toBe(true)
  })

  it('handles a first-ever event, where there is no history', () => {
    // `last` starts at 0 and the clock is however long the page has been open,
    // so the first swipe always opens its own gesture.
    expect(releasesGesture({ spent: false, last: 0, mag: 0 }, 10, 8_400)).toBe(true)
  })
})
