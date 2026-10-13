import { challengesApi } from '../api/challenges'

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
// WHAT A PERSON EDITS, AND IT IS SHORTER THAN THE SPREADSHEET WAS.
//
// `content_type` and `objective` came off the import and are no longer tracked anywhere - the team removed the
// Challenges tab's "by content type" card and then the two fields behind it - so they are no longer WRITTEN. `cohort`
// goes the same way: the platform is one general community for now.
//
// The columns stay on the table on purpose. Forty-nine imported rows carry
// values in them, dropping a column is not reversible, and nothing costs
// anything by their sitting there unread. What matters is that nothing writes a
// field no screen shows.
//
// `cadence` and `status` ARE still written - by the form, not by the person.
// See components/admin/HistoryForm.
export const HISTORY_FIELDS = [
  'community_id', 'country_code', 'title', 'starts_at', 'ends_at',
  'cadence', 'prize_type', 'status',
  'prize_total', 'winners', 'total_views', 'creators', 'posts', 'notes',
]

export const PRIZE_TYPES = ['Cash', 'Travel voucher', 'Cash & Travel voucher', 'Other']

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

export async function saveHistory(row, userId) {
  const patch = {}
  for (const k of HISTORY_FIELDS) patch[k] = row[k] === '' ? null : row[k]
  // A row typed in by hand is not an import, and saying so matters: the import
  // is re-runnable and overwrites by `ref`, so anything hand-entered has to be
  // distinguishable from something a re-import may replace.
  if (!row.id) { patch.source = 'manual'; patch.created_by = userId }
  const q = row.id
    ? challengesApi.challengeHistory().update(patch).eq('id', row.id)
    : challengesApi.challengeHistory().insert(patch)
  // THE RESULT IS READ. supabase-js resolves on a refused write, and a prize
  // figure that silently failed to save is a number somebody will later plan a
  // budget against.
  const { error } = await q.select('id').maybeSingle()
  return { error: error?.message ?? null }
}

export async function deleteHistory(id) {
  const { error } = await challengesApi.challengeHistory().delete().eq('id', id)
  return { error: error?.message ?? null }
}
