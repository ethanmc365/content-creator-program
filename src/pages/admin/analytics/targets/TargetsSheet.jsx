import { Fragment, useEffect, useRef } from 'react'
import Icon from '../../../../components/Icon'
import { growth } from '../../../../lib/cccTargets'
import { cx } from '../../../../lib/utils'
import { Card, ProgressBar, StatusChip, eur, pct, signedPct, views } from './parts'

// THE SHEET, REDRAWN. The team's own layout (months across the top, figures down the side) so it reads the way the
// spreadsheet did, with the month in progress lit, finished months marked hit or missed, and every cell coloured by
// how it did. The first column stays put while the months scroll sideways on a phone.
export default function TargetsSheet({ rows, seg, onOpen, onEdit }) {
  const editable = seg !== 'all'
  const groups = [
    {
      title: 'Views',
      lines: [
        { label: 'View target', cell: (r) => (r.target != null ? views(r.target) : <span className="text-gray-300">Not set</span>), edit: true },
        { label: 'Achieved', cell: (r) => achievedCell(r), strong: true },
        { label: 'On pace for', cell: (r) => (r.state === 'live' ? views(r.projected) : r.state === 'done' ? <span className="text-gray-300">Final</span> : ''), only: 'live' },
        { label: '% of target', cell: (r) => pctCell(r) },
        { label: 'Gap to target', cell: (r) => gapCell(r) },
        { label: 'Target growth', cell: (r, i) => signedOrBlank(growth(r.target, rows[i - 1]?.target)) },
        { label: 'Actual growth', cell: (r, i) => signedOrBlank(r.state === 'future' ? null : growth(r.projected, rows[i - 1]?.projected)) },
      ],
    },
    {
      title: 'Rates',
      lines: [
        { label: 'EPM (earned per 1,000)', cell: (r) => eur(r.epm, true), edit: true },
        { label: 'Target CPM (cost per 1,000)', cell: (r) => eur(r.cpm, true), edit: true },
        { label: 'Actual CPM', cell: (r) => cpmCell(r) },
      ],
    },
    {
      title: 'Estimated, from the target',
      lines: [
        { label: 'Estimated earnings', cell: (r) => eur(r.estEarnings) },
        { label: 'Estimated costs', cell: (r) => eur(r.estCost) },
        { label: 'Estimated margin', cell: (r) => eur(r.estMargin), strong: true },
      ],
    },
    {
      title: 'Actual, from achieved views',
      lines: [
        { label: 'Actual earnings', cell: (r) => moneyCell(r.actualEarnings, r) },
        { label: 'Actual costs', cell: (r) => moneyCell(r.actualCost, r) },
        { label: 'Actual margin', cell: (r) => marginCell(r), strong: true },
        // A month in progress is judged on where its pace lands, not on two-thirds of a month against a whole one.
        { label: 'Margin vs estimate', cell: (r) => (r.actualMargin == null || r.estMargin == null ? ''
          : <Delta n={(r.state === 'live' ? r.projectedMargin : r.actualMargin) - r.estMargin} money hint={r.state === 'live' ? 'at pace' : null} />) },
      ],
    },
  ]
  return (
    <Card className="overflow-hidden" delay={200}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <div>
          <h3 className="text-[15px] font-bold text-ink">Month by month</h3>
          <p className="text-[13px] text-smoke">
            <span className="sm:hidden">Swipe through the months; tap one for the full picture.</span>
            <span className="max-sm:hidden">Click a month for the full picture{editable ? ', or a target to change it' : ''}. This month shows its figures so far.</span>
          </p>
        </div>
      </div>
      <MonthCards rows={rows} onOpen={onOpen} onEdit={editable ? onEdit : null} />
      <div className="scroll-edge-fade mt-3 hidden overflow-x-auto pb-2 sm:block">
        <table className="w-max min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 min-w-[11.5rem] border-b border-gray-100 bg-white px-4 py-2 sm:px-5" />
              {rows.map((r, i) => (
                <th key={r.key} className={cx('min-w-[7.5rem] border-b border-gray-100 px-2 py-2 text-right align-bottom', r.state === 'live' && 'bg-brand-tint/60')}>
                  <button type="button" onClick={() => onOpen(r.key)} className="group ml-auto flex animate-rise flex-col items-end gap-1" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                    <span className="flex items-center gap-1 text-sm font-bold text-ink transition-colors group-hover:text-brand">
                      {r.label}{r.suggested && <span title="Suggested starting plan" className="text-brand">*</span>}
                    </span>
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
                  <td className="sticky left-0 z-10 bg-cloud px-4 pb-1.5 pt-3 text-[13px] font-bold text-gray-500 sm:px-5">{g.title}</td>
                  <td colSpan={rows.length} className="bg-cloud" />
                </tr>
                {g.lines.filter((l) => !l.only || rows.some((r) => r.state === l.only)).map((l) => (
                  <tr key={l.label} className="group/row">
                    <td className={cx('sticky left-0 z-10 whitespace-nowrap border-b border-gray-50 bg-white px-4 py-2 sm:px-5 group-hover/row:bg-cloud', l.strong ? 'font-semibold text-ink' : 'text-smoke')}>{l.label}</td>
                    {rows.map((r, i) => (
                      <td key={r.key} className={cx('whitespace-nowrap border-b border-gray-50 px-2 py-2 text-right tabular-nums transition-colors group-hover/row:bg-cloud/70',
                        r.state === 'live' && 'bg-brand-tint/30', r.state === 'future' && 'text-gray-400', l.strong && 'font-bold text-ink')}>
                        {l.edit && editable ? (
                          <button type="button" onClick={() => onEdit(r.key)} title="Change the plan for this month"
                            className="group/edit inline-flex items-center gap-1 rounded-md px-1 transition-colors hoverable:hover:bg-brand-tint hoverable:hover:text-brand">
                            <Icon name="pencil" className="h-3 w-3 opacity-0 transition-opacity group-hover/edit:opacity-100" />
                            {l.cell(r, i)}
                          </button>
                        ) : l.cell(r, i)}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {rows.some((r) => r.suggested) && <p className="px-4 pb-4 text-[13px] text-smoke sm:px-5"><span className="text-brand">*</span> Suggested starting plan, not yet set by the team.</p>}
    </Card>
  )
}

function achievedCell(r) {
  if (r.state === 'future' || r.achieved == null) return ''
  return (
    <span className="inline-flex flex-col items-end">
      <span>{views(r.achieved)}</span>
      {r.state === 'live' && <span className="text-[13px] font-normal text-smoke">so far</span>}
      {r.source === 'override' && <span className="text-[13px] font-normal text-amber-600" title={`Platform measured ${views(r.measured)}`}>set by hand</span>}
      {r.source === 'sheet' && <span className="text-[13px] font-normal text-smoke">team sheet</span>}
    </span>
  )
}
function pctCell(r) {
  if (r.pct == null) return ''
  const shown = r.state === 'live' ? r.projectedPct : r.pct
  const tone = shown >= 1 ? 'text-emerald-600' : shown >= 0.9 ? 'text-amber-600' : 'text-red-600'
  return (
    <span className="inline-flex flex-col items-end">
      <span className={cx('font-semibold', r.state !== 'live' && tone)}>{pct(r.pct, 1)}</span>
      {r.state === 'live' && <span className={cx('text-[13px]', tone)}>pace {pct(r.projectedPct)}</span>}
    </span>
  )
}
function gapCell(r) {
  if (r.target == null || r.achieved == null) return ''
  const n = (r.state === 'live' ? r.projected : r.achieved) - r.target
  return <Delta n={n} hint={r.state === 'live' ? 'at pace' : null} />
}
function cpmCell(r) {
  if (r.actualCpm == null) return ''
  const over = r.actualCpm > r.cpm
  return <span className={over ? 'text-red-600' : 'text-emerald-600'}>{eur(r.actualCpm, true)}</span>
}
function moneyCell(n, r) {
  if (n == null) return ''
  return (
    <span className="inline-flex flex-col items-end">
      <span>{eur(n)}</span>
      {r.state === 'live' && <span className="text-[13px] font-normal text-smoke">so far</span>}
    </span>
  )
}
function marginCell(r) {
  if (r.actualMargin == null) return ''
  return (
    <span className="inline-flex flex-col items-end">
      <span className={r.actualMargin < 0 ? 'text-red-600' : undefined}>{eur(r.actualMargin)}</span>
      {r.state === 'live' && <span className="text-[13px] font-normal text-smoke">pace {eur(r.projectedMargin)}</span>}
    </span>
  )
}
function Delta({ n, money = false, hint }) {
  const up = n >= 0
  const text = money ? eur(Math.abs(n)) : views(Math.abs(n))
  return (
    <span className={cx('inline-flex flex-col items-end', up ? 'text-emerald-600' : 'text-red-600')}>
      <span>{up ? '+' : '-'}{text}</span>
      {hint && <span className="text-[13px] text-smoke">{hint}</span>}
    </span>
  )
}
const signedOrBlank = (f) => (f == null ? '' : <span className={f >= 0 ? 'text-ink' : 'text-red-600'}>{signedPct(f)}</span>)

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
              <span className="text-base font-bold text-ink">{r.longLabel}{r.suggested && <span className="text-brand">*</span>}</span>
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
                    {future ? <span className="text-smoke">plan {eur(e)}</span> : <>{eur(a)} <span className="text-[13px] font-normal text-smoke">/ {eur(e)}</span></>}
                  </dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-smoke">EPM / CPM</dt>
                <dd className="whitespace-nowrap tabular-nums text-ink">{eur(r.epm, true)} / {eur(r.cpm, true)}</dd>
              </div>
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
