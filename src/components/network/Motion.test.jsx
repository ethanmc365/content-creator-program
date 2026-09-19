import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { countDuration, countEase, COUNT_MS, COUNT_LEAD_MS, CountUp } from './Motion'
import { RevealContext } from '../../lib/revealContext'

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

// ---------------------------------------------------------------------------
// THE COUNTER RUNS ON THE CARD'S CLOCK (19 Sep 2026).
//
// Ethan, on the worldwide page: "sometimes it shows the numbers counting up in
// the animated format, other times it shows 0 and counts up a few seconds
// later, and other times the numbers just immediately show." Three orderings of
// three timers that had nothing to do with each other - see lib/revealContext.
// These pin the two halves of the fix: the count starts when the CARD says it
// is arriving, and the figure itself is never left to requestAnimationFrame.
describe('CountUp', () => {
  let frames
  beforeEach(() => {
    vi.useFakeTimers()
    frames = []
    vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    // `useInView` constructs one even when a card is driving the count.
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  const onCard = (revealed, delayMs = 0) => ({ revealed, delayMs })

  it('does not run while the card it sits on is still hidden', () => {
    const view = render(
      <RevealContext.Provider value={onCard(false)}>
        <CountUp value={120} />
      </RevealContext.Provider>,
    )
    // THE REGRESSION. The counter used to observe itself, and an
    // IntersectionObserver reports an opacity-0 card as perfectly visible - so
    // the whole count ran and finished behind a card nobody could see yet.
    act(() => { vi.advanceTimersByTime(5000) })
    expect(view.container.textContent).toBe('0')
    expect(frames).toHaveLength(0)
  })

  it('starts when the card begins to arrive, and lands on the figure', () => {
    const view = render(
      <RevealContext.Provider value={onCard(true)}>
        <CountUp value={120} />
      </RevealContext.Provider>,
    )
    act(() => { vi.advanceTimersByTime(COUNT_LEAD_MS + 1) })
    expect(frames.length).toBeGreaterThan(0)
    act(() => { frames.shift()(0) })
    act(() => { frames.shift()(COUNT_MS) })
    expect(view.container.textContent).toBe('120')
  })

  it('waits out the card\'s own place in the arrival ladder', () => {
    render(
      <RevealContext.Provider value={onCard(true, 300)}>
        <CountUp value={9} />
      </RevealContext.Provider>,
    )
    act(() => { vi.advanceTimersByTime(COUNT_LEAD_MS + 299) })
    expect(frames).toHaveLength(0)
    act(() => { vi.advanceTimersByTime(2) })
    expect(frames).toHaveLength(1)
  })

  // NEVER GATE THE NUMBER ITSELF ON rAF. It does not run in a background tab or
  // while a phone is launching an installed app, and what was left on screen
  // was a hard zero: "other times it shows 0."
  it('still shows the figure when not a single frame ever runs', () => {
    const view = render(
      <RevealContext.Provider value={onCard(true)}>
        <CountUp value={4471} />
      </RevealContext.Provider>,
    )
    act(() => { vi.advanceTimersByTime(COUNT_LEAD_MS + COUNT_MS + 1000) })
    expect(frames.length).toBeGreaterThan(0)   // it did ask for frames
    expect(view.container.textContent).toBe('4471')  // and did not depend on them
  })

  it('counts when the data lands after the card has already arrived', () => {
    // The hub's statistics come from two requests and the strip renders an
    // em-dash until the slower one is in, so this is the ordinary case, not an
    // edge one.
    const view = render(
      <RevealContext.Provider value={onCard(true)}>
        <CountUp value={null} />
      </RevealContext.Provider>,
    )
    act(() => { vi.advanceTimersByTime(3000) })
    expect(view.container.textContent).toBe('0')
    view.rerender(
      <RevealContext.Provider value={onCard(true)}>
        <CountUp value={88} />
      </RevealContext.Provider>,
    )
    act(() => { vi.advanceTimersByTime(COUNT_LEAD_MS + COUNT_MS + 1000) })
    expect(view.container.textContent).toBe('88')
  })
})
