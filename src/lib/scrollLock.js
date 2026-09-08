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
    //
    // AND `behavior: 'instant'`, WHICH IS THE WHOLE FIX FOR A SECOND BUG.
    //
    // THE BUG: "whenever I click on the link button and then add a link, or
    // click cancel, it makes me have to go and scroll down the page again."
    // Measured on the challenge form: scrolled to 2180px, open the link dialog,
    // press cancel, and the page is at 0.
    //
    // `html { scroll-behavior: smooth }` is set globally in index.css, and it
    // applies to `window.scrollTo(x, y)` as much as to an anchor jump. So this
    // line was not restoring the offset, it was starting a 2000px ANIMATION
    // towards it - from a document that had, one line earlier, stopped being
    // `position: fixed` and was therefore mid-relayout. The animation is
    // cancelled by the layout, or by the next scroll event, or by focus moving
    // back into the page, and what is left is a page at the top.
    //
    // A restore is not a scroll. It is putting back the number that was already
    // there, and the reader should never see it happen. The two-argument form
    // has no way to say that; the options form does.
    window.scrollTo({ top: saved.y, left: 0, behavior: 'instant' })
    saved = null
  }
}

/**
 * IF NOBODY IS HOLDING THE PAGE, THE PAGE MUST NOT BE HELD.
 *
 * `lockScroll` takes the body out of flow entirely - `position: fixed`,
 * `overflow: hidden`, `top: -<scroll>px` - because that is the only thing iOS
 * Safari honours. The cost of that technique is that a LEAKED lock is not a
 * subtle bug: the document stops scrolling, the visible region is a slice of a
 * page shifted up by however far it had been scrolled, and everything past the
 * fold is unreachable. Ethan, 8 Sep 2026, on a phone: "it just showed up like a
 * white screen on half of it - I could scroll, but all the stuff below that
 * screen was just covered."
 *
 * A lock leaks whenever a release does not run: an overlay whose component
 * throws during render, a cleanup skipped because the tree was torn down by an
 * error boundary, a fast route change that unmounts a dialog mid-transition.
 * Every one of those is rare and none of them is impossible, and the failure
 * they produce looks like the app is broken rather than like a dialog is open.
 *
 * So this is the audit, not another lock: `depth` is the count of live holders,
 * and if it is zero then no overlay believes it has frozen anything, so any
 * frozen styles still on the body are debris. AppLayout runs it on every route
 * change, which is both the commonest moment for a leak to happen and the
 * moment a reader is most likely to notice one.
 *
 * IT DOES NOTHING WHEN A LOCK IS GENUINELY HELD. A modal open across a route
 * change is a real thing (the invoice sheet, the confirm dialog), and unfreezing
 * under it would scroll the page behind an open overlay - which is the bug this
 * file was written to fix.
 */
export function repairScrollLock() {
  if (typeof document === 'undefined') return false
  if (depth > 0) return false
  const body = document.body
  if (body.style.position !== 'fixed') return false

  // The offset is recoverable from the style the leak left behind: `top` is
  // `-<scrollY>px`, so somebody who was 1,200px down a page comes back to
  // 1,200px rather than to the top of it.
  const y = Math.abs(parseInt(body.style.top || '0', 10)) || 0
  body.style.overflow = ''
  body.style.position = ''
  body.style.top = ''
  body.style.left = ''
  body.style.right = ''
  body.style.width = ''
  saved = null
  window.scrollTo({ top: y, left: 0, behavior: 'instant' })
  return true
}
