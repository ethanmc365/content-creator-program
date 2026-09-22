import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import Reveal from './Reveal'
import { lockScroll } from '../../lib/scrollLock'
import { resetPageSettled } from '../../lib/pageSettled'

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
    /** The element is no longer intersecting, and its top is at `top`. */
    leave(el, top) {
      const io = watched.get(el)
      if (io) act(() => io.cb([{ target: el, isIntersecting: false, boundingClientRect: { top } }]))
    },
    has: (el) => watched.has(el),
    count: () => watched.size,
  }
}

/** Force what every element reports as its height, and the viewport's.
 *  Returns a setter so a test can make a container GROW, which is what half of
 *  the sections on the hub do a second after they mount. */
function setHeights({ container, viewport = 800 }) {
  window.innerHeight = viewport
  let h = container
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() { return this.classList.contains('reveal') ? h : 100 },
  })
  return (next) => { h = next }
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
    // `lib/pageSettled` is module state and a test is a fresh page. Without
    // this, one test's pending quiet timer is thrown away by the next test's
    // fake clock and the page never settles again.
    resetPageSettled()
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

  // PAST BOTH GATES. `painted` is two frames or 80ms (a transition needs its
  // FROM state drawn first), and the observers do not arm until `lib/pageSettled`
  // reports the document has stopped changing height - 400ms of quiet. A test
  // that only advanced past the first one was testing a page still mid-load.
  const paint = () => act(() => { vi.advanceTimersByTime(500) })

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

  // MOTION SPENT BEHIND A DIALOG IS MOTION NOBODY SEES (18 Sep 2026).
  //
  // Ethan, on a phone: "when the worldwide page loads on mobile there is no
  // animations." The notifications ask opens on app open and freezes the page
  // (lib/scrollLock); an IntersectionObserver cannot see a scrim, so the whole
  // top of the hub ran its entrance behind one and was already finished by the
  // time the reader could look at it.
  it('holds its motion while an overlay has the page frozen, and takes it back on release', () => {
    setHeights({ container: 300, viewport: 800 })
    const release = lockScroll()
    const view = render(<Cards />)
    paint()
    const grid = view.container.querySelector('.reveal')
    // Nothing is even being observed: there is no moment to decide yet.
    expect(io.has(grid)).toBe(false)
    expect(grid.classList.contains('is-in')).toBe(false)
    // And the 1200ms net does not quietly reveal it either.
    act(() => { vi.advanceTimersByTime(1500) })
    expect(grid.classList.contains('is-in')).toBe(false)

    act(() => { release() })
    expect(io.has(grid)).toBe(true)
    io.fire(grid)
    expect(grid.classList.contains('is-in')).toBe(true)
  })

  it('does not hold the contents of the dialog that is doing the freezing', () => {
    setHeights({ container: 300, viewport: 800 })
    const release = lockScroll()
    const view = render(
      <div role="dialog">
        <Cards />
      </div>,
    )
    paint()
    const grid = view.container.querySelector('.reveal')
    expect(io.has(grid)).toBe(true)
    io.fire(grid)
    expect(grid.classList.contains('is-in')).toBe(true)
    act(() => { release() })
  })

  // AN ENTRANCE SPENT ON AN EMPTY BOX IS AN ENTRANCE NOBODY SEES (19 Sep 2026).
  //
  // Ethan: "for mobile there is still no real visible animations... the latest
  // announcements, today's puzzles and everyone right now [don't]". Measured on
  // the hub: a section sat at offsetHeight 0 for a second while its query ran,
  // and its 720ms ran against nothing.
  it('will not begin while the container has nothing in it yet', () => {
    const grow = setHeights({ container: 0, viewport: 800 })
    const view = render(<Cards />)
    paint()
    const grid = view.container.querySelector('.reveal')
    // Not even observed: there is nothing to decide about.
    expect(io.has(grid)).toBe(false)
    act(() => { vi.advanceTimersByTime(1500) })
    expect(grid.classList.contains('is-in')).toBe(false)

    // The query lands. THE TIMER FINDS IT, not the ResizeObserver - which is
    // the point of the timers: a host that is not painting delivers no resize
    // entries at all, and a section that filled while nothing was watching must
    // not be left at opacity 0 for the life of the page.
    grow(300)
    act(() => { vi.advanceTimersByTime(1300) })
    expect(io.has(grid)).toBe(true)
    io.fire(grid)
    expect(grid.classList.contains('is-in')).toBe(true)
  })

  // A REVEAL IS FINAL. Re-animating a section every time it scrolls past is a
  // page that will not sit still, and the whole component is built on not doing
  // that. The cascade is fixed by never deciding while the page is moving (the
  // test above), not by changing this.
  it('never takes a reveal back once it has happened', () => {
    setHeights({ container: 300, viewport: 800 })
    const view = render(<Cards />)
    paint()
    const grid = view.container.querySelector('.reveal')
    io.fire(grid)
    io.leave(grid, 900)
    expect(grid.classList.contains('is-in')).toBe(true)
  })

  // THE LOAD RACE, WHICH IS WHAT MADE IT WORK "MOST OF THE TIME" (19 Sep 2026).
  //
  // Ethan: "most of the time they don't seem to work, I think it depends on how
  // long it takes for the page to load." The observer used to fire on the frame
  // the sections committed, which is the frame the browser is busiest, so
  // whether a 720ms entrance was smooth, juddered, or was dropped to its last
  // frame depended on the connection.
  it('does not decide anything while the page is still changing height', () => {
    setHeights({ container: 300, viewport: 800 })
    const view = render(<Cards />)
    const grid = view.container.querySelector('.reveal')
    // Painted, but the page has not been quiet yet.
    act(() => { vi.advanceTimersByTime(100) })
    expect(io.has(grid)).toBe(false)
    act(() => { vi.advanceTimersByTime(400) })
    expect(io.has(grid)).toBe(true)
  })

  // Ethan: "it shows a white screen for a second first." A section already on
  // the first screen must not wait for the rest of the page to stop growing.
  it('starts a section that is on the first screen without waiting for the page to settle', () => {
    setHeights({ container: 300, viewport: 800 })
    const orig = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function rect() {
      return this.classList.contains('reveal') ? { top: 120, bottom: 420 } : { top: 0, bottom: 0 }
    }
    try {
      const view = render(<Cards />)
      const grid = view.container.querySelector('.reveal')
      // Painted (80ms), nowhere near the 400ms of quiet the settle gate needs.
      act(() => { vi.advanceTimersByTime(100) })
      expect(grid.classList.contains('is-in')).toBe(true)
    } finally {
      HTMLElement.prototype.getBoundingClientRect = orig
    }
  })

  it('still waits for the page to settle for a section below the first screen', () => {
    setHeights({ container: 300, viewport: 800 })
    const orig = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function rect() {
      return this.classList.contains('reveal') ? { top: 1500, bottom: 1800 } : { top: 0, bottom: 0 }
    }
    try {
      const view = render(<Cards />)
      const grid = view.container.querySelector('.reveal')
      act(() => { vi.advanceTimersByTime(100) })
      expect(grid.classList.contains('is-in')).toBe(false)
    } finally {
      HTMLElement.prototype.getBoundingClientRect = orig
    }
  })

  it('shows the content anyway if the page never stops moving', () => {
    setHeights({ container: 300, viewport: 800 })
    const view = render(<Cards />)
    const grid = view.container.querySelector('.reveal')
    grid.getBoundingClientRect = () => ({ top: 10 })
    // The net does not wait for anything. Whatever else is wrong, a section on
    // screen after 1.2 seconds is a section the reader gets.
    act(() => { vi.advanceTimersByTime(100) })
    act(() => { vi.advanceTimersByTime(1300) })
    expect(grid.classList.contains('is-in')).toBe(true)
  })

  it('shows everything when there is no IntersectionObserver at all', () => {
    setHeights({ container: 1400, viewport: 800 })
    vi.stubGlobal('IntersectionObserver', undefined)
    const view = render(<Cards />)
    paint()
    expect(items(view).every((el) => el.classList.contains('is-in'))).toBe(true)
  })
})
