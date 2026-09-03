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
export const RULE_USES_MAX = new Set(['per_post', 'platform_spread'])

// `min_views` HOLDS A CLAIMED BONUS BACK UNTIL THE ENTRY EARNS IT (migration
// 181). It is the only field whose owner is not decided by `kind` alone: a
// bonus with no question is one an ADMIN awards by judgement from the results
// page, and gating a human's decision on a view count would only stop them
// being able to make it. So the gate belongs to a bonus that has a question.
export const ruleUsesMinViews = (r) => r?.kind === 'bonus' && !!String(r?.prompt ?? '').trim()

/** A rule trimmed to the columns its kind actually means. */
export function normalisePointRule(r) {
  return {
    kind: r.kind,
    label: r.label,
    points: r.points,
    threshold: RULE_USES_THRESHOLD.has(r.kind) ? r.threshold : null,
    max_points: RULE_USES_MAX.has(r.kind) ? r.max_points : null,
    // Zero and null mean the same thing here - "no gate" - and the database
    // compares `>= coalesce(min_views, 0)`, so both behave identically. Null is
    // the one that reads as "not set" when somebody looks at the row.
    min_views: ruleUsesMinViews(r) && Number(r.min_views) > 0 ? Number(r.min_views) : null,
  }
}
