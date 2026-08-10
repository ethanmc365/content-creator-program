import { cx } from '../../lib/utils'

// How much of a market has actually entered the challenge that is running.
//
// WHY THIS IS ITS OWN FILE
//
// It is drawn in two places: under the live challenge card, and above the brief
// on a market's Challenges tab. The obvious home for it was LiveChallengeCard,
// but that module imports `motion`, and ChallengeDetail is EAGERLY routed - it
// is the page 40-odd creators open every day. Importing this from there would
// have pulled the whole Motion runtime into the initial bundle for all of them.
// A shared leaf component has to live somewhere with no heavy imports of its
// own. (Same trap as `flagFromIso`, which had to move out of PlaceSwitcher for
// exactly this reason.)
//
// It nudges the quiet majority and names nobody. The denominator is always the
// roster of ONE place, so an empty market says "0 of 0" rather than borrowing
// another market's creator count.
export default function ParticipationBar({ participation, where = 'in this market', className }) {
  if (!participation) return null
  const total = Number(participation.total) || 0
  const posted = Number(participation.posted) || 0

  // A MARKET WITH NOBODY IN IT SAYS SO.
  //
  // This used to return null whenever the denominator was zero, which is how
  // "the bar is missing under this challenge" happened: a challenge in a market
  // with no creators yet simply had no bar, and a missing bar is indistinguishable
  // from a broken one. Zero of zero is a real state and worth a sentence.
  if (total === 0) {
    return (
      <div className={cx('rounded-card border border-gray-100 bg-white px-5 py-4 shadow-card', className)}>
        <p className="text-sm font-semibold text-ink">Creator participation</p>
        <p className="mt-1 text-xs text-smoke">
          No creators have joined this market yet, so there is nobody to count.
          {posted > 0 ? ` ${posted} ${posted === 1 ? 'entry has' : 'entries have'} come in anyway.` : ''}
        </p>
      </div>
    )
  }

  const pct = Math.round((posted / total) * 100)
  return (
    <div className={cx('rounded-card border border-gray-100 bg-white px-5 py-4 shadow-card', className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-ink">Creator participation</p>
        <p className="text-sm font-bold tabular-nums text-brand">{pct}%</p>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-cloud">
        {/* No minimum width. A 2% sliver of orange under a line reading "0 of
            43 have posted" is the same bug the referral page had: an empty bar
            has to look empty, or the number and the picture contradict each
            other and people believe the picture. */}
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-smoke">
        {posted} of {total} creators {where} have posted so far.
      </p>
    </div>
  )
}
