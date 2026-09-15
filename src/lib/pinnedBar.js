import { useEffect } from 'react'

// KEEPING THE BOTTOM TAB BAR ON THE BOTTOM, FOR THE THIRD TIME.
//
// THE REPORT, three times now, most recently 15 Sep 2026. Ethan: "the bottom
// tab bar 'worldwide, challenges, etc' appears to move up the screen as
// scrolling, covering what's on screen. This should obviously never move from
// the bottom so I don't know why it's happening." With, this time, the piece
// that had been missing from the first two reports:
//
//     "whenever I switch apps, like go from Apple notes to the CCC app and
//      scroll, the glitch appears."
//
// WHAT THE FIRST TWO ATTEMPTS DID, and why neither could have been enough.
// They went after CAUSES: a transformed ancestor (the bar is portalled to
// `document.body` now, so it has none), `backdrop-filter` on a fixed element (a
// known WebKit compositing failure - the blur is gone, the ground is opaque
// white), and no compositing layer of its own (`translate3d(0,0,0)`). Those are
// all real hazards and all of them are worth having removed. But every one of
// them is a HYPOTHESIS about which mechanism detaches the bar, and the bar came
// off the bottom again after both of them. Guessing again would be the third
// guess.
//
// WHAT THE APP-SWITCH CLUE ACTUALLY SAYS. Returning to a backgrounded Safari
// (or a backgrounded installed app) is the moment the browser re-shows its
// toolbars, re-rasterises the page and, on iOS, recomputes a LAYOUT VIEWPORT
// that it had suspended. `position: fixed` is resolved against that layout
// viewport. Scroll immediately afterwards - which is what a person does when
// they come back to a feed - and the toolbars collapse, the layout viewport
// GROWS by their height, and a fixed element whose position the compositor has
// not re-pinned is left sitting at the bottom of the viewport as it used to be,
// which is now roughly a hundred pixels up the screen. That is the photograph.
// The "covering things" is the bar drawn over content, and it snaps back when
// something eventually forces a re-layout.
//
// SO THIS ONE DOES NOT GUESS. It MEASURES, on every signal that has ever
// preceded the fault, and corrects. The invariant is one line and it does not
// depend on knowing which mechanism failed:
//
//     a bar pinned to `bottom: 0` has `getBoundingClientRect().bottom`
//     equal to `window.innerHeight`
//
// If that is not true, the browser has detached it, whatever the reason was,
// and it is put back. A watchdog is the right shape for a bug that has
// survived two correct root-cause fixes: those removed the ways it could
// happen, and this removes the consequence of it happening anyway.
//
// WHY IT IS NOT A `useState` AND DOES NOT RE-RENDER. The correction is a style
// write and a forced reflow on one element. Routing it through React would put
// a render of the whole layout on the scroll path, which is the one thing that
// would make this worse.

// How far out of place is worth correcting. Sub-pixel rounding and the one-off
// half-pixel a device-pixel-ratio of 2.75 produces are not a detached bar; the
// fault this exists for is off by the height of a browser toolbar.
const DRIFT_PX = 3

/**
 * Put a detached `position: fixed` element back on the bottom of the viewport.
 *
 * `display: none`, a synchronous read of `offsetHeight`, then `display` back.
 * The read is what makes it work - it forces a reflow BETWEEN the two writes,
 * so the browser cannot coalesce them and has to lay the element out again,
 * which is exactly what it failed to do on its own. All three happen inside one
 * task, so there is no frame in which the bar is missing and nothing flickers.
 */
function repin(el) {
  const previous = el.style.display
  el.style.display = 'none'
  // The READ is the point: it forces the reflow between the two writes. Held in
  // a variable because an expression statement reads as a mistake and will be
  // deleted by the next person tidying up - which would silently turn this
  // whole function into two writes the browser is free to coalesce into none.
  const forcedReflow = el.offsetHeight
  el.style.display = previous
  return forcedReflow
}

/**
 * Hold a fixed, bottom-anchored element against the bottom of the viewport.
 *
 * @param ref       the element
 * @param slidAway  whether the element is deliberately translated fully below
 *                  the fold right now. The tab bar slides itself off the bottom
 *                  when the keyboard opens, and that is a CORRECT position that
 *                  must not be "corrected" back over the composer - so the
 *                  expected bottom is one bar-height lower while it is true.
 *                  A boolean rather than a pixel count because the height is
 *                  the element's own and is measured here, in the effect: the
 *                  caller reading `ref.current.offsetHeight` would be reading a
 *                  ref during render, which React is right to refuse.
 */
export function usePinnedToBottom(ref, slidAway = false) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    let frame = 0
    let timer = 0

    const check = () => {
      const node = ref.current
      if (!node) return
      // A bar that is not being drawn cannot be out of place, and measuring it
      // would report zeroes and "correct" them for ever.
      if (node.offsetParent === null && getComputedStyle(node).position !== 'fixed') return
      const bottom = node.getBoundingClientRect().bottom
      const expected = window.innerHeight + (slidAway ? node.offsetHeight : 0)
      if (Math.abs(bottom - expected) > DRIFT_PX) repin(node)
    }

    // ARMED TWO WAYS, BECAUSE rAF DOES NOT ALWAYS RUN. Same rule as
    // lib/useKeyboardInset and lib/chatScroll: a requestAnimationFrame is
    // throttled to a stop in a background tab and under automation, and this
    // has to work on the frame the tab STOPS being in the background, which is
    // the whole point of it. Whichever arrives first wins and cancels the
    // other.
    const soon = () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      const once = () => { cancelAnimationFrame(frame); clearTimeout(timer); check() }
      frame = requestAnimationFrame(once)
      timer = setTimeout(once, 32)
    }

    // COMING BACK TO THE APP IS RE-PINNED WITHOUT ASKING. This is the signal
    // Ethan named, it costs one reflow, and it happens at a moment when the
    // browser is relaying out the whole page anyway - so the measurement that
    // would decide whether to bother is worth less than the certainty.
    //
    // It is also the case a measurement can MISS: the layout viewport is often
    // still the old one at the instant `visibilitychange` fires, so the bar
    // measures correctly against a viewport that is about to change under it.
    // Re-pinning unconditionally, and again a beat later, covers both.
    const onReturn = () => {
      const node = ref.current
      if (node) repin(node)
      soon()
      setTimeout(soon, 250)
      setTimeout(soon, 600)
    }

    const onVisible = () => { if (document.visibilityState === 'visible') onReturn() }

    window.addEventListener('scroll', soon, { passive: true })
    window.addEventListener('resize', soon)
    window.addEventListener('orientationchange', onReturn)
    // `pageshow` with `persisted` is a bfcache restore, which is the other way
    // back into a page that has been suspended. The plain fire is a normal
    // load and re-pinning then is free.
    window.addEventListener('pageshow', onReturn)
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onVisible)
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', soon)
      vv.addEventListener('scroll', soon)
    }

    soon()

    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      window.removeEventListener('scroll', soon)
      window.removeEventListener('resize', soon)
      window.removeEventListener('orientationchange', onReturn)
      window.removeEventListener('pageshow', onReturn)
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onVisible)
      if (vv) {
        vv.removeEventListener('resize', soon)
        vv.removeEventListener('scroll', soon)
      }
    }
  }, [ref, slidAway])
}
