import { useT } from '../../lib/i18n'
import { cx } from '../../lib/utils'

// ONE PROGRESS BAR FOR EVERY KPI (30 Sep 2026). The card and the detail view
// used to colour the same bar differently (orange on the card, a flat green in
// the detail), and the copy under it - "98% through · a steady pace would be at
// 49 today" - made you do the sums. Ethan: "Current pace 50% and Steady pace
// 45%, making it easy to see if you're ahead or behind."
//
// So: the fill is `Current` (actual / target), a tick on the track is `Steady
// pace` (how far through the period we are, which is where a straight line to
// the target would be), and one chip says ahead or behind by how many points.
//
// COLOUR IS A FUNCTION OF THE FILL AND THE STATUS, NOT OF WHERE IT IS DRAWN:
// amber part-way and behind, orange on track, green once it is nearly there,
// red only when the period ended short. Every gradient runs light to dark
// left to right so the leading edge is the brightest part.
export const BAR_TONES = {
  green: { fill: 'from-emerald-700 to-emerald-500', text: 'text-emerald-700' },
  orange: { fill: 'from-brand-light to-brand', text: 'text-brand' },
  amber: { fill: 'from-amber-300 to-amber-500', text: 'text-amber-600' },
  red: { fill: 'from-red-400 to-red-600', text: 'text-red-600' },
}

export function barTone(status, pct) {
  if (status === 'met') return 'green'
  if (status === 'missed') return 'red'
  if (pct >= 0.9) return 'green'
  return status === 'behind' ? 'amber' : 'orange'
}

// THE PACE MARKER, EXPLAINED (1 Oct 2026). Ethan saw "a weird line at the end of the progress
// bar" on Challenges run and not on Videos entered. It is the recommended pace: where a straight
// line to the goal would be by today. Late in a quarter it sits at 99%, right on the end of the
// bar, which is why it read as a glitch; and it was hidden once a goal was met, which is why one
// card had it and the next did not. Now every running total shows it for as long as its period is
// running (met or not), it is drawn as a labelled notch rather than a stray hairline, and an
// average never shows it, because an average has no straight line to be ahead of.
export default function KpiProgress({ status, pct, progress, isLevel = false, className, size = 'md' }) {
  const tr = useT()
  const tone = BAR_TONES[barTone(status, pct)]
  const cur = Math.round(pct * 100)
  const fill = Math.min(100, cur)
  const steady = Math.round(progress * 100)
  // EVERY KPI SHOWS IT (2 Oct 2026). Ethan: "for some things, like average entries per creator, we
  // don't have the progress bar or the recommended pace bar ... ensure this shows up for all the KPIs".
  // An average in this tracker is still counted over the period so far, so it builds as the period
  // runs; the same straight line to the goal applies.
  void isLevel
  const showPace = status !== 'missed' && progress > 0 && progress < 1
  const markAt = Math.min(98.5, Math.max(1.5, steady))

  return (
    <div className={className}>
      <div className={cx('relative rounded-full bg-cloud', size === 'lg' ? 'h-3' : 'h-2')}>
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div
            className={cx('kpi-fill relative h-full overflow-hidden rounded-full bg-gradient-to-r', tone.fill, status === 'met' && 'kpi-complete')}
            style={{ width: `${Math.max(fill > 0 ? 3 : 0, fill)}%` }}
          />
        </div>
        {showPace && (
          <span
            aria-hidden
            title={tr('Recommended pace')}
            className="absolute top-1/2 z-10 h-[calc(100%+10px)] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_0_2px_#fff,0_1px_4px_rgba(0,0,0,0.25)]"
            style={{ left: `${markAt}%` }}
          />
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-none">
        <span className="font-semibold text-ink">
          <span className={cx('mr-1 inline-block h-2 w-2 rounded-full bg-gradient-to-r align-[0px]', tone.fill)} />
          {tr('Current pace')} <span className="tabular-nums">{cur}%</span>
        </span>
        {showPace && (
          <span className="font-medium text-smoke">
            <span className="mr-1 inline-block h-3 w-[5px] rounded-full bg-brand align-[-2px]" />
            {tr('Recommended pace')} <span className="tabular-nums">{steady}%</span>
          </span>
        )}
      </div>
    </div>
  )
}
