import { cx } from '../../../../lib/utils'
import { Card, StatusChip, eur, pct, toneOf, views } from './parts'

// MONTH BY MONTH, AS A TABLE YOU CAN READ (20 Oct 2026, third pass). The sheet had months across the top and figures down
// the side, so a year of months scrolled sideways inside the card and most of it was never seen. Now a month is a ROW:
// it reads top to bottom like any table, fits the card without scrolling sideways, and a click opens the month in full.
// One colour signal per month (the result chip and its bar); red only for a loss. On a phone each month is a card.
export default function MonthTable({ rows, onOpen }) {
  return (
    <Card className="overflow-hidden" delay={200}>
      <div className="px-5 pb-3 pt-5 sm:px-6">
        <h3 className="text-[15px] font-bold text-ink">Month by month</h3>
        <p className="text-[13px] text-smoke">Click a month for everything behind it. Months still ahead show the plan.</p>
      </div>

      {/* ---- From `md` up: the table. ---- */}
      <div className="hidden md:block">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <colgroup>
            <col className="w-[15%]" /><col className="w-[13%]" /><col className="w-[25%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[11%]" />
          </colgroup>
          <thead>
            <tr className="text-left text-[13px] font-semibold text-smoke">
              <th className="border-y border-gray-100 bg-cloud/60 py-2.5 pl-6 pr-2 font-semibold">Month</th>
              <th className="border-y border-gray-100 bg-cloud/60 px-2 py-2.5 font-semibold">Result</th>
              <th className="border-y border-gray-100 bg-cloud/60 px-2 py-2.5 font-semibold">Views against the target</th>
              <th className="border-y border-gray-100 bg-cloud/60 px-2 py-2.5 text-right font-semibold">Earnings</th>
              <th className="border-y border-gray-100 bg-cloud/60 px-2 py-2.5 text-right font-semibold">Costs</th>
              <th className="border-y border-gray-100 bg-cloud/60 px-2 py-2.5 text-right font-semibold">Margin</th>
              <th className="border-y border-gray-100 bg-cloud/60 py-2.5 pl-2 pr-6 text-right font-semibold">Per 1,000</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const live = r.state === 'live'
              const future = r.state === 'future'
              return (
                <tr key={r.key} onClick={() => onOpen(r.key)} className={cx('group cursor-pointer animate-rise transition-colors', live ? 'bg-brand-tint/40' : 'hoverable:hover:bg-cloud/70')}
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <td className="border-b border-gray-50 py-3.5 pl-6 pr-2">
                    <span className="block font-semibold text-ink transition-colors group-hover:text-brand">{r.longLabel}</span>
                    {live && <span className="text-[13px] text-smoke">Day {Math.floor(r.elapsed) + 1} of {r.days}</span>}
                  </td>
                  <td className="border-b border-gray-50 px-2 py-3.5">
                    {future ? <span className="text-[13px] font-medium text-gray-400">Upcoming</span> : <StatusChip status={r.status} live={live} />}
                  </td>
                  <td className="border-b border-gray-50 px-2 py-3.5">
                    <ViewsCell r={r} />
                  </td>
                  <Money n={future ? r.estEarnings : r.actualEarnings} plan={future} so={live} />
                  <Money n={future ? r.estCost : r.actualCost} plan={future} so={live} />
                  <Money n={future ? r.estMargin : r.actualMargin} plan={future} so={live} strong />
                  <td className="border-b border-gray-50 py-3.5 pl-2 pr-6 text-right tabular-nums">
                    {future ? <span className="text-gray-400">{eur(r.cpm, true)}</span> : r.actualCpm != null ? eur(r.actualCpm, true) : <span className="text-gray-300">-</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="px-6 py-3 text-[13px] text-smoke">Grey figures are the plan (target × EPM and target CPM). &quot;So far&quot; is the month in progress.</p>
      </div>

      {/* ---- On a phone: one card a month, stacked. ---- */}
      <ul className="space-y-2.5 px-4 pb-4 md:hidden">
        {rows.map((r) => {
          const live = r.state === 'live'
          const future = r.state === 'future'
          return (
            <li key={r.key}>
              <button type="button" onClick={() => onOpen(r.key)} className={cx('w-full rounded-2xl border p-4 text-left', live ? 'border-brand/30 bg-brand-tint/40' : 'border-gray-100 bg-white')}>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-bold text-ink">{r.longLabel}</span>
                  {future ? <span className="text-[13px] font-medium text-gray-400">Upcoming</span> : <StatusChip status={r.status} live={live} />}
                </span>
                <span className="mt-3 block"><ViewsCell r={r} /></span>
                <span className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-[13px]">
                  {[['Earnings', future ? r.estEarnings : r.actualEarnings], ['Costs', future ? r.estCost : r.actualCost], ['Margin', future ? r.estMargin : r.actualMargin]].map(([l, n]) => (
                    <span key={l}>
                      <span className="block text-smoke">{l}</span>
                      <span className={cx('block font-semibold tabular-nums', future ? 'text-gray-400' : n < 0 ? 'text-red-600' : 'text-ink')}>{eur(n)}</span>
                    </span>
                  ))}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

const BAR = { good: 'from-emerald-500 to-emerald-400', warn: 'from-amber-500 to-amber-400', bad: 'from-brand to-brand-light', idle: 'from-brand to-brand-light' }
function ViewsCell({ r }) {
  if (r.target == null) return <span className="text-gray-300">No target</span>
  if (r.state === 'future') {
    return (
      <span className="flex items-baseline justify-between gap-2 tabular-nums">
        <span className="text-gray-400">Target</span>
        <span className="font-semibold text-ink">{views(r.target)}</span>
      </span>
    )
  }
  const live = r.state === 'live'
  const shown = live ? r.projected : r.achieved
  const fill = Math.min(100, ((r.achieved || 0) / r.target) * 100)
  const paceFill = live ? Math.min(100, ((r.projected || 0) / r.target) * 100) : 0
  return (
    <span className="block">
      <span className="flex items-baseline justify-between gap-2 tabular-nums">
        <span className="font-semibold text-ink">{views(r.achieved)}</span>
        <span className="text-[13px] text-smoke">of {views(r.target)}</span>
      </span>
      <span className="relative mt-1.5 block h-2 overflow-hidden rounded-full bg-cloud">
        {live && <span className="absolute inset-y-0 left-0 rounded-full bg-brand/20" style={{ width: `${paceFill}%` }} />}
        <span className={cx('absolute inset-y-0 left-0 rounded-full bg-gradient-to-r', BAR[toneOf(r.status)])} style={{ width: `${fill}%` }} />
      </span>
      <span className="mt-1 block text-[13px] text-smoke">{live ? `${pct(r.pct)} so far · pace ${pct(r.projectedPct)}` : `${pct(shown / r.target)} of the target`}</span>
    </span>
  )
}
function Money({ n, plan, so, strong }) {
  return (
    <td className="border-b border-gray-50 px-2 py-3.5 text-right tabular-nums">
      <span className={cx('block', plan ? 'text-gray-400' : n < 0 ? 'text-red-600' : 'text-ink', strong && !plan && 'font-bold')}>{n == null ? '-' : eur(n)}</span>
      {so && <span className="block text-[13px] text-smoke">so far</span>}
    </td>
  )
}
