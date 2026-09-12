import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import Reveal from './Reveal'

// THE ANIMATION THAT WAS RUNNING IN THE WRONG PLACE.
//
// Ethan (9 Sep 2026), about the landing page on a phone: "it is terrible,
// doesn't have any of those clean animations."
//
// `Reveal` observes the CONTAINER, which is right while the container fits on a
// screen and wrong the moment the same grid stacks into one column: the
// landing page's three-step grid measured 1,322px inside an 812px viewport, so
// it "arrived" when its first card did and the whole stagger was spent two
// screens before the reader got there. These tests pin the rule that decides
// which unit is observed, and that a tall container never reveals its children
// as one block.

/** A controllable IntersectionObserver. `fire(el)` delivers an entry for it. */
function installObserver() {
  const watched = new Map()
  class FakeIO {
    constructor(cb) { this.cb = cb }
    observe(el) { watched.set(el, this) }
    unobserve(el) { watched.delete(el) }
    disconnect() { [...watched].forEach(([el, io]) => { if (io === this) watched.delete(el) }) }
  }
  vi.stubGlobal('IntersectionObserver', FakeIO)
  return {
    fire(el) {
      const io = watched.get(el)
      if (io) act(() => io.cb([{ target: el, isIntersecting: true }]))
    },
    has: (el) => watched.has(el),
    count: () => watched.size,
  }
}

/** Force what every element reports as its height, and the viewport's. */
function setHeights({ container, viewport = 800 }) {
  window.innerHeight = viewport
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() { return this.classList.contains('reveal') ? container : 100 },
  })
}

const Cards = (props) => (
  <Reveal {...props}>
    <div data-testid="a">A</div>
    <div data-testid="b">B</div>
    <div data-testid="c">C</div>
  </Reveal>
)

const items = (view) => [...view.container.querySelectorAll('.reveal-item')]

describe('Reveal', () => {
  let io
  beforeEach(() => {
    vi.useFakeTimers()
    io = installObserver()
    // rAF does not run in a background tab or an embedded pane, which is why
    // `painted` is backed by an 80ms timer. Tests drive the timer.
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    delete HTMLElement.prototype.offsetHeight
  })

  const paint = () => act(() => { vi.advanceTimersByTime(100) })

  it('observes the container when the grid fits on a screen', () => {
    setHeights({ container: 300, viewport: 800 })
    const view = render(<Cards />)
    paint()
    const grid = view.container.querySelector('.reveal')
    expect(io.has(grid)).toBe(true)
    io.fire(grid)
    expect(grid.classList.contains('is-in')).toBe(true)
  })

  it('staggers the children in the short mode, which is what makes a row read as a row', () => {
    setHeights({ container: 300, viewport: 800 })
    const view = render(<Cards />)
    paint()
    expect(items(view).map((el) => el.style.getPropertyValue('--reveal-i'))).toEqual(['0', '1', '2'])
  })

  // THE REGRESSION. A container two screens tall must not answer for children
  // the reader has not reached.
  it('observes each child instead once the container is taller than the screen', () => {
    setHeights({ container: 1400, viewport: 800 })
    const view = render(<Cards />)
    paint()
    const grid = view.container.querySelector('.reveal')
    const [a, b, c] = items(view)
    expect(io.has(a) && io.has(b) && io.has(c)).toBe(true)

    io.fire(a)
    expect(a.classList.contains('is-in')).toBe(true)
    // The two the reader has not scrolled to are still waiting, and the
    // container has NOT claimed them on their behalf.
    expect(b.classList.contains('is-in')).toBe(false)
    expect(c.classList.contains('is-in')).toBe(false)
    expect(grid.classList.contains('is-in')).toBe(false)

    io.fire(c)
    expect(c.classList.contains('is-in')).toBe(true)
    expect(b.classList.contains('is-in')).toBe(false)
  })

  // THE LAYER HINT MUST OUTLIVE THE MOVEMENT IT WAS PROMISED FOR.
  //
  // `will-change: opacity, transform` is withdrawn by `is-done` (see the note
  // beside `.reveal.is-done` in index.css). The container path learned on 9 Sep
  // to add that class on a TIMER, once the stagger was over, because adding it
  // alongside `is-in` makes every card lose its compositor layer on the frame
  // it starts moving and be re-rasterised mid-slide. The per-item path was then
  // written as `' is-in is-done'` - both in one commit, the original fault
  // exactly, with no timer at all.
  //
  // And per-item IS the phone: it engages whenever a container is taller than
  // 1.25 viewports, which is what a stacked single-column section is. So the
  // branch that exists to make mobile animate properly was cancelling the hint
  // on the starting frame of every card it governed. Ethan: "the sections just
  // seem to flash and appear in."
  it('does not withdraw a child\'s layer hint on the frame it starts moving', () => {
    vi.useFakeTimers()
    try {
      setHeights({ container: 1400, viewport: 800 })
      const view = render(<Cards />)
      paint()
      const [a] = items(view)

      io.fire(a)
      expect(a.classList.contains('is-in')).toBe(true)
      expect(a.classList.contains('is-done')).toBe(false)

      // ...and it IS withdrawn once the card has landed, or a page of
      // permanently promoted layers is the opposite mistake.
      act(() => { vi.advanceTimersByTime(900) })
      expect(a.classList.contains('is-done')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  // A section that fits the screen while it is empty and grows past it when its
  // query lands would otherwise switch modes mid-animation - and switching
  // takes `is-in` off the CONTAINER, snapping every child back to opacity 0.
  it('does not change its mind about which observer owns it after revealing', () => {
    setHeights({ container: 400, viewport: 800 })
    const view = render(<Cards />)
    paint()
    const grid = view.container.querySelector('.reveal')
    io.fire(grid)
    expect(grid.classList.contains('is-in')).toBe(true)

    // The contents arrive and the section is now three screens tall.
    setHeights({ container: 2400, viewport: 800 })
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(grid.classList.contains('is-in')).toBe(true)
  })

  it('drops the stagger in the tall mode: a child arriving alone must not hesitate', () => {
    setHeights({ container: 1400, viewport: 800 })
    const view = render(<Cards />)
    paint()
    expect(items(view).map((el) => el.style.getPropertyValue('--reveal-i'))).toEqual(['0', '0', '0'])
  })

  // An embedded Instagram or TikTok webview stubs the observer without ever
  // delivering entries. In the tall mode that would be missing CONTENT, not a
  // missing animation.
  it('reveals anything at or above the fold if the observer never fires', () => {
    setHeights({ container: 1400, viewport: 800 })
    const view = render(<Cards />)
    paint()
    const [a, b] = items(view)
    a.getBoundingClientRect = () => ({ top: 100 })
    b.getBoundingClientRect = () => ({ top: 1600 })
    items(view)[2].getBoundingClientRect = () => ({ top: 2400 })
    act(() => { vi.advanceTimersByTime(1500) })
    expect(a.classList.contains('is-in')).toBe(true)
    expect(b.classList.contains('is-in')).toBe(false)
  })

  it('shows everything when there is no IntersectionObserver at all', () => {
    setHeights({ container: 1400, viewport: 800 })
    vi.stubGlobal('IntersectionObserver', undefined)
    const view = render(<Cards />)
    paint()
    expect(items(view).every((el) => el.classList.contains('is-in'))).toBe(true)
  })
})
