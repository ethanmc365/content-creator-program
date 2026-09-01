import { useCallback } from 'react'

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

// `useOpenOnGame` WAS HERE AND IS DELETED (1 Sep 2026).
//
// It scrolled a game's card to the top of the viewport when the game opened,
// and it was the reason Guess the language opened part way down its own page:
// Game.jsx ALREADY scrolls the window to zero on every screen change, and when
// a game is up the menu is unmounted, so zero IS the top of the game. The hook
// ran two frames later with a 300ms smooth animation, landed past the page
// heading and the round header, and then fought the leaderboards loading in
// underneath it. Measured at 375px it left the round header 332px off the top
// of the screen. Two mechanisms placing the same page is one too many, and the
// one that needs no measurement is the one that cannot be wrong. Do not bring
// it back: put the scroll in the page that owns the screen.

/**
 * Keep `ref` above the keyboard.
 *
 * Returns a function to call whenever the thing should be brought back into
 * view - on focus, and after every guess. It measures against
 * `window.visualViewport` where there is one, which is the only way to know
 * where the keyboard's top edge actually is; without one it falls back to
 * `scrollIntoView`, which is right on a desktop where nothing is covering
 * anything.
 *
 * THREE THINGS WERE WRONG WITH THE FIRST VERSION, AND ALL THREE WERE REPORTED.
 *
 *   IT ONLY LOOKED TWICE, AT 120ms AND 420ms. Ethan: "if I scroll down a bit so
 *   the text bar is at the bottom and then I click on it, it's actually covered
 *   by the keyboard - so the keyboard thing is working relative to where it was
 *   when I clicked it and not automatically doing it no matter where I click
 *   it." That is exactly what two fixed samples buy you: iOS reports the OLD
 *   visual viewport height for a while after the keyboard starts moving, and
 *   how long depends on where the page was and how fast the animation ran. So
 *   this now also listens to `visualViewport` resize and scroll for a second
 *   after the trigger and corrects on every one of them. The keyboard telling
 *   us it has moved is a better signal than a guess about when it will have.
 *
 *   IT RESERVED THE HOME INDICATOR ON EVERY DEVICE. The 34px inset is real in
 *   an INSTALLED app and is nothing at all in a browser tab, where Safari's own
 *   chrome is already outside the visual viewport. Adding it unconditionally
 *   put a permanent 34px of dead air between the button and the keys. Ethan:
 *   "there's still space where it should be closer to the guess button, with
 *   just a few millimetres." It is now only added in standalone display mode.
 *
 *   SMOOTH SCROLLING FOUGHT THE KEYBOARD. A smooth scroll takes a few hundred
 *   milliseconds, which is the same window the keyboard is animating in, so a
 *   correction issued at 120ms was still running when the 420ms one started and
 *   the second one cancelled the first. Only the FIRST correction is smooth;
 *   every later one is instant, because by then it is a nudge rather than a
 *   journey.
 */
export function useKeepAboveKeyboard(ref) {
  return useCallback(() => {
    const el = ref.current
    if (!el) return

    // An installed app has the home indicator inside the visual viewport; a
    // browser tab does not. Reserving it in a tab is 34px of dead space.
    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
      || window.navigator?.standalone === true
    const GAP = 12
    const INSET = standalone ? 34 : 0

    let first = true
    const run = () => {
      const node = ref.current
      if (!node) return
      const vv = window.visualViewport
      const behavior = first ? 'smooth' : 'auto'
      first = false
      if (!vv) { node.scrollIntoView({ behavior, block: 'center' }); return }
      const box = node.getBoundingClientRect()
      // Where the visible area ends, in the same coordinates as the rect.
      const visibleBottom = vv.height + vv.offsetTop
      const overshoot = box.bottom + GAP + INSET - visibleBottom
      // A pixel or two either way is the browser rounding, not a problem to
      // fix - correcting those would make the page twitch on every event.
      if (overshoot > 2) window.scrollBy({ top: overshoot, behavior })
      // And if it has been pushed off the TOP - which happens when the keyboard
      // is tall and the field is near the head of the card - bring it back.
      else if (box.top < vv.offsetTop + GAP - 2) {
        window.scrollBy({ top: box.top - vv.offsetTop - GAP, behavior })
      }
    }

    // The timed passes still exist: a browser with no visualViewport events
    // (and every desktop) gets nothing from the listener below.
    setTimeout(run, 120)
    setTimeout(run, 420)

    const vv = window.visualViewport
    if (!vv) return
    // AND THEN FOLLOW THE KEYBOARD. Every resize while it opens is a fresh,
    // truthful measurement, which is what makes this work from anywhere on the
    // page rather than only from where it happened to be tested.
    vv.addEventListener('resize', run)
    vv.addEventListener('scroll', run)
    setTimeout(() => {
      vv.removeEventListener('resize', run)
      vv.removeEventListener('scroll', run)
    }, 1400)
  }, [ref])
}

/**
 * Put `ref`'s TOP just under the top of the visible area.
 *
 * Ethan, on Guess the Country: "when I type in the country and click guess, it
 * should automatically move up so that I can see all my guesses, because
 * currently the top part of the game is cut off and I can't see my previous
 * guesses or the description, time, etc."
 *
 * `useKeepAboveKeyboard` answers the opposite question - it pins the BOTTOM of
 * the form above the keys - and once a card is taller than the space left over,
 * satisfying it necessarily pushes the card's head off the top. So a guess now
 * does both, in order: this one puts the card's top on screen, and the keyboard
 * helper only corrects afterwards if the field has ended up underneath the
 * keys. On a card that fits, the second is a no-op.
 */
export function useScrollCardIntoView(ref) {
  return useCallback(() => {
    const node = ref.current
    if (!node) return
    const vv = window.visualViewport
    const top = vv ? vv.offsetTop : 0
    const box = node.getBoundingClientRect()
    const delta = box.top - top - 8
    if (Math.abs(delta) > 2) window.scrollBy({ top: delta, behavior: 'smooth' })
  }, [ref])
}
