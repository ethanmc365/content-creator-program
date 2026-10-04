// DAILY POSTING STREAKS ON A CHALLENGE (4 Oct 2026).
//
// Ethan: "we currently have the streak where someone has posted for 1 week, but I think we should have a streak where someone posts every
// day, because that would be even more impressive ... have a bigger flame ... show a really big fire with the daily streak they have. If
// they lost their streak, it should be greyed out and show what their highest streak was; if they currently have one, show the current
// streak."
//
// A DAY IS A CALENDAR DAY ON THE READER'S CLOCK (the same one their feed shows). The streak is how many days in a row have at least one entry.
//
//   live      posted TODAY: the run is running and the flame is lit.
//   waiting   posted yesterday but not yet today: the run is still alive until the day ends, so it shows its length with a dimmer flame.
//             (A streak that dropped to nothing every morning until you posted would be a punishment rather than a reward.)
//   lost      the last post was two or more days ago: current is 0, and `best` is what to show, greyed out.
//
// Days before the challenge opened do not count: a streak here is about THIS challenge. `best` is the longest run of consecutive days
// anywhere in the challenge, so a lost streak still has something to be proud of.

const dayKey = (t) => {
  const d = new Date(t)
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000)
}

/**
 * @param {number[]} times       entry times, ms
 * @param {number} now           ms
 * @param {number|null} startMs  the challenge's opening, ms
 * @returns {{ current: number, best: number, live: boolean, state: 'live'|'waiting'|'lost'|'none' }}
 */
export function dailyStreak(times, now, startMs = null) {
  const days = [...new Set((times || []).filter((t) => Number.isFinite(t) && t <= now && (startMs == null || t >= startMs)).map(dayKey))].sort((a, b) => a - b)
  if (!days.length) return { current: 0, best: 0, live: false, state: 'none' }
  let best = 1
  let run = 1
  for (let i = 1; i < days.length; i += 1) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1
    if (run > best) best = run
  }
  const today = dayKey(now)
  const last = days[days.length - 1]
  if (last < today - 1) return { current: 0, best, live: false, state: 'lost' }
  // `run` is now the length of the final run, which ends on `last` (today or yesterday).
  return { current: run, best, live: last === today, state: last === today ? 'live' : 'waiting' }
}

/** creatorId -> dailyStreak for every creator with entries. */
export function dailyStreaksByCreator(submissions, now, startMs = null) {
  const by = new Map()
  for (const s of submissions || []) {
    const t = Date.parse(s.submitted_at)
    if (!Number.isFinite(t)) continue
    if (!by.has(s.creator_id)) by.set(s.creator_id, [])
    by.get(s.creator_id).push(t)
  }
  const out = new Map()
  for (const [id, times] of by) out.set(id, dailyStreak(times, now, startMs))
  return out
}
