// POSTING STREAKS ON A CHALLENGE (28 Sep 2026).
//
// Ethan: "a visible posting streak that appears on the challenge page to try
// and increase participation ... whenever someone has posted, let's say every
// week, their streak should go up ... that's like any time within seven days."
//
// A streak is counted in WEEKS, and a week is a rolling seven days counted back
// from now: this week is the last 7 days, last week the 7 before that, and so
// on. The streak is how many of those weeks in a row have at least one entry.
//
// THIS WEEK IS ALLOWED TO BE EMPTY. On a Monday nobody has posted "this week"
// yet, and a streak that dropped to nothing every morning until you posted
// would be a punishment rather than a reward. So an empty current week does not
// break the run; it only means the run is waiting (`live: false`), which the
// flame shows as an ember. Two empty weeks, the current one and the one before,
// and the run is over.
//
// Weeks before the challenge opened do not count: a streak here is about THIS
// challenge.

const WEEK = 7 * 24 * 3600 * 1000

/**
 * @param {number[]} times   entry times, ms
 * @param {number} now       ms
 * @param {number|null} startMs  the challenge's opening, ms (weeks before it don't count)
 * @returns {{ weeks: number, live: boolean }}
 */
export function postingStreak(times, now, startMs = null) {
  if (!times?.length) return { weeks: 0, live: false }
  const weekOf = (t) => Math.floor((now - t) / WEEK) // 0 = the last 7 days
  const posted = new Set(times.filter((t) => t <= now && (startMs == null || t >= startMs)).map(weekOf))
  if (!posted.size) return { weeks: 0, live: false }
  const live = posted.has(0)
  let k = live ? 0 : 1
  let weeks = 0
  // The oldest week that can count is the one the challenge opened in.
  const oldest = startMs == null ? Infinity : weekOf(startMs)
  while (posted.has(k) && k <= oldest) { weeks += 1; k += 1 }
  return { weeks, live }
}

/** creatorId -> { weeks, live } for every creator with entries. */
export function streaksByCreator(submissions, now, startMs = null) {
  const byCreator = new Map()
  for (const s of submissions || []) {
    const t = Date.parse(s.submitted_at)
    if (!Number.isFinite(t)) continue
    if (!byCreator.has(s.creator_id)) byCreator.set(s.creator_id, [])
    byCreator.get(s.creator_id).push(t)
  }
  const out = new Map()
  for (const [id, times] of byCreator) out.set(id, postingStreak(times, now, startMs))
  return out
}
