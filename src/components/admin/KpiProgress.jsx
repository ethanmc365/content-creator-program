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
  green: { fill: 'from-emerald-400 to-emerald-600', text: 'text-emerald-600' },
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

export default function KpiProgress({ status, pct, progress, isLevel = false, className, size = 'md' }) {
  const tr = useT()
  const tone = BAR_TONES[barTone(status, pct)]
  const cur = Math.round(pct * 100)
  const fill = Math.min(100, cur)
  const steady = Math.round(progress * 100)
  // A level (an average, a rate) has no straight line to be ahead of.
  const showPace = !isLevel && status !== 'met' && status !== 'missed' && progress > 0 && progress < 1
  const diff = cur - steady

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
            className="absolute top-1/2 h-[170%] w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink/70"
            style={{ left: `${steady}%` }}
          />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[12px] leading-none">
        <span className="flex items-center gap-3">
          <span className="font-semibold text-ink">
            <span className={cx('mr-1 inline-block h-2 w-2 rounded-full bg-gradient-to-r align-[0px]', tone.fill)} />
            {tr('Current')} <span className="tabular-nums">{cur}%</span>
          </span>
          {showPace && (
            <span className="font-medium text-smoke">
              <span className="mr-1 inline-block h-2.5 w-0.5 rounded-full bg-ink/70 align-[-1px]" />
              {tr('Steady pace')} <span className="tabular-nums">{steady}%</span>
            </span>
          )}
        </span>
        {showPace && diff !== 0 && (
          <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums', diff > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
            {diff > 0 ? tr('{n} pts ahead', { n: diff }) : tr('{n} pts behind', { n: -diff })}
          </span>
        )}
      </div>
    </div>
  )
}
