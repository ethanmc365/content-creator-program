import { createContext, useContext } from 'react'

// ONE CLOCK FOR A CARD AND EVERYTHING INSIDE IT (19 Sep 2026).
//
// THE BUG. Ethan, on the worldwide page: "most of the time they don't seem to
// work... sometimes it shows the numbers counting up in the animated format,
// other times it shows 0 and counts up a few seconds later, and other times the
// numbers just immediately show."
//
// Three different outcomes from one page, and they are three different orderings
// of three timers that had nothing to do with each other:
//
//   1. `Reveal`'s IntersectionObserver, which decides when the CARD arrives.
//   2. `CountUp`'s own `useInView`, which decided when the NUMBER started - and
//      with a NEGATIVE root margin, so it fired at a different moment from the
//      card's, on the same element.
//   3. The query. The hub's four statistics come from two requests, and the
//      strip renders an em-dash until the slower one lands.
//
// Whichever order those three happen to fall in is what the reader gets:
//
//   number before card   the count runs behind an opacity-0 card and is over
//                        before the card fades in. "The numbers just
//                        immediately show."
//   card before number   the card arrives, the data lands a beat later, and the
//                        count starts against a card that has been still for a
//                        second. "It shows 0 and counts up a few seconds later."
//   the lucky order      what it was supposed to look like, every so often.
//
// An IntersectionObserver is the wrong instrument for the second timer anyway:
// it answers "is this element's box in the viewport", and the question a counter
// is actually asking is "has the card I live on begun to arrive". The card knows
// that; nothing else does.
//
// So `Reveal` publishes it, and anything with its own motion inside a Reveal
// reads it here instead of observing itself. `delayMs` is the card's own place
// in the page's arrival ladder, so a counter on the third section starts when
// the third section starts rather than when the first one did.
//
// `null` means "not inside a Reveal", which is a real case (a counter on a page
// that does not use the component) and must keep working - see `CountUp`.
export const RevealContext = createContext(null)

/** `{ revealed, delayMs }` for the nearest enclosing Reveal, or null. */
export function useRevealed() {
  return useContext(RevealContext)
}
