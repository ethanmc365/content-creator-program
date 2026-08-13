// Who is around right now.
//
// The platform already has the data: AppLayout beats `touch_last_seen` every
// minute while a tab is open, so `profiles.last_seen_at` is a live-ish signal
// that nothing was reading. This turns it into the one thing a community page
// most needs to convey, which is that other people are here.
//
// FIVE MINUTES, not one. The heartbeat is every 60s and only fires when the tab
// is visible, so a one-minute window would flicker somebody offline every time
// they switched tabs. Five is long enough to be stable and short enough to still
// mean "now".
const ONLINE_MS = 5 * 60 * 1000

export function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_MS
}

/**
 * The same question, asked against a clock the caller controls.
 *
 * A component that re-renders on its own timer needs a pure function of that
 * timer, not one that reads `Date.now()` mid-render - which is both a lint
 * error here and a real source of "the dot changed when something unrelated
 * re-rendered". The admin roster passes its 30s tick.
 */
export function isOnlineAt(lastSeenAt, now) {
  if (!lastSeenAt || !now) return false
  return now - new Date(lastSeenAt).getTime() < ONLINE_MS
}

export function countOnline(people = []) {
  return people.filter((p) => isOnline(p?.last_seen_at)).length
}

// Most recently seen first, never-seen last.
//
// The default order a roster comes back in is whatever the planner felt like,
// which is why "who is here" looked like a random dozen. Sorting by presence is
// what makes the panel worth looking at twice: the faces move, and the ones that
// move are the ones who were just in the room.
export function byRecency(people = []) {
  return people
    .slice()
    .sort((a, b) => {
      const at = a?.last_seen_at ? new Date(a.last_seen_at).getTime() : 0
      const bt = b?.last_seen_at ? new Date(b.last_seen_at).getTime() : 0
      if (at !== bt) return bt - at
      return (a?.name || '').localeCompare(b?.name || '')
    })
}

// How many items to show so the last row of a grid is not a gap-toothed
// fragment: the largest multiple of `perRow` that fits, capped, and never fewer
// than one row's worth if we have that many.
export function fillRows(total, perRow, max) {
  const capped = Math.min(total, max)
  if (capped <= perRow) return capped
  return Math.floor(capped / perRow) * perRow
}

// "Active now" / "Active 2h ago" / null when we have never seen them.
export function presenceLabel(lastSeenAt) {
  if (!lastSeenAt) return null
  const mins = Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 60000)
  if (mins < 5) return 'Active now'
  if (mins < 60) return `Active ${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Active ${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days === 1 ? 'Active yesterday' : `Active ${days}d ago`
}

// ---------------------------------------------------------------- the beat
//
// WHAT WAS WRONG WITH THE OLD HEARTBEAT, AND WHY IT MATTERED.
//
// It was a bare `setInterval(beat, 60000)` in AppLayout with a
// `visibilityState === 'visible'` guard, and it under-reported in three ways
// that all pushed the same direction - somebody looks less present than they
// are, which is exactly the complaint about the admin roster:
//
//   1. BROWSERS THROTTLE TIMERS. A tab that has been open a while, on battery,
//      or in a background window gets its intervals stretched to a minute or
//      more - and Safari can suspend them entirely. The guard then hides the
//      damage: the beat is skipped, nothing corrects it, and the person reads
//      as five minutes gone while they are looking at the screen.
//   2. NOTHING BEAT ON RE-ENTRY. `visibilitychange` fires when a tab is
//      switched, but not when a whole browser window regains focus behind an
//      already-visible tab, which is the common desktop case.
//   3. LEAVING WAS NEVER RECORDED. Close the tab 59 seconds after a beat and
//      `last_seen_at` is a minute stale forever. On a page that reports "last
//      active", every reading was up to a minute early for no reason.
//
// So: a beat on a timer, on focus, on visibility, and on the first interaction
// after a quiet period - all funnelled through one throttle so ten of those
// firing at once is still one request. And a final beat on the way out, sent
// with `keepalive` so the browser is obliged to deliver it after the page is
// gone (a normal fetch is cancelled on unload, which is why this needs the REST
// endpoint directly rather than the supabase client).
const BEAT_MS = 45000        // under the 60s the browser will throttle towards
const MIN_GAP_MS = 20000     // never more than one write per 20 seconds

/**
 * Start the presence heartbeat. Returns a stop function.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 */
export function startHeartbeat(client) {
  if (typeof window === 'undefined') return () => {}
  let stopped = false
  let lastAt = 0

  const beat = (force = false) => {
    if (stopped) return
    if (!force && document.visibilityState !== 'visible') return
    const now = Date.now()
    if (now - lastAt < MIN_GAP_MS) return
    lastAt = now
    client.rpc('touch_last_seen').then(() => {}, () => {})
  }

  // The parting beat. `keepalive` is the whole point: it tells the browser to
  // finish this request even though the document is being torn down. The
  // supabase client cannot set it, so this is the REST call by hand.
  const finalBeat = async () => {
    if (stopped) return
    try {
      const { data } = await client.auth.getSession()
      const token = data?.session?.access_token
      const url = import.meta.env.VITE_SUPABASE_URL
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY
      if (!token || !url || !key) return
      fetch(`${url}/rest/v1/rpc/touch_last_seen`, {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: key,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }).catch(() => {})
    } catch { /* signed out mid-unload */ }
  }

  const onVisible = () => { if (document.visibilityState === 'visible') beat(); else finalBeat() }
  // Interaction is the backstop for a throttled timer. Throttled by MIN_GAP_MS,
  // so a person typing is not a person writing three requests a second.
  const onInteract = () => beat()

  beat(true)
  const iv = setInterval(beat, BEAT_MS)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onInteract)
  window.addEventListener('pointerdown', onInteract, { passive: true })
  window.addEventListener('keydown', onInteract)
  // `pagehide` and not `beforeunload`: iOS Safari fires pagehide reliably and
  // beforeunload barely at all, and pagehide also covers the back/forward cache.
  window.addEventListener('pagehide', finalBeat)

  return () => {
    stopped = true
    clearInterval(iv)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onInteract)
    window.removeEventListener('pointerdown', onInteract)
    window.removeEventListener('keydown', onInteract)
    window.removeEventListener('pagehide', finalBeat)
  }
}
