// "THE APP IS BACK" - ONE DEFINITION FOR EVERYTHING THAT HAS TO RE-SYNC.
//
// A realtime socket does not survive a phone locking, an installed app being
// swapped out, or a laptop lid closing. It reconnects, but anything that
// happened while it was down is simply never delivered - so a room read on the
// phone kept its dot on the laptop, and a dot cleared on the laptop came back
// on the phone, until a full reload. Ethan: "everything doesn't seem to be
// syncing correctly."
//
// Every live counter (room dots, the bell, the DM badge) re-reads on the
// events that mean "you are looking at this again": the tab becoming visible,
// a page restored from the back/forward cache, the window regaining focus, and
// the network coming back. They tend to arrive together, so the callback is
// debounced and never fires twice within `gap` milliseconds.

export function onResume(cb, { gap = 1500 } = {}) {
  if (typeof window === 'undefined') return () => {}
  let last = 0
  let timer = null
  const fire = () => {
    if (document.visibilityState === 'hidden') return
    const now = Date.now()
    if (now - last < gap) return
    clearTimeout(timer)
    timer = setTimeout(() => { last = Date.now(); cb() }, 120)
  }
  const onVis = () => { if (document.visibilityState === 'visible') fire() }
  const onShow = (e) => { if (e.persisted) fire() }
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('pageshow', onShow)
  window.addEventListener('focus', fire)
  window.addEventListener('online', fire)
  return () => {
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('pageshow', onShow)
    window.removeEventListener('focus', fire)
    window.removeEventListener('online', fire)
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
