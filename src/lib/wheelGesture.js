// WHEN A SPENT TRACKPAD SWIPE IS OVER, so the next one can be counted.
//
// The calendar turns one month per two-finger swipe: the horizontal `wheel`
// deltas are summed, the month turns once past a threshold, and the gesture is
// then SPENT so the momentum tail cannot turn it again. The only hard part is
// deciding when the spent gesture has finished, and getting it wrong is what
// produced this (28 Sep 2026), from Ethan:
//
//   "it only moves one page, but whenever I do it and try to do it again, it
//    doesn't work. It's only when I move my mouse that I can then do it a
//    second time."
//
// It was released by a QUIET GAP alone - 240ms with no horizontal wheel event.
// macOS keeps firing momentum events for up to a second after the fingers lift,
// and each one refreshed the "last seen" clock even though the handler returned
// early, so the gap never opened and the next swipe was swallowed. Moving the
// mouse appeared to fix it only because it meant waiting long enough for the
// tail to die.
//
// So there are two doors now, and the second one is what makes a second swipe
// land immediately: MOMENTUM ONLY EVER DECAYS. A delta clearly bigger than the
// one before it cannot be the tail of the last flick, so it is fingers back on
// the glass.

/**
 * Should this wheel event start a fresh gesture?
 *
 * @param g    the gesture record: { spent, last, mag }
 * @param mag  |deltaX| of the event now arriving
 * @param now  a monotonic clock reading (performance.now())
 * @param gap  how long the wheel must be silent to count as a new gesture
 */
export function releasesGesture(g, mag, now, gap = 240) {
  // The tail died and a new swipe followed it.
  if (now - g.last > gap) return true
  // Still inside the tail, but this push is bigger than the last one. The 1.25
  // keeps a decaying tail from ever qualifying; the floor of 3 keeps a wobble
  // near zero (where a 25% rise is a fraction of a pixel) from qualifying
  // either.
  return g.spent && mag > Math.max(g.mag * 1.25, 3)
}
