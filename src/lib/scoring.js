// How a challenge decides who wins, defined once.
//
// Three modes are offered when creating a challenge, in every market. A fourth
// value, `prize`, exists only because it is what every challenge run before
// August 2026 used, including the one currently live in the UK. It is never
// offered for a NEW challenge, but it must keep rendering correctly forever:
// silently remapping old rows to a new mode would rewrite the history of a
// contest people already competed in.

export const SCORING_MODES = [
  {
    value: 'points',
    label: 'Points leaderboard',
    short: 'Points',
    icon: 'trophy',
    blurb: 'You set the rules. Points per video, bonuses for hitting view milestones, and manual awards from the team.',
    winner: 'Most points at the deadline wins.',
    creatorLine: 'Scored on points',
  },
  {
    value: 'best_video',
    label: 'Best single video',
    short: 'Best video',
    icon: 'video',
    blurb: 'Every creator can enter as often as they like; only their strongest video counts.',
    winner: 'The single highest-viewed video wins.',
    creatorLine: 'Your best video counts',
  },
  {
    value: 'total_views',
    label: 'Total views',
    short: 'Total views',
    icon: 'chart',
    blurb: 'Rewards volume as well as reach. Every entry a creator posts adds to their total.',
    winner: 'Highest views added up across all entries wins.',
    creatorLine: 'All your views add up',
  },
]

// Not in SCORING_MODES on purpose: it must never appear in the create form.
const LEGACY_PRIZE = {
  value: 'prize',
  label: 'Prize pot',
  short: 'Prize',
  icon: 'money',
  blurb: 'The original format: a prize pot decided by the team.',
  winner: 'Decided by the team at the deadline.',
  creatorLine: 'Cash prizes',
}

export const DEFAULT_SCORING = 'best_video'

export function scoringMode(value) {
  return SCORING_MODES.find((m) => m.value === value) || LEGACY_PRIZE
}

// Everything the database will accept, for validation before a write.
export const ALL_SCORING_VALUES = [...SCORING_MODES.map((m) => m.value), 'prize']

// Does this mode rank creators from submission view counts alone?
// `points` does not: its leaderboard comes from the point ledger, which
// includes awards a human made and no view count can reproduce.
export const isViewRanked = (value) => value === 'best_video' || value === 'total_views'

// Given one creator's submissions, the number this challenge ranks them on.
export function scoreForEntries(mode, entries) {
  const views = (entries || []).map((e) => Number(e.logged_views) || 0)
  if (views.length === 0) return 0
  if (mode === 'total_views') return views.reduce((a, b) => a + b, 0)
  // best_video, and legacy prize, both rank on the strongest single entry.
  return Math.max(...views)
}

// The default rule set a new points challenge starts with. Deliberately lives
// in code rather than in a market's row: the market template was removed when
// scoring moved onto the challenge, and a brand new market with no history
// still has to be able to run a points challenge on day one.
export const STARTER_POINT_RULES = [
  { kind: 'per_post', label: 'Video posted', points: 1, threshold: null, max_points: 10 },
  { kind: 'views_threshold', label: 'Passed 5,000 views', points: 2, threshold: 5000, max_points: null },
  { kind: 'views_threshold', label: 'Passed 10,000 views', points: 5, threshold: 10000, max_points: null },
  { kind: 'views_threshold', label: 'Passed 50,000 views', points: 10, threshold: 50000, max_points: null },
]


// WHICH FIELDS EACH POINT RULE ACTUALLY USES.
//
// Two files needed to know this and each had its own answer written as an
// inline conditional: the editor decided which box to draw, and the challenge
// form decided which columns to save. They agreed while there were three
// kinds, and the moment a fourth appeared the form silently nulled its
// threshold on the way to the database - a rule that looked right on screen
// and scored nothing.
export const RULE_USES_THRESHOLD = new Set(['views_threshold', 'total_views_threshold'])
// `bonus` has a cap too (migration 233): "+3 a video, at most 9 from this
// bonus". A consistency bonus is paid once, so it has no cap.
export const RULE_USES_MAX = new Set(['per_post', 'platform_spread', 'bonus'])
export const RULE_USES_PERIOD = new Set(['consistency'])

// A rule id that is a real database row. The editor gives a rule it has just
// made a temporary id (`new-3`, `seed-0`) so React can key it, and the save
// used to treat every id that was not `seed-` as a row: `new-5` went into a
// `not in (...)` against a uuid column and Postgres refused the whole save
// with "invalid input syntax for type uuid". Anything that is not a uuid is
// new, whatever it happens to be called.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isSavedRuleId = (id) => UUID.test(String(id ?? ''))

// Consistency windows offered by name; anything else is a custom number of days.
export const CONSISTENCY_PERIODS = [
  { days: 1, label: 'every day' },
  { days: 7, label: 'every week' },
]

/** How many windows a challenge's dates cut into, for `period_days`. */
export function consistencyWindows(startIso, endIso, periodDays) {
  const start = Date.parse(startIso)
  const end = Date.parse(endIso)
  const days = Number(periodDays)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !(days > 0)) return null
  return Math.max(1, Math.ceil((end - start) / (days * 86400000)))
}

// `min_views` HOLDS A CLAIMED BONUS BACK UNTIL THE ENTRY EARNS IT (migration
// 181). It is the only field whose owner is not decided by `kind` alone: a
// bonus with no question is one an ADMIN awards by judgement from the results
// page, and gating a human's decision on a view count would only stop them
// being able to make it. So the gate belongs to a bonus that has a question.
//
// SINCE MIGRATION 233 IT IS EVERY BONUS. An admin awarding a bonus now writes
// the same claim a creator's tick box does, so "only once the video passes
// 2,000 views" holds whoever gave it. Ethan: "even if they select it, it's not
// awarded until the platform reads that the video got over 2,000 views."
export const ruleUsesMinViews = (r) => r?.kind === 'bonus'

// A BONUS CAN RUN FOR PART OF THE CHALLENGE (migration 256). Null at either end
// means open at that end. Judged on the entry's submitted_at in the database.
export const ruleUsesWindow = (r) => r?.kind === 'bonus'

const isoOrNull = (v) => (v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null)

/** Is a windowed rule open at `at` (ms or ISO)? A rule with no window always is. */
export function ruleOpenAt(r, at = Date.now()) {
  const t = typeof at === 'number' ? at : Date.parse(at)
  if (r?.starts_at && t < Date.parse(r.starts_at)) return false
  if (r?.ends_at && t > Date.parse(r.ends_at)) return false
  return true
}

/** 'upcoming' | 'live' | 'ended' | 'always' for a rule's window at `now`. */
export function ruleWindowState(r, now = Date.now()) {
  if (!r?.starts_at && !r?.ends_at) return 'always'
  if (r.starts_at && now < Date.parse(r.starts_at)) return 'upcoming'
  if (r.ends_at && now > Date.parse(r.ends_at)) return 'ended'
  return 'live'
}

// THE WEEKS OF A CHALLENGE, for the "which week does this bonus run" picker.
// Week N starts N-1 whole weeks after the challenge start; the last one stops
// at the deadline rather than running past it.
export function challengeWeeks(startIso, endIso) {
  const start = Date.parse(startIso)
  const end = Date.parse(endIso)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []
  const WEEK = 7 * 86400000
  const out = []
  for (let n = 0; start + n * WEEK < end && n < 26; n++) {
    const from = start + n * WEEK
    const to = Math.min(end, from + WEEK - 60000)
    out.push({ n: n + 1, starts_at: new Date(from).toISOString(), ends_at: new Date(to).toISOString() })
  }
  return out
}

/** A rule trimmed to the columns its kind actually means. */
export function normalisePointRule(r) {
  return {
    kind: r.kind,
    label: r.label,
    points: Number(r.points) || 0,
    threshold: RULE_USES_THRESHOLD.has(r.kind) ? r.threshold : null,
    max_points: RULE_USES_MAX.has(r.kind) && r.max_points != null && r.max_points !== '' ? r.max_points : null,
    // Zero and null mean the same thing here - "no gate" - and the database
    // compares `>= coalesce(min_views, 0)`, so both behave identically. Null is
    // the one that reads as "not set" when somebody looks at the row.
    min_views: ruleUsesMinViews(r) && Number(r.min_views) > 0 ? Number(r.min_views) : null,
    period_days: RULE_USES_PERIOD.has(r.kind) && Number(r.period_days) > 0 ? Math.round(Number(r.period_days)) : null,
    starts_at: ruleUsesWindow(r) ? isoOrNull(r.starts_at) : null,
    ends_at: ruleUsesWindow(r) ? isoOrNull(r.ends_at) : null,
  }
}
