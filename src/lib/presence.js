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
