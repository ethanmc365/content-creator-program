// HOLD THE PAGE STILL WHILE SOMETHING IS OPEN ON TOP OF IT.
//
// THE BUG. Scrolling inside the streak leaderboard scrolled the games page
// behind it. Ethan: "I've tried scrolling on it, it's moving the actual games
// page behind it, which shouldn't happen unless I'm scrolling outside of the
// card. And I've noticed that happened on a few other places across the
// platform too."
//
// It was two separate faults that look identical from the outside.
//
// ONE: `document.body.style.overflow = 'hidden'` DOES NOT LOCK iOS SAFARI.
// It stops the document scrolling on every desktop browser and on Android, and
// on iOS it is simply ignored for touch scrolling - the page keeps moving under
// your finger. The fix that does work is taking the body out of flow entirely
// (`position: fixed`) and holding the scroll offset in `top`, then putting it
// back on release. That is what this file does, and the reason it has to
// restore `window.scrollTo` afterwards: a fixed body has scrolled itself to the
// top, so releasing it without that lands the reader back at the top of a page
// they were halfway down.
//
// TWO: SCROLL CHAINING, which is a different thing and needs a different fix.
// Once a scrollable panel INSIDE the overlay hits its own end, the browser hands
// the remaining scroll to whatever is underneath it. That is standard behaviour
// and it is wrong here, and no amount of locking the body fixes it because the
// gesture never belonged to the body. It is turned off in CSS with
// `overscroll-behavior: contain` on the panel itself - see the `overscroll-contain`
// class on Modal's card.
//
// COUNTED, BECAUSE OVERLAYS NEST. Reporting a message opens a dialog from inside
// the chat overlay; a confirm can open over a modal. Two locks and one release
// used to mean the page stayed frozen after the top one closed, so the release
// only fires when the last holder lets go, and the offset stored is the one the
// FIRST holder saw.

let depth = 0
let saved = null

/** Freeze the page. Returns the function that releases it. Safe to nest. */
export function lockScroll() {
  if (typeof document === 'undefined') return () => {}
  const body = document.body

  if (depth === 0) {
    const y = window.scrollY || window.pageYOffset || 0
    saved = {
      y,
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    }
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${y}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
  }
  depth += 1

  let released = false
  return function release() {
    // Guarded: React 18 in StrictMode runs an effect's cleanup twice in
    // development, and a double release would drop the count below zero and
    // unfreeze the page while a second overlay was still open.
    if (released) return
    released = true
    depth = Math.max(0, depth - 1)
    if (depth > 0 || !saved) return
    body.style.overflow = saved.overflow
    body.style.position = saved.position
    body.style.top = saved.top
    body.style.left = saved.left
    body.style.right = saved.right
    body.style.width = saved.width
    // Only AFTER the styles are back, or the browser has nowhere to scroll to.
    window.scrollTo(0, saved.y)
    saved = null
  }
}
