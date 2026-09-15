import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { useRef } from 'react'
import { usePinnedToBottom } from './pinnedBar'

// A BAR THAT HAS COME OFF THE BOTTOM, WITHOUT AN IPHONE TO COME OFF IT ON.
//
// jsdom has no compositor, so the fault itself cannot be reproduced here - and
// it does not need to be. What has to be true is the thing the fix rests on:
// that a bar whose measured bottom is not the bottom of the viewport gets put
// back, that one sitting where it should be is left alone, and that coming back
// to the app re-pins it whether or not the measurement noticed anything. Those
// are all testable, and the third is the one Ethan's app-switch clue named.
//
// `getBoundingClientRect` is the seam. Overriding it on the node is exactly
// what iOS does to this element in the wild: report a bottom that is not the
// bottom of the screen.

function Bar({ slidAway = false, onRef }) {
  const ref = useRef(null)
  usePinnedToBottom(ref, slidAway)
  return <nav ref={(el) => { ref.current = el; onRef?.(el) }} style={{ position: 'fixed' }}>tabs</nav>
}

function detach(el, { bottom, height = 66 }) {
  el.getBoundingClientRect = () => ({
    top: bottom - height, bottom, height, left: 0, right: 0, width: 0, x: 0, y: 0,
  })
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height })
}

// The repin is `display:none` -> forced reflow -> `display` back. Counting
// writes to `display` is how we see it happen.
function watchDisplay(el) {
  const seen = []
  const real = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'display')
  Object.defineProperty(el.style, 'display', {
    configurable: true,
    get() { return real.get.call(this) },
    set(v) { seen.push(v); real.set.call(this, v) },
  })
  return seen
}

describe('usePinnedToBottom', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.innerHeight = 800
  })
  afterEach(() => vi.useRealTimers())

  it('puts the bar back when it has drifted up the screen', () => {
    let el = null
    render(<Bar onRef={(n) => { el = n }} />)
    // The photograph: the bar is sitting a browser-toolbar's height too high.
    detach(el, { bottom: 700 })
    const writes = watchDisplay(el)
    act(() => { window.dispatchEvent(new Event('scroll')); vi.advanceTimersByTime(50) })
    expect(writes).toEqual(['none', ''])
  })

  it('leaves a correctly pinned bar completely alone', () => {
    let el = null
    render(<Bar onRef={(n) => { el = n }} />)
    detach(el, { bottom: 800 })
    const writes = watchDisplay(el)
    act(() => { window.dispatchEvent(new Event('scroll')); vi.advanceTimersByTime(50) })
    expect(writes).toEqual([])
  })

  it('does not drag the bar back over the composer while the keyboard is open', () => {
    // Slid away is a CORRECT position: one bar-height below the fold. Measuring
    // that as a 66px drift and "fixing" it is how a watchdog becomes the bug.
    let el = null
    render(<Bar slidAway onRef={(n) => { el = n }} />)
    detach(el, { bottom: 866 })
    const writes = watchDisplay(el)
    act(() => { window.dispatchEvent(new Event('scroll')); vi.advanceTimersByTime(50) })
    expect(writes).toEqual([])
  })

  it('re-pins on coming back to the app without waiting to be asked', () => {
    // The signal Ethan named. The measurement can MISS here - iOS often still
    // reports the old layout viewport at this instant - so this one is
    // unconditional, and correct placement must not stop it.
    let el = null
    render(<Bar onRef={(n) => { el = n }} />)
    detach(el, { bottom: 800 })
    const writes = watchDisplay(el)
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(writes.slice(0, 2)).toEqual(['none', ''])
  })

  it('also re-pins on a bfcache restore and on regaining focus', () => {
    for (const event of ['pageshow', 'focus']) {
      let el = null
      const view = render(<Bar onRef={(n) => { el = n }} />)
      detach(el, { bottom: 800 })
      const writes = watchDisplay(el)
      act(() => { window.dispatchEvent(new Event(event)) })
      expect(writes.slice(0, 2), event).toEqual(['none', ''])
      view.unmount()
    }
  })

  it('stops listening when the bar unmounts', () => {
    let el = null
    const view = render(<Bar onRef={(n) => { el = n }} />)
    detach(el, { bottom: 700 })
    const writes = watchDisplay(el)
    view.unmount()
    act(() => { window.dispatchEvent(new Event('scroll')); vi.advanceTimersByTime(100) })
    expect(writes).toEqual([])
  })
})
