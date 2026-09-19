// HAS THE PAGE STOPPED GROWING UNDER THE READER?
//
// WHY THIS EXISTS. `Reveal` decides whether a section is on screen by asking
// where its box is. That answer is only worth anything if the boxes above it
// have finished arriving, and on this hub they very often have not: `WhoToMeet`
// returns `null` until its own query lands, an empty `.reveal-item` is
// `display: none`, and the moment the picks come back 457 pixels appear in the
// middle of the page and shove everything below them down. Measured on the hub
// at 375px, polling every 70ms through a load: that section reports
// `offsetHeight: 0`, then 457, a full second later.
//
// Every section under it was asked "are you on screen" while it was sitting 457
// pixels higher than it belongs, and answered honestly. So they revealed, spent
// their 720ms against nobody, and were then pushed below the fold - finished.
// Scroll down and they are simply there. Ethan: "for mobile there is still no
// real visible animations, the hey Ethan title animates in nicely but the
// latest announcements, today's puzzles and everyone right now doesn't." The
// greeting is the exception because nothing ever moves the top of a page.
//
// WHY IT IS NOT A TIMER FROM MOUNT. That was the first version - four seconds
// and hope - and it is the same shape of guess that Ethan's report is actually
// about: "I think it depends on how long it takes for the page to load." A
// fixed window is right on a fast connection and closes before the data arrives
// on a slow one, which is precisely the difference between the times it worked
// and the times it did not. The honest question is "is the document still
// changing height", and that is measurable.
//
// ONE OBSERVER FOR THE WHOLE PAGE. Thirteen Reveals on the hub asking the same
// question thirteen times is thirteen ResizeObservers on the same element.
//
// ONE-WAY, DELIBERATELY. Once a page has been quiet it stays settled, so
// content that loads later because the reader scrolled to it (the map, at a
// thousand pixels of lead) can never put the page back into a state where a
// reveal could be taken away from somebody who is looking at it.

// No height change for this long and the page is considered to have arrived.
//
// 400ms IS A BUDGET, NOT A GUESS. It is what a section costs the reader when
// everything is already cached and nothing was ever going to move - so it has
// to be short enough to be the price of the page assembling cleanly rather than
// a stutter before it does. It also has to outlast the gap between a query
// resolving and React committing the row it fetched, which is a frame or two.
// Nothing here is the last line of defence: `Reveal`'s own 1,200ms net shows
// the content whatever this says, so the worst case of getting it wrong is a
// page that arrives without its animation, never one that does not arrive.
const QUIET_MS = 400
// And a page that never stops changing - a poll, a ticker, a stray animation on
// a height - must not hold everything for ever.
const CEILING_MS = 6000

let settled = false
let quiet = 0
let ceiling = 0
let ro = null
let lastHeight = -1
const subs = new Set()

function finish() {
  if (settled) return
  settled = true
  stop()
  subs.forEach((fn) => { try { fn(true) } catch { /* a bad listener is not our problem */ } })
}

function stop() {
  clearTimeout(quiet)
  clearTimeout(ceiling)
  quiet = 0
  ceiling = 0
  ro?.disconnect()
  ro = null
}

function bump() {
  if (settled) return
  clearTimeout(quiet)
  quiet = setTimeout(finish, QUIET_MS)
}

function start() {
  if (settled || typeof document === 'undefined') return
  // IDEMPOTENT, AND IT RE-ARMS. Guarding the whole function on "is the observer
  // already there" meant a second caller arriving after the quiet timer had
  // been cleared got neither - an observer with nothing behind it and a page
  // that never settled. Each part checks for itself, and `bump` at the end
  // pushes the quiet window out to the newest arrival, which is right: a
  // section that has only just mounted is a section whose content is still on
  // its way.
  // NO ResizeObserver MUST NOT MEAN "NEVER SETTLES". Everything downstream is
  // more conservative while the page is unsettled, and holding that state for
  // ever on an old browser would be a slow page rather than a wrong one - but
  // it would still be wrong. The timers alone are a fine degradation.
  if (!ro && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      const h = document.documentElement.scrollHeight
      if (h === lastHeight) return
      lastHeight = h
      bump()
    })
    ro.observe(document.documentElement)
  }
  if (!ceiling) ceiling = setTimeout(finish, CEILING_MS)
  bump()
}

/** Has the document stopped changing height? */
export function isPageSettled() { return settled }

/** Subscribe, for useSyncExternalStore. Starts the watch on the first caller. */
export function onPageSettled(fn) {
  subs.add(fn)
  start()
  return () => { subs.delete(fn) }
}

/**
 * Back to "still arriving". A route change is a whole new page of content, and
 * a hub reached from the rooms tab has exactly the same late-arriving sections
 * as one reached by typing the address. AppLayout calls this when the path
 * changes, next to `repairScrollLock` and for the same kind of reason.
 */
export function resetPageSettled() {
  settled = false
  lastHeight = -1
  stop()
  subs.forEach((fn) => { try { fn(false) } catch { /* ignore */ } })
  if (subs.size) start()
}
