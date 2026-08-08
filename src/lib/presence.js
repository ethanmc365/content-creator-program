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
