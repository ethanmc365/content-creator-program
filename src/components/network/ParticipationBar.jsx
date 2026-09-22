import { useEffect, useState } from 'react'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

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
// IT HOLDS ITS PLACE FROM THE FIRST PAINT, AND FILLS IN (22 Sep 2026).
//
// Ethan: "the creator participation card still doesn't animate in nicely, it
// appears late and makes everything judder." It rendered NOTHING until the
// audience count came back, then dropped in a 100px card above the tabs and
// shoved the whole page down a beat after it had settled. Now `pending` draws
// the same card at the same height from the first frame (a shimmer where the
// numbers go), and when the count lands the bar GROWS from empty to its value
// and the percentage counts up with it - so the arrival of the data is the
// animation, instead of a jump.
function useGrow(target, delay = 120) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (target == null) return undefined
    const t = setTimeout(() => setV(target), delay)
    return () => clearTimeout(t)
  }, [target, delay])
  return v
}

function useCount(target, ms = 900, delay = 120) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (target == null) return undefined
    let raf = 0
    let t0 = 0
    const start = setTimeout(() => {
      const step = (t) => {
        if (!t0) t0 = t
        const k = Math.min(1, (t - t0) / ms)
        setN(Math.round(target * k))
        if (k < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, delay)
    // Never gate a value on rAF alone: a background tab runs no frames.
    const land = setTimeout(() => setN(target), delay + ms + 100)
    return () => { clearTimeout(start); clearTimeout(land); cancelAnimationFrame(raf) }
  }, [target, ms, delay])
  return n
}

export default function ParticipationBar({ participation, pending = false, where = 'in this market', className }) {
  const tr = useT()
  const total = Number(participation?.total) || 0
  const posted = Number(participation?.posted) || 0
  const pct = participation && total > 0 ? Math.round((posted / total) * 100) : null
  const width = useGrow(pct)
  const shownPct = useCount(pct)

  if (!participation && !pending) return null

  // A MARKET WITH NOBODY IN IT SAYS SO.
  //
  // This used to return null whenever the denominator was zero, which is how
  // "the bar is missing under this challenge" happened: a challenge in a market
  // with no creators yet simply had no bar, and a missing bar is indistinguishable
  // from a broken one. Zero of zero is a real state and worth a sentence.
  if (participation && total === 0) {
    return (
      <div className={cx('rounded-card border border-gray-100 bg-white px-5 py-4 shadow-card animate-fade-up', className)}>
        <p className="text-sm font-semibold text-ink">{tr("Creator participation")}</p>
        <p className="mt-1 text-xs text-smoke">
          No creators have joined this market yet, so there is nobody to count.
          {posted > 0 ? ` ${posted} ${posted === 1 ? 'entry has' : 'entries have'} come in anyway.` : ''}
        </p>
      </div>
    )
  }

  const ready = pct != null
  return (
    <div className={cx('rounded-card border border-gray-100 bg-white px-5 py-4 shadow-card animate-fade-up', className)} aria-busy={!ready}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{tr("Creator participation")}</p>
        {ready
          ? <p className="text-sm font-bold tabular-nums text-brand">{shownPct}%</p>
          : <span className="h-4 w-9 animate-pulse rounded bg-cloud" />}
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-cloud">
        {/* No minimum width. A 2% sliver of orange under a line reading "0 of
            43 have posted" is the same bug the referral page had: an empty bar
            has to look empty, or the number and the picture contradict each
            other and people believe the picture. */}
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: `${width}%` }}
        />
      </div>
      <p className={cx('mt-2 text-xs text-smoke transition-opacity duration-500', ready ? 'opacity-100' : 'opacity-0')}>
        {ready ? `${posted} of ${total} creators ${where} have posted so far.` : '\u00a0'}
      </p>
    </div>
  )
}
