import { useState } from 'react'
import { Modal } from '../../../../components/ui'
import Icon from '../../../../components/Icon'
import { cx, formatViews } from '../../../../lib/utils'
import { ProgressBar, Segmented, StatusChip, eur, pct, views } from './parts'

// ONE MONTH, IN FULL (rebuilt 20 Oct 2026). Three blocks, each answering one question: how are the VIEWS doing against
// this month's target, what did the MONEY do against the plan (plan, actual, heading for), and WHERE it went line by
// line. Combined opens on both sides added together, with Community and VIP one tap away. What each figure means is said
// once, in plain words, under the block it belongs to.
export default function MonthDetail({ monthKey, seg, segRows, onClose, onEdit }) {
  const [side, setSide] = useState(seg)
  const pick = (list) => list.find((r) => r.key === monthKey)
  const r = pick(segRows[side])
  if (!r) return null
  const live = r.state === 'live'
  const future = r.state === 'future'
  const expected = live && r.target ? r.target * r.share : null
  return (
    <Modal open onClose={onClose} title={r.longLabel} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {future ? <span className="rounded-full bg-cloud px-2.5 py-0.5 text-[13px] font-semibold text-smoke">Upcoming</span> : <StatusChip status={r.status} live={live} />}
            <span className="text-[13px] text-smoke">{live ? `Day ${Math.floor(r.elapsed) + 1} of ${r.days}, figures so far` : future ? 'Not started: the plan only' : 'Complete: final figures'}</span>
          </div>
          {seg === 'all' && <Segmented size="sm" value={side} onChange={setSide} options={[{ key: 'all', label: 'Combined' }, { key: 'community', label: 'Community' }, { key: 'vip', label: 'VIP' }]} />}
        </div>

        {/* ---- VIEWS ---- */}
        <section key={`v-${side}`} className="animate-rise rounded-2xl bg-gradient-to-br from-brand to-brand-light p-5 text-white">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[13px] font-medium text-white/80">{future ? 'Target' : live ? 'Views so far' : 'Views'}</p>
              <p className="text-3xl font-extrabold tabular-nums sm:text-4xl">{future ? views(r.target) : views(r.achieved)}</p>
            </div>
            {!future && (
              <div className="text-right">
                <p className="text-[13px] font-medium text-white/80">Target</p>
                <p className="text-xl font-bold tabular-nums">{r.target != null ? views(r.target) : 'Not set'}</p>
              </div>
            )}
          </div>
          {!future && <ProgressBar className="mt-4" dark value={r.achieved} projected={live ? r.projected : null} target={r.target} expected={expected} />}
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {future ? (
              <>
                <Stat label="A day" value={formatViews(r.target / r.days)} />
                <Stat label="Days" value={r.days} />
              </>
            ) : (
              <>
                <Stat label="Of the target" value={r.pct != null ? pct(r.pct, 1) : '-'} />
                {live ? <Stat label="On pace for" value={views(r.projected)} /> : <Stat label="Videos" value={r.videos ?? '-'} />}
                {live ? <Stat label="Needed a day" value={r.neededPerDay != null ? formatViews(r.neededPerDay) : '-'} /> : <Stat label="Creators" value={r.creators ?? '-'} />}
                <Stat label="A day" value={r.perDay != null ? formatViews(r.perDay) : '-'} />
              </>
            )}
          </div>
          {!future && (r.offPlatform > 0 || r.source === 'sheet') && (
            <p className="mt-3 text-[13px] text-white/80">{r.source === 'sheet' ? 'From the VIP sheet.' : `Includes ${formatViews(r.offPlatform)} from challenges run off the platform.`}</p>
          )}
        </section>

        {/* ---- MONEY: plan against actual ---- */}
        <section key={`m-${side}`} className="animate-rise rounded-2xl border border-gray-100" style={{ animationDelay: '60ms' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[13px] text-smoke">
                <th className="px-4 py-2.5 text-left font-semibold">Money</th>
                <th className="px-3 py-2.5 text-right font-semibold">Plan</th>
                {!future && <th className="px-3 py-2.5 text-right font-semibold">{live ? 'So far' : 'Actual'}</th>}
                {live && <th className="px-4 py-2.5 text-right font-semibold">Heading for</th>}
              </tr>
            </thead>
            <tbody>
              <MoneyRow label="Earnings" plan={r.estEarnings} actual={r.actualEarnings} pace={r.projectedEarnings} future={future} live={live} />
              <MoneyRow label="Costs" plan={r.estCost} actual={r.actualCost} pace={r.projectedCost} future={future} live={live} />
              <MoneyRow label="Margin" plan={r.estMargin} actual={r.actualMargin} pace={r.projectedMargin} future={future} live={live} strong />
              <tr className="border-t border-gray-100">
                <td className="px-4 py-2.5 text-smoke">Cost per 1,000 views</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-smoke">{eur(r.cpm, true)}</td>
                {!future && <td className="px-3 py-2.5 text-right tabular-nums text-ink">{r.actualCpm != null ? eur(r.actualCpm, true) : '-'}</td>}
                {live && <td />}
              </tr>
            </tbody>
          </table>
          <p className="border-t border-gray-100 px-4 py-2.5 text-[13px] leading-relaxed text-smoke">
            Earnings are views ÷ 1,000 × the EPM ({eur(r.epm, true)}, what 1,000 views are worth to Tryp.com). The plan&apos;s costs
            are the target × the target CPM ({eur(r.cpm, true)}); actual costs are what was really spent, below.
          </p>
        </section>

        {/* ---- WHERE THE MONEY WENT ---- */}
        <section key={`c-${side}`} className="animate-rise rounded-2xl border border-gray-100 p-4" style={{ animationDelay: '120ms' }}>
          <p className="mb-2 text-sm font-bold text-ink">Where the money went{live ? ' so far' : ''}</p>
          {side === 'all'
            ? <AllLines c={pick(segRows.community)} v={pick(segRows.vip)} />
            : <CostLines r={r} seg={side} />}
        </section>

        {r.note && <p className="rounded-xl bg-cloud px-3.5 py-2.5 text-[13px] text-smoke"><span className="font-semibold text-ink">Note:</span> {r.note}</p>}

        {side !== 'all' && (
          <button type="button" onClick={() => onEdit(side)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand transition-transform hoverable:hover:translate-x-0.5">
            <Icon name="sliders" className="h-4 w-4" />Change this month&apos;s target
          </button>
        )}
      </div>
    </Modal>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-white/15 px-3 py-2">
      <p className="text-[13px] text-white/80">{label}</p>
      <p className="text-base font-bold tabular-nums">{value}</p>
    </div>
  )
}
function MoneyRow({ label, plan, actual, pace, future, live, strong }) {
  const tone = (n) => (n != null && n < 0 ? 'text-red-600' : 'text-ink')
  return (
    <tr className={cx('border-t border-gray-100', strong && 'font-bold')}>
      <td className={cx('px-4 py-2.5', strong ? 'text-ink' : 'text-smoke')}>{label}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-smoke">{eur(plan)}</td>
      {!future && <td className={cx('px-3 py-2.5 text-right tabular-nums', tone(actual))}>{actual != null ? eur(actual) : '-'}</td>}
      {live && <td className={cx('px-4 py-2.5 text-right tabular-nums', tone(pace))}>{pace != null ? eur(pace) : '-'}</td>}
    </tr>
  )
}
function Lines({ lines }) {
  const total = lines.reduce((n, l) => n + l.n, 0)
  if (!lines.length) return <p className="text-sm text-smoke">Nothing spent yet.</p>
  return (
    <ul className="space-y-2">
      {lines.map((l) => (
        <li key={l.k} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{l.label}</span>
            {l.sub && <span className="block text-[13px] text-smoke">{l.sub}</span>}
          </span>
          <span className="shrink-0 tabular-nums text-ink">{eur(l.n)}</span>
        </li>
      ))}
      <li className="flex justify-between border-t border-gray-100 pt-2 text-sm font-bold"><span>Total</span><span className="tabular-nums">{eur(total)}</span></li>
    </ul>
  )
}
function linesFor(r, seg) {
  const lines = []
  if (seg === 'community') {
    for (const l of r.costs?.lines || []) {
      const bits = [l.share < 0.995 ? `${pct(l.share)} of its prize money is this month` : null, l.planned ? 'draft' : null, l.status === 'imported' ? 'ran off the platform' : null, l.market].filter(Boolean)
      lines.push({ k: l.id, label: l.title, sub: bits.join(' · '), n: l.amount })
    }
    if (r.costs?.rewards) lines.push({ k: 'rewards', label: 'Other rewards', sub: 'Milestones, referrals and weekly prizes', n: r.costs.rewards })
  } else {
    if (r.costs?.vip) lines.push({ k: 'vip', label: 'VIP pay', sub: r.costs.source === 'sheet' ? 'From the VIP sheet' : r.costs.live ? 'This month, so far' : 'Closed statements', n: r.costs.vip })
    if (r.costs?.official) lines.push({ k: 'official', label: 'Official creators pay', sub: r.costs.live ? 'This month, so far' : 'Closed statements', n: r.costs.official })
  }
  if (r.otherCosts) lines.push({ k: 'other', label: 'Other costs', sub: null, n: r.otherCosts })
  return lines
}
function CostLines({ r, seg }) { return <Lines lines={linesFor(r, seg)} /> }
function AllLines({ c, v }) {
  const lines = [
    ...linesFor(c, 'community').map((l) => ({ ...l, k: `c-${l.k}`, sub: ['Community', l.sub].filter(Boolean).join(' · ') })),
    ...linesFor(v, 'vip').map((l) => ({ ...l, k: `v-${l.k}` })),
  ]
  return <Lines lines={lines} />
}
