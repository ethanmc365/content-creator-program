// "THE APP IS BACK" - ONE DEFINITION FOR EVERYTHING THAT HAS TO RE-SYNC.
//
// A realtime socket does not survive a phone locking, an installed app being swapped out, or a laptop lid closing. It
// reconnects, but anything that happened while it was down is simply never delivered - so a room read on the phone kept
// its dot on the laptop, and a dot cleared on the laptop came back on the phone, until a full reload.
//
// Every live counter (room dots, the bell, the DM badge) re-reads on the
// events that mean "you are looking at this again": the tab becoming visible,
// a page restored from the back/forward cache, the window regaining focus, and
// the network coming back. They tend to arrive together, so the callback is
// debounced and never fires twice within `gap` milliseconds.

// AWAY LONG ENOUGH TO HAVE MISSED SOMETHING. Focus and visibility also come back after a photo picker, a share sheet,
// a permission prompt or a two-second glance at another app, and every one of those used to re-read the bell, the room
// dots, the DM badge, the agreements and the live boards at once (21 Oct: a burst of requests and a stutter on every
// return, worst on weak wifi). A socket that slept a few seconds has missed nothing worth that, so focus/visible only
// count after `minAway` ms away. Coming back ONLINE and a page restored from the back/forward cache always count.
// null = unknown (treated as away), false = here, a number = left at that time.
let awaySince = null
if (typeof window !== 'undefined') {
  const leave = () => { if (typeof awaySince !== 'number') awaySince = Date.now() }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave() })
  window.addEventListener('blur', leave)
  window.addEventListener('offline', leave)
}
// Marked "here" a moment later, once the visible/focus pair that brought the app back have both been judged by the
// same time away.
let backTimer = null
const back = () => {
  if (typeof awaySince !== 'number' || backTimer) return
  backTimer = setTimeout(() => { backTimer = null; awaySince = false }, 1000)
}
/** For tests: pretend the app went away `ms` ago (null = never left). */
export function _setAwaySince(t) { clearTimeout(backTimer); backTimer = null; awaySince = t }

export function onResume(cb, { gap = 1500, minAway = 20000 } = {}) {
  if (typeof window === 'undefined') return () => {}
  let last = 0
  let timer = null
  const fire = (always) => {
    if (document.visibilityState === 'hidden') return
    const now = Date.now()
    // Unknown (the app never saw itself leave) counts as away, so nothing that used to refresh can be starved.
    const awayFor = awaySince === null ? Infinity : awaySince === false ? 0 : now - awaySince
    back()
    if (!always && awayFor < minAway) return
    if (now - last < gap) return
    clearTimeout(timer)
    timer = setTimeout(() => { last = Date.now(); cb() }, 120)
  }
  const onVis = () => { if (document.visibilityState === 'visible') fire(false) }
  const onShow = (e) => { if (e.persisted) fire(true) }
  const onFocus = () => fire(false)
  const onOnline = () => fire(true)
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('pageshow', onShow)
  window.addEventListener('focus', onFocus)
  window.addEventListener('online', onOnline)
  return () => {
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('pageshow', onShow)
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('online', onOnline)
  }
}

// The later of two timestamps (ISO strings or Dates), as an ISO string. A
// watermark only ever moves forward: a stale device or a late realtime echo
// must not drag it back.
export function laterOf(a, b) {
  if (!a) return b ? new Date(b).toISOString() : null
  if (!b) return new Date(a).toISOString()
  return new Date(a) >= new Date(b) ? new Date(a).toISOString() : new Date(b).toISOString()
}
