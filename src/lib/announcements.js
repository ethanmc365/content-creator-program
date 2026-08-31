// Which announcements the hub shows, and for how long.
//
// The hub used to carry exactly one: the newest message in the WORLDWIDE
// announcements room. A creator in the UK and Spain therefore never saw either
// market's announcements anywhere except by opening that market's room, which
// is the opposite of what a hub is for. And it had no expiry, so a quiet month
// left "Latest announcement" showing something from six weeks ago as though it
// were news.
//
// So: the newest announcement from EVERY room the creator can read, one per
// room, and nothing older than the cutoff. RLS already decides which rooms
// those are - see migration 149 - so this never has to know about markets.

export const ANNOUNCEMENT_MAX_AGE_DAYS = 15

/**
 * @param rows    messages from the announcements channel, any order
 * @param now     ms timestamp to measure age against
 * @param maxAgeDays  older than this and it is not news any more
 * @returns newest-first, at most one per community
 */
export function recentAnnouncements(rows, { now = 0, maxAgeDays = ANNOUNCEMENT_MAX_AGE_DAYS } = {}) {
  const cutoff = now - maxAgeDays * 24 * 60 * 60 * 1000
  const byCommunity = new Map()

  for (const r of rows || []) {
    if (!r || r.deleted) continue
    const at = new Date(r.created_at).getTime()
    // An unparseable date is not evidence of anything; leaving it in would let
    // one bad row sit at the top of the hub forever.
    if (!Number.isFinite(at) || at < cutoff) continue
    // `null` is a legitimate key here: the 30 legacy rows backfilled in
    // migration 149 aside, a room with no community is the worldwide one.
    const key = r.community_id ?? 'worldwide'
    const held = byCommunity.get(key)
    if (!held || at > new Date(held.created_at).getTime()) byCommunity.set(key, r)
  }

  return [...byCommunity.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}
