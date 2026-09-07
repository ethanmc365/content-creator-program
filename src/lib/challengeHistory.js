import { supabase } from './supabase'

// THE PROGRAMME'S RECORD, INCLUDING THE PART THAT PREDATES THE PLATFORM.
//
// Forty-nine challenges ran on a spreadsheet between January and September 2026
// before any of this existed, and one more is running in Spain right now that
// will finish outside the platform. Analytics that starts in July is analytics
// that says the programme has produced 76,633 views when it has produced
// nineteen and a half million.
//
// See migration 197 for why these are aggregates in `challenge_history` rather
// than invented `challenges` and `submissions` rows, and migration 198 for the
// import and its reconciliation.

/** The columns a person edits. Everything else is derived or bookkeeping. */
export const HISTORY_FIELDS = [
  'community_id', 'country_code', 'title', 'starts_at', 'ends_at',
  'cadence', 'cohort', 'prize_type', 'content_type', 'objective', 'status',
  'prize_total', 'winners', 'total_views', 'creators', 'posts', 'notes',
]

export const CADENCES = ['monthly', 'express']
export const COHORTS = ['General', 'UGC', 'VIP']
export const STATUSES = ['planned', 'running', 'done']
export const PRIZE_TYPES = ['Cash', 'Travel voucher', 'Cash & Travel voucher', 'Other']
export const CONTENT_TYPES = ['Free', 'Suggested videos', 'Hooks', 'Talking style', 'Other']
export const OBJECTIVES = ['Views', 'Views / Trust', 'Creativity', 'Number of videos', 'Other']

// EVERY DERIVED NUMBER IS COMPUTED, NEVER STORED.
//
// The source spreadsheet carried six of these as columns, and a stored derived
// number is a second opinion that drifts from the first the moment somebody
// corrects a view count and forgets the CPM beside it. The database view
// `challenge_history_metrics` computes the same six; this is the same
// arithmetic in JS for rows held in memory (a form being edited, a list being
// re-sorted) so the two cannot disagree either.
//
// `null` MEANS "NOT MEASURED" ALL THE WAY THROUGH. Fourteen of the imported
// rows have no view count - they are marked Done in the sheet with a note
// saying the views were never logged. Treating those as zero would drag every
// average in the programme down with a number nobody ever recorded, so a
// missing input gives a missing answer and the UI draws a dash.
const div = (a, b) => (a == null || !b ? null : a / b)

export function historyMetrics(r) {
  const views = r.total_views ?? null
  const prize = r.prize_total == null ? null : Number(r.prize_total)
  return {
    cpm: views > 0 && prize != null ? prize / (views / 1000) : null,
    costPerPost: div(prize, r.posts),
    costPerCreator: div(prize, r.creators),
    postsPerCreator: div(r.posts, r.creators),
    viewsPerPost: div(views, r.posts),
    viewsPerCreator: div(views, r.creators),
    days: r.starts_at && r.ends_at
      ? Math.max(1, Math.round((new Date(r.ends_at) - new Date(r.starts_at)) / 86400000))
      : null,
  }
}

/**
 * Roll a set of history rows up into one line of programme totals.
 *
 * A TOTAL SKIPS WHAT IT CANNOT COUNT, AND SAYS SO. `challenges` is every row;
 * `measured` is the ones with a view count. A CPM computed over 49 challenges'
 * prize money and 35 challenges' views would be wrong by a third and would look
 * completely plausible, which is the dangerous kind of wrong - so the cost side
 * of every ratio only counts the challenges whose views are known.
 */
export function rollUp(rows) {
  const measured = rows.filter((r) => r.total_views != null)
  const sum = (list, k) => list.reduce((n, r) => n + (Number(r[k]) || 0), 0)
  const views = sum(measured, 'total_views')
  const measuredPrize = sum(measured, 'prize_total')
  return {
    challenges: rows.length,
    measured: measured.length,
    unmeasured: rows.length - measured.length,
    prize: sum(rows, 'prize_total'),
    views,
    creators: sum(rows, 'creators'),
    posts: sum(rows, 'posts'),
    winners: sum(rows, 'winners'),
    // Only over the challenges we can actually see the views for.
    cpm: views > 0 ? measuredPrize / (views / 1000) : null,
    measuredPrize,
  }
}

/**
 * Every history row, newest first.
 *
 * `challenge_id` is carried through so a caller can drop the rows that are the
 * same contest as something the platform already holds - see `liveOverlap`.
 */
export async function loadHistory() {
  const { data, error } = await supabase
    .from('challenge_history')
    .select('*')
    .order('starts_at', { ascending: false })
  return { rows: data ?? [], error: error?.message ?? null }
}

/**
 * The rows that are NOT also live challenges on this platform.
 *
 * The UK challenge that ran 20 Jul to 20 Aug 2026 exists in both places - the
 * team tracked it on the spreadsheet while the platform was being built. Any
 * total that adds the sheet's figure to the platform's counts one contest
 * twice, so every roll-up filters through this and the live side supplies that
 * challenge's numbers instead.
 */
export const historyOnly = (rows) => rows.filter((r) => !r.challenge_id)

export async function saveHistory(row, userId) {
  const patch = {}
  for (const k of HISTORY_FIELDS) patch[k] = row[k] === '' ? null : row[k]
  // A row typed in by hand is not an import, and saying so matters: the import
  // is re-runnable and overwrites by `ref`, so anything hand-entered has to be
  // distinguishable from something a re-import may replace.
  if (!row.id) { patch.source = 'manual'; patch.created_by = userId }
  const q = row.id
    ? supabase.from('challenge_history').update(patch).eq('id', row.id)
    : supabase.from('challenge_history').insert(patch)
  // THE RESULT IS READ. supabase-js resolves on a refused write, and a prize
  // figure that silently failed to save is a number somebody will later plan a
  // budget against.
  const { error } = await q.select('id').maybeSingle()
  return { error: error?.message ?? null }
}

export async function deleteHistory(id) {
  const { error } = await supabase.from('challenge_history').delete().eq('id', id)
  return { error: error?.message ?? null }
}
