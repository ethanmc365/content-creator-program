import { Fragment, useEffect, useRef } from 'react'
import Icon from '../../../../components/Icon'
import { cx } from '../../../../lib/utils'
import { Card, ProgressBar, StatusChip, Term, eur, pct, toneOf, toneText, views } from './parts'

// THE SHEET, REDRAWN AND TIDIED (20 Oct 2026). The team: "a lot of different numbers, different colours". Months across,
// eight lines down: the views (target, achieved, % of it, and the pace for the month in progress) and the money
// (earnings, costs, margin, cost per 1,000). The plan's own estimates live in each month's detail, not here. One colour
// signal per month (the result chip, and the % beside it); red only for a loss. The first column stays put while the
// months scroll sideways.
export default function TargetsSheet({ rows, seg, onOpen, onEdit }) {
  const editable = seg !== 'all'
  const groups = [
    {
      title: 'Views',
      lines: [
        { label: <Term k="target">Target</Term>, cell: (r) => targetCell(r), edit: true },
        { label: <Term k="achieved">Achieved</Term>, cell: (r) => achievedCell(r), strong: true },
        { label: '% of target', cell: (r) => pctCell(r) },
        { label: <Term k="pace">On pace for</Term>, cell: (r) => (r.state === 'live' ? views(r.projected) : ''), only: 'live' },
      ],
    },
    {
      title: 'Money',
      lines: [
        { label: <Term k="epm">Earnings</Term>, cell: (r) => moneyCell(r.actualEarnings, r) },
        { label: <Term k="costs">Costs</Term>, cell: (r) => moneyCell(r.actualCost, r) },
        { label: <Term k="margin">Margin</Term>, cell: (r) => marginCell(r), strong: true },
        { label: <Term k="actualCpm">Cost per 1,000</Term>, cell: (r) => cpmCell(r) },
      ],
    },
  ]
  return (
    <Card className="overflow-hidden" delay={200}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 sm:px-6">
        <div>
          <h3 className="text-[15px] font-bold text-ink">Month by month</h3>
          <p className="text-[13px] text-smoke">
            <span className="sm:hidden">Swipe through the months; tap one for the full picture.</span>
            <span className="max-sm:hidden">Click a month for the full picture{editable ? ', or a target to change it' : ''}.</span>
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-[13px] text-smoke"><span className="h-1.5 w-1.5 rounded-full bg-brand" />Set by hand</p>
      </div>
      <MonthCards rows={rows} onOpen={onOpen} onEdit={editable ? onEdit : null} />
      <div className="scroll-edge-fade mt-4 hidden overflow-x-auto pb-3 sm:block">
        <table className="w-max min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 min-w-[10rem] bg-white px-5 py-2 sm:px-6" />
              {rows.map((r, i) => (
                <th key={r.key} className={cx('min-w-[7.75rem] px-3 py-2 text-right align-bottom', r.state === 'live' && 'rounded-t-xl bg-brand-tint/60')}>
                  <button type="button" onClick={() => onOpen(r.key)} className="group ml-auto flex animate-rise flex-col items-end gap-1.5" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                    <span className="text-sm font-bold text-ink transition-colors group-hover:text-brand">{r.label}</span>
                    {r.state === 'future' ? <span className="text-[13px] font-medium text-gray-400">Upcoming</span> : <StatusChip status={r.status} live={r.state === 'live'} />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.title}>
                <tr>
                  <td className="sticky left-0 z-10 bg-white px-5 pb-1 pt-4 text-[13px] font-bold uppercase tracking-wide text-gray-400 sm:px-6">{g.title}</td>
                  {rows.map((r) => <td key={r.key} className={cx(r.state === 'live' && 'bg-brand-tint/30')} />)}
                </tr>
                {g.lines.filter((l) => !l.only || rows.some((r) => r.state === l.only)).map((l, li) => (
                  <tr key={li} className="group/row">
                    <td className={cx('sticky left-0 z-10 whitespace-nowrap border-t border-gray-50 bg-white px-5 py-2.5 sm:px-6 group-hover/row:bg-cloud', l.strong ? 'font-semibold text-ink' : 'text-smoke')}>{l.label}</td>
                    {rows.map((r) => (
                      <td key={r.key} className={cx('whitespace-nowrap border-t border-gray-50 px-3 py-2.5 text-right tabular-nums text-ink transition-colors group-hover/row:bg-cloud/70',
                        r.state === 'live' && 'bg-brand-tint/30', r.state === 'future' && 'text-gray-400', l.strong && 'font-bold')}>
                        {l.edit && editable ? (
                          <button type="button" onClick={() => onEdit(r.key)} title="Change the plan for this month"
                            className="group/edit -mr-1 inline-flex items-center gap-1 rounded-md px-1 transition-colors hoverable:hover:bg-brand-tint hoverable:hover:text-brand">
                            <Icon name="pencil" className="h-3 w-3 opacity-0 transition-opacity group-hover/edit:opacity-100" />
                            {l.cell(r)}
                          </button>
                        ) : l.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

const sub = 'block text-[13px] font-normal text-smoke'
function targetCell(r) {
  if (r.target == null) return <span className="text-gray-300">Not set</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      {r.pinned && <span title="Set by hand" className="h-1.5 w-1.5 rounded-full bg-brand" />}
      {views(r.target)}
    </span>
  )
}
function achievedCell(r) {
  if (r.state === 'future' || r.achieved == null) return ''
  return (
    <span className="inline-flex flex-col items-end">
      <span>{views(r.achieved)}</span>
      {r.state === 'live' && <span className={sub}>so far</span>}
      {r.source === 'override' && <span className="text-[13px] font-normal text-amber-600" title={`Platform measured ${views(r.measured)}`}>set by hand</span>}
    </span>
  )
}
function pctCell(r) {
  if (r.pct == null) return ''
  const tone = toneText[toneOf(r.status)]
  return <span className={cx('font-semibold', tone)}>{pct(r.pct, 1)}</span>
}
function cpmCell(r) {
  if (r.actualCpm == null) return ''
  return (
    <span className="inline-flex flex-col items-end">
      <span>{eur(r.actualCpm, true)}</span>
      <span className={sub}>target {eur(r.cpm, true)}</span>
    </span>
  )
}
function moneyCell(n, r) {
  if (n == null) return ''
  return (
    <span className="inline-flex flex-col items-end">
      <span>{eur(n)}</span>
      {r.state === 'live' && <span className={sub}>so far</span>}
    </span>
  )
}
function marginCell(r) {
  if (r.actualMargin == null) return ''
  return <span className={r.actualMargin < 0 ? 'text-red-600' : undefined}>{eur(r.actualMargin)}</span>
}

// ON A PHONE: ONE CARD A MONTH, SWIPED SIDEWAYS, opening on the month in progress (or the last one finished). The table
// above showed one month at a time behind its label column, which is a spreadsheet nobody can read at 375px.
function MonthCards({ rows, onOpen, onEdit }) {
  const ref = useRef(null)
  const start = rows.findIndex((r) => r.state === 'live') >= 0 ? rows.findIndex((r) => r.state === 'live')
    : Math.max(0, rows.map((r) => r.state).lastIndexOf('done'))
  useEffect(() => {
    const el = ref.current?.children[start]
    if (el) ref.current.scrollTo({ left: el.offsetLeft - 16, behavior: 'instant' })
  }, [start])
  return (
    <div ref={ref} className="scrollbar-none mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:hidden">
      {rows.map((r) => {
        const live = r.state === 'live'
        const future = r.state === 'future'
        return (
          <div key={r.key} className={cx('w-[84%] shrink-0 snap-center rounded-2xl border p-4', live ? 'border-brand/30 bg-brand-tint/40' : 'border-gray-100 bg-white')}>
            <button type="button" onClick={() => onOpen(r.key)} className="flex w-full items-center justify-between gap-2 text-left">
              <span className="text-base font-bold text-ink">{r.longLabel}</span>
              {future ? <span className="text-[13px] font-medium text-gray-400">Upcoming</span> : <StatusChip status={r.status} live={live} />}
            </button>
            <div className="mt-3 flex items-end justify-between gap-2">
              <div>
                <p className="text-[13px] text-smoke">{future ? 'Target' : live ? 'Views so far' : 'Views'}</p>
                <p className="text-xl font-extrabold tabular-nums text-ink">{future ? (r.target != null ? views(r.target) : 'Not set') : views(r.achieved)}</p>
              </div>
              {!future && r.target != null && (
                <p className="text-right text-[13px] text-smoke">of {views(r.target)}<span className="block font-semibold text-ink">{pct(r.pct, 1)}</span></p>
              )}
            </div>
            {!future && <ProgressBar className="mt-2" value={r.achieved} projected={live ? r.projected : null} target={r.target} expected={live && r.target ? r.target * r.share : null} />}
            {live && <p className="mt-1.5 text-[13px] text-smoke">On pace for <span className="font-semibold text-ink">{views(r.projected)}</span> ({pct(r.projectedPct)})</p>}
            <dl className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-sm">
              {[
                ['Earnings', r.actualEarnings, r.estEarnings],
                ['Costs', r.actualCost, r.estCost],
                ['Margin', r.actualMargin, r.estMargin],
              ].map(([label, a, e]) => (
                <div key={label} className={cx('flex items-baseline justify-between gap-2', label === 'Margin' && 'font-semibold')}>
                  <dt className="text-smoke">{label}</dt>
                  <dd className="tabular-nums text-ink">
                    {future ? <span className="text-smoke">plan {eur(e)}</span> : <>{eur(a)} <span className="text-[13px] font-normal text-smoke">plan {eur(e)}</span></>}
                  </dd>
                </div>
              ))}
            </dl>
            {onEdit && (
              <button type="button" onClick={() => onEdit(r.key)} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-brand">
                <Icon name="pencil" className="h-3.5 w-3.5" />Edit this month
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
