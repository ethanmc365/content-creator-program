import { useCallback } from 'react'
import { keyboardInset } from './keyboardFollow'

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

// `useKeepAboveKeyboard` WAS HERE AND IS DELETED TOO (2 Sep 2026).
//
// It is `lib/keyboardFollow` now, installed once from AppLayout, because the
// problem was never a games problem: the schedule dialog's date and time, a
// poll's options and a game challenge's title were all reported with the same
// symptom in the same week. One field being kept above the keyboard is a
// property of the app.
//
// AND HAVING BOTH WAS ITSELF A FAULT. Two mechanisms scrolling the same page is
// one too many - the rule this file already learnt from `useOpenOnGame` above.
// The hook's first correction was a SMOOTH `window.scrollBy`, issued while the
// keyboard was still animating and while the global watcher was making its own
// instant one; the two raced, and Ethan reported the result exactly: "it kind
// of glitchy scrolls down a bit as I'm typing, which is weird." The surviving
// mechanism measures against the visual viewport and moves instantly.

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
    // ONLY WHEN A KEYBOARD IS ACTUALLY COVERING SOMETHING (2 Sep 2026).
    //
    // This exists because a phone's keyboard eats the top of the card. On a
    // desktop nothing is covered, the card's head is already on screen, and
    // "put the card's top just under the top of the visible area" therefore
    // means "scroll the page DOWN past the puzzle heading" - on every wrong
    // guess. Ethan: "on desktop it should always be scrolled up to the very
    // top... after I type a word and press guess it's moving down a bit. It
    // should never do that."
    //
    // The page is where the reader left it unless a keyboard made that
    // impossible. Same test `lib/keyboardFollow` uses, so the two cannot
    // disagree about whether a keyboard is up.
    if (keyboardInset() === 0) return
    const vv = window.visualViewport
    const top = vv ? vv.offsetTop : 0
    const box = node.getBoundingClientRect()
    const delta = box.top - top - 8
    // INSTANT, for the same reason keyboardFollow is: this fires on a guess,
    // and a guess re-focuses the field, so a smooth scroll here would still be
    // running when the keyboard watcher makes its own correction. The two
    // fighting is what "glitchy" was.
    if (Math.abs(delta) > 2) window.scrollBy({ top: delta, left: 0, behavior: 'instant' })
  }, [ref])
}
