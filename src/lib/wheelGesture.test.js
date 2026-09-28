import { describe, expect, it } from 'vitest'
import { noteWheel, releasesGesture, resetGesture } from './wheelGesture'

const fresh = () => ({ sum: 0, spent: false, last: 0, mag: 0, peak: 0, decayed: false })

/**
 * Drive a real sequence of wheel events through the gesture exactly as the
 * calendar does, and report how many times the month would have turned.
 *
 * `events` is [magnitude, time] pairs. The month turns when the accumulated
 * magnitude passes the calendar's threshold; after that the gesture is spent
 * until something releases it.
 */
function play(events, { threshold = 70, gap = 240 } = {}) {
  const g = fresh()
  let turns = 0
  const releases = []
  for (const [mag, t] of events) {
    if (releasesGesture(g, mag, t, gap)) { resetGesture(g); releases.push(t) }
    noteWheel(g, mag, t)
    if (g.spent) continue
    g.sum += mag
    if (g.sum > threshold) { g.spent = true; turns += 1 }
  }
  return { turns, releases }
}

describe('releasesGesture', () => {
  it('releases once the wheel has been quiet for the gap', () => {
    const g = { ...fresh(), spent: true, last: 1000, mag: 20, peak: 40, decayed: true }
    expect(releasesGesture(g, 12, 1241)).toBe(true)
  })

  it('does not release on the decaying tail of the swipe that just turned', () => {
    // macOS fires momentum for up to a second; each event is inside the gap and
    // smaller than the one before it.
    const g = { ...fresh(), spent: true, last: 1000, mag: 40, peak: 40 }
    let t = 1000
    for (const mag of [30, 22, 16, 11, 7, 4, 2]) {
      t += 16
      expect(releasesGesture(g, mag, t)).toBe(false)
      noteWheel(g, mag, t)
    }
    expect(g.decayed).toBe(true) // it did fall away from its peak
  })

  it('releases immediately when the fingers push again mid-tail', () => {
    const g = { ...fresh(), spent: true, last: 1000, mag: 6, peak: 40, decayed: true }
    expect(releasesGesture(g, 18, 1008)).toBe(true)
  })

  it('needs a real rise, not a wobble in the tail', () => {
    const g = { ...fresh(), spent: true, last: 1000, mag: 20, peak: 90, decayed: true }
    expect(releasesGesture(g, 21, 1008)).toBe(false)  // +5%
    expect(releasesGesture(g, 24, 1008)).toBe(false)  // +20%, under 1.25x
    expect(releasesGesture(g, 26, 1008)).toBe(true)   // +30%
  })

  it('ignores a rise that is only a rise because the tail is near zero', () => {
    const g = { ...fresh(), spent: true, last: 1000, mag: 0.4, peak: 40, decayed: true }
    expect(releasesGesture(g, 1, 1008)).toBe(false)
    expect(releasesGesture(g, 2.9, 1008)).toBe(false)
    expect(releasesGesture(g, 3.5, 1008)).toBe(true)
  })

  // THE FOUR-MONTH BUG. A rise only means "fingers again" once the gesture has
  // fallen away from its own peak; while a swipe is still ramping up, every
  // event is bigger than the one before it and none of them is a new swipe.
  it('does not release while a swipe is still accelerating', () => {
    const g = { ...fresh(), spent: true, last: 1000, mag: 9, peak: 9 }
    expect(releasesGesture(g, 30, 1016)).toBe(false)
    noteWheel(g, 30, 1016)
    expect(releasesGesture(g, 70, 1032)).toBe(false)
  })

  it('never releases a gesture that is still being accumulated', () => {
    const g = { ...fresh(), last: 1000, mag: 5, peak: 5 }
    expect(releasesGesture(g, 40, 1008)).toBe(false)
  })

  it('still releases an unspent gesture across a quiet gap', () => {
    const g = { ...fresh(), last: 1000, mag: 5, peak: 5 }
    expect(releasesGesture(g, 5, 1500)).toBe(true)
  })

  it('takes the gap as a parameter', () => {
    const g = { ...fresh(), spent: true, last: 1000, mag: 20, peak: 40, decayed: true }
    expect(releasesGesture(g, 1, 1100, 240)).toBe(false)
    expect(releasesGesture(g, 1, 1100, 50)).toBe(true)
  })

  it('handles a first-ever event, where there is no history', () => {
    expect(releasesGesture(fresh(), 10, 8_400)).toBe(true)
  })
})

// The cases that matter are whole gestures, because the fault was never in one
// comparison - it was in what a run of them added up to.
describe('a whole swipe', () => {
  // Magnitudes measured off a real macOS two-finger flick: a ramp up, a peak,
  // then a momentum tail that runs on for the best part of a second.
  const RAMP = [2, 9, 30, 70, 96]
  const TAIL = [78, 60, 45, 33, 24, 17, 12, 8, 5, 3, 2, 1]
  const at = (mags, from = 1000, step = 16) => mags.map((m, i) => [m, from + i * step])

  it('turns exactly one month, however long the tail runs', () => {
    expect(play(at([...RAMP, ...TAIL])).turns).toBe(1)
  })

  it('turns two months for two swipes with no pause between them', () => {
    // The reader flicks, the tail is still running, and they flick again. This
    // is Ethan's "I don't have to move my mouse between it".
    const first = at([...RAMP, ...TAIL.slice(0, 8)])
    const second = at([...RAMP, ...TAIL], first[first.length - 1][1] + 16)
    expect(play([...first, ...second]).turns).toBe(2)
  })

  it('turns two months for two swipes separated by a pause', () => {
    const first = at([...RAMP, ...TAIL])
    const second = at([...RAMP, ...TAIL], first[first.length - 1][1] + 600)
    expect(play([...first, ...second]).turns).toBe(2)
  })

  it('turns three months for three swipes, not twelve', () => {
    let t = 1000
    const events = []
    for (let i = 0; i < 3; i++) {
      events.push(...at([...RAMP, ...TAIL], t))
      t = events[events.length - 1][1] + 16
    }
    expect(play(events).turns).toBe(3)
  })

  it('turns nothing for a nudge too small to mean a swipe', () => {
    expect(play(at([3, 6, 8, 5, 2, 1])).turns).toBe(0)
  })
})
