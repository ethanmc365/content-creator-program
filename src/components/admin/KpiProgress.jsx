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
  gray: { fill: 'from-gray-300 to-gray-400', text: 'text-smoke' },
}

export function barTone(status, pct) {
  if (status === 'upcoming') return 'gray'
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
// THE PACE MARKER IS A PLAIN LINE (30 Sep 2026). Ethan: "I don't really like the coloured bar for
// recommended pace ... maybe just a black bar or grey ... just a line, more simple." A thin dark-grey
// tick across the track, no ring, no glow; the legend under the bar uses the same tick.
//
// A PERIOD THAT HAS NOT STARTED draws an empty, dashed track and says when it starts, instead of a
// bar and "on track" for goals nobody has had a chance at yet.
export default function KpiProgress({ status, pct, progress, isLevel = false, className, size = 'md', startsIn = null }) {
  const tr = useT()
  void isLevel
  const tone = BAR_TONES[barTone(status, pct)]
  const cur = Math.round(pct * 100)
  const fill = Math.min(100, cur)
  const steady = Math.round(progress * 100)
  const showPace = status !== 'missed' && status !== 'upcoming' && progress > 0 && progress < 1
  const markAt = Math.min(99, Math.max(1, steady))
  const h = size === 'lg' ? 'h-3' : 'h-2'

  if (status === 'upcoming') {
    return (
      <div className={className}>
        <div className={cx('rounded-full border border-dashed border-gray-300 bg-gray-50', h)} />
        <div className="mt-2 flex items-center gap-1.5 text-[12px] font-medium leading-none text-smoke">
          <span className="inline-block h-2 w-2 rounded-full border border-dashed border-gray-400" />
          {startsIn == null ? tr('Not started yet')
            : startsIn <= 1 ? tr('Starts tomorrow') : tr('Starts in {n} days', { n: startsIn })}
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className={cx('relative rounded-full bg-cloud', h)}>
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
            className="absolute top-1/2 z-10 h-[calc(100%+8px)] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-700/80"
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
            <span className="mr-1.5 inline-block h-3 w-[2px] rounded-full bg-gray-700/80 align-[-2px]" />
            {tr('Recommended pace')} <span className="tabular-nums">{steady}%</span>
          </span>
        )}
      </div>
    </div>
  )
}
