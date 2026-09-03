import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pinToBottom, isPinning } from './chatScroll'

// THE REGRESSION THIS FILE EXISTS FOR (3 Sep 2026).
//
// A chat opened scrolled up, on both surfaces, across refreshes, for months.
// The cause was not the pinning loop - it was the reader's own `onScroll`
// handler recomputing "are they at the bottom" from a scroll event that the
// PIN had fired, against a scroller that had grown in the meantime. It decided
// the reader had scrolled up, `shouldPin()` went false, and every remaining
// correction was skipped.
//
// `data-pinning` is the lock that fixes it, so these tests are about the LOCK:
// that it is on while a pin is in flight, and off the moment it is not. A test
// that only checked the final scrollTop would have passed before the fix.

function makeScroller({ height = 2000, client = 400 } = {}) {
  const el = document.createElement('div')
  let scrollHeight = height
  Object.defineProperty(el, 'scrollHeight', { get: () => scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { get: () => client, configurable: true })
  let top = 0
  Object.defineProperty(el, 'scrollTop', {
    get: () => top,
    // The browser clamps; so does this, or `scrollTop === scrollHeight` would
    // read back as a distance-from-bottom of clientHeight and nothing would
    // ever look settled.
    set: (v) => { top = Math.min(v, scrollHeight - client) },
    configurable: true,
  })
  el.getBoundingClientRect = () => ({ top: 0, bottom: client, left: 0, right: 300, width: 300, height: client })
  el.querySelectorAll = () => []
  document.body.appendChild(el)
  return { el, grow: (by) => { scrollHeight += by } }
}

describe('pinToBottom', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

  it('marks the scroller as pinning for the whole flight and clears it on settle', () => {
    const { el } = makeScroller()
    const onSettled = vi.fn()
    pinToBottom(() => el, () => true, onSettled)

    expect(isPinning(el)).toBe(true)
    expect(onSettled).not.toHaveBeenCalled()

    // Two stable frames on the timer path (rAF does not run under fake timers).
    vi.advanceTimersByTime(100)

    expect(onSettled).toHaveBeenCalledWith(true)
    expect(isPinning(el)).toBe(false)
  })

  it('clears the lock when cancelled before settling', () => {
    const { el } = makeScroller()
    const cancel = pinToBottom(() => el, () => true, vi.fn())
    expect(isPinning(el)).toBe(true)
    cancel()
    expect(isPinning(el)).toBe(false)
  })

  it('always releases the lock, even when the height never settles', () => {
    const { el, grow } = makeScroller()
    const onSettled = vi.fn()
    // A thread that grows on every single tick: the stable-frame counter can
    // never reach two, so only the hard cap can end this.
    const iv = setInterval(() => grow(50), 8)
    pinToBottom(() => el, () => true, onSettled)
    vi.advanceTimersByTime(2000)
    clearInterval(iv)

    expect(onSettled).toHaveBeenCalledWith(true)
    // The lock must not outlive the pin. A scroller stuck with `data-pinning`
    // would ignore the reader's scrolling forever, which is a worse bug than
    // the one this whole mechanism fixes.
    expect(isPinning(el)).toBe(false)
  })

  it('keeps pinning through a growth spurt rather than stranding the view', () => {
    const { el, grow } = makeScroller({ height: 2000, client: 400 })
    pinToBottom(() => el, () => true, vi.fn())
    vi.advanceTimersByTime(20)
    expect(el.scrollTop).toBe(1600)

    // A legacy photograph decodes and adds 800px. Before the fix, the scroll
    // event this produces is what turned the pin off.
    grow(800)
    vi.advanceTimersByTime(100)
    expect(el.scrollTop).toBe(2400)
  })

  it('isPinning is false for a scroller nobody is pinning', () => {
    const { el } = makeScroller()
    expect(isPinning(el)).toBe(false)
    expect(isPinning(null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// THE CAP MUST NOT REVEAL A THREAD IN THE WRONG PLACE (3 Sep 2026).
//
// The loop converges when the height settles. When it does NOT - a room full of
// photographs on mobile data - `MAX_MS` fires and reveals the thread anyway.
// That safety valve was showing it wherever the last correction left it, which
// is the whole of "the chat doesn't open on the last message", and it is why
// the bug never reproduced on a desktop.
describe('pinToBottom: the reveal is always at the bottom', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

  function scroller({ height = 2000, client = 400 } = {}) {
    const el = document.createElement('div')
    let sh = height
    Object.defineProperty(el, 'scrollHeight', { get: () => sh, configurable: true })
    Object.defineProperty(el, 'clientHeight', { get: () => client, configurable: true })
    let top = 0
    Object.defineProperty(el, 'scrollTop', {
      get: () => top,
      set: (v) => { top = Math.min(v, sh - client) },
      configurable: true,
    })
    el.getBoundingClientRect = () => ({ top: 0, bottom: client, left: 0, right: 300, width: 300, height: client })
    el.querySelectorAll = () => []
    document.body.appendChild(el)
    return { el, grow: (by) => { sh += by } }
  }

  it('pins on the way out when the height never settles', () => {
    const { el, grow } = scroller()
    // Measured AT THE MOMENT OF REVEAL, not afterwards: the thread goes on
    // growing (that is the premise), so a reading taken later says nothing
    // about what the reader was shown.
    let distanceWhenShown = null
    const onSettled = () => { distanceWhenShown = el.scrollHeight - el.scrollTop - el.clientHeight }
    // Grows on every tick, so the stable-frame counter can never reach two and
    // only the hard cap can end this.
    const iv = setInterval(() => grow(120), 8)
    pinToBottom(() => el, () => true, onSettled)
    vi.advanceTimersByTime(2000)
    clearInterval(iv)

    expect(distanceWhenShown).toBe(0)
  })

  it('still respects a reader who has scrolled up', () => {
    const { el, grow } = scroller()
    el.scrollTop = 200
    const iv = setInterval(() => grow(120), 8)
    // shouldPin false throughout: they are reading history.
    pinToBottom(() => el, () => false, vi.fn())
    vi.advanceTimersByTime(2000)
    clearInterval(iv)
    expect(el.scrollTop).toBe(200)
  })
})
