// WHEN A SPENT TRACKPAD SWIPE IS OVER, so the next one can be counted.
//
// The calendar turns one month per two-finger swipe: the horizontal `wheel`
// deltas are summed, the month turns once past a threshold, and the gesture is
// then SPENT so the momentum tail cannot turn it again. The only hard part is
// deciding when the spent gesture has finished, and it has now been got wrong
// in both directions, which is what this file is a record of.
//
// FIRST, IT NEVER RELEASED (28 Sep 2026). Ethan: "it only moves one page, but
// whenever I do it and try to do it again, it doesn't work. It's only when I
// move my mouse that I can then do it a second time."
//
// The release was a QUIET GAP alone - 240ms with no horizontal wheel event.
// macOS keeps firing momentum events for up to a second after the fingers lift,
// and each one refreshed the "last seen" clock even though the handler returned
// early, so the gap never opened. Moving the mouse appeared to fix it only
// because it meant waiting for the tail to die.
//
// THEN IT RELEASED FOUR TIMES A SWIPE (28 Sep 2026, later). Ethan: "the
// two-finger swipe now does the same thing where it scrolls through 4 months
// and is really laggy. I want to properly fix that so that when I scroll 2
// months, it only scrolls 1 month at a time, but I don't have to move my mouse
// between it."
//
// The second door was "momentum only ever decays, so a delta BIGGER THAN THE
// ONE BEFORE IT is fingers back on the glass". The premise is true and the test
// was wrong, because it compared against the previous event rather than against
// the gesture. A real swipe RAMPS UP: the first events of one flick climb from
// 2 to 9 to 30 to 70. Every one of those is bigger than the one before it, so a
// single swipe released itself three or four times while the finger was still
// moving, and each release let the accumulator fill again. Four months.
//
// THE FIX IS TO WAIT FOR THE DECAY BEFORE BELIEVING A RISE. A gesture remembers
// its PEAK, and a rise only counts once the deltas have fallen well below that
// peak - which is something the acceleration of a swipe never does, and which
// every momentum tail does within a few events. So:
//
//   * ramping up (2 -> 9 -> 30 -> 70): never released, because nothing has
//     decayed yet. One month, which is what a swipe should be.
//   * tail (70 -> 40 -> 18 -> 6 -> 2): decayed, but each is smaller than the
//     last, so nothing is released either.
//   * tail, then fingers again (… 6 -> 2 -> 40): decayed AND rising. Released
//     at once, with no mouse move and no waiting.
//
// The quiet gap stays as the other door, for a swipe that follows a tail that
// has already died.

/** The floor a rise has to clear, so a wobble near zero is not a new swipe. */
const MIN_RISE = 3
/** How far below its peak a gesture must fall before a rise means anything. */
const DECAYED_AT = 0.25
/** How much bigger than the last event a rise has to be. */
const RISE_FACTOR = 1.25

/**
 * Note this event against the gesture, tracking the peak and whether the
 * deltas have decayed away from it. Call AFTER `releasesGesture`, once the
 * decision for this event has been taken.
 *
 * @param g   the gesture record: { last, mag, peak, decayed }
 * @param mag |deltaX| of the event now arriving
 * @param now a monotonic clock reading (performance.now())
 */
export function noteWheel(g, mag, now) {
  g.last = now
  g.mag = mag
  g.peak = Math.max(g.peak || 0, mag)
  if (mag < g.peak * DECAYED_AT) g.decayed = true
}

/** Start the gesture over. The month it turned, if any, is already turned. */
export function resetGesture(g) {
  g.sum = 0
  g.spent = false
  g.mag = 0
  g.peak = 0
  g.decayed = false
}

/**
 * Should this wheel event start a fresh gesture?
 *
 * @param g    the gesture record: { spent, last, mag, peak, decayed }
 * @param mag  |deltaX| of the event now arriving
 * @param now  a monotonic clock reading (performance.now())
 * @param gap  how long the wheel must be silent to count as a new gesture
 */
export function releasesGesture(g, mag, now, gap = 240) {
  // The tail died and a new swipe followed it.
  if (now - g.last > gap) return true
  // Still inside the tail. A rise is only a new swipe once this gesture has
  // decayed away from its own peak - see the note above, where believing a
  // rise too early turned one swipe into four months.
  return !!g.spent && !!g.decayed && mag > Math.max(g.mag * RISE_FACTOR, MIN_RISE)
}
