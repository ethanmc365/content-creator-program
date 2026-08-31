import { useCallback, useEffect, useRef } from 'react'

// KEEPING A GAME'S PLAYABLE PART ON THE SCREEN.
//
// Two complaints, one cause. The games are cards in the normal flow of a long
// page - the streak card, today's three puzzles and four practice modes are all
// above them - so:
//
//   * pressing Play left the puzzle below the fold. Ethan: "a daily puzzle
//     should open centred on the puzzle, no scrolling first."
//   * with the keyboard up, the guess field could sit behind the keys, and
//     after each wrong guess the list of past guesses grew and pushed it
//     further down. Ethan: "the guess bar should sit just above the keyboard
//     (allow for the home-screen app inset), and re-centre after each guess."
//
// `scrollIntoView` alone is not enough for the second one: it centres inside
// the LAYOUT viewport, which on a phone still includes the strip the keyboard
// is covering. The visual viewport is the part you can actually see, so that is
// what these measure against.

/**
 * Scroll `ref` to the top of the visible area once, when `when` becomes true.
 * Used to open a game on the game rather than on the page it lives in.
 */
export function useOpenOnGame(ref, when = true) {
  const doneRef = useRef(false)
  useEffect(() => {
    if (!when || doneRef.current) return undefined
    const el = ref.current
    if (!el) return undefined
    doneRef.current = true
    // A frame, so the card has been laid out and its top is where it will
    // stay. Two, because the first is often the same frame React committed on.
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [ref, when])
}

/**
 * Keep `ref` above the keyboard.
 *
 * Returns a function to call whenever the thing should be brought back into
 * view - on focus, and after every guess. It measures against
 * `window.visualViewport` where there is one, which is the only way to know
 * where the keyboard's top edge actually is; without one it falls back to
 * `scrollIntoView`, which is right on a desktop where nothing is covering
 * anything.
 */
export function useKeepAboveKeyboard(ref) {
  return useCallback(() => {
    const el = ref.current
    if (!el) return
    // Let the keyboard finish animating and the layout finish settling. Two
    // passes rather than one: the first catches the common case, the second
    // catches iOS, which reports the old viewport height for a beat after the
    // keyboard has started moving.
    const run = () => {
      const node = ref.current
      if (!node) return
      const vv = window.visualViewport
      if (!vv) { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
      const box = node.getBoundingClientRect()
      // Where the visible area ends, in the same coordinates as the rect.
      const visibleBottom = vv.height + vv.offsetTop
      // A little air under it, plus the home indicator's strip on an installed
      // app - `env()` is not readable from JS, so this is the 34px iOS uses.
      const GAP = 16
      const INSET = 34
      const overshoot = box.bottom + GAP + INSET - visibleBottom
      if (overshoot > 0) window.scrollBy({ top: overshoot, behavior: 'smooth' })
      // And if it has been pushed off the TOP - which happens when the keyboard
      // is tall and the field is near the head of the card - bring it back.
      else if (box.top < vv.offsetTop + GAP) {
        window.scrollBy({ top: box.top - vv.offsetTop - GAP, behavior: 'smooth' })
      }
    }
    setTimeout(run, 120)
    setTimeout(run, 420)
  }, [ref])
}
