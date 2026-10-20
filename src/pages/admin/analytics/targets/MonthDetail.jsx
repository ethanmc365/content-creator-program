import { Modal } from '../../../../components/ui'
import Icon from '../../../../components/Icon'
import { cx, formatViews } from '../../../../lib/utils'
import { ProgressBar, StatusChip, eur, pct, views } from './parts'

// ONE MONTH, IN FULL: views against target for each side, the money line by line (what each challenge cost this month,
// the other rewards, VIP and official pay, other costs), and the plan's own numbers beside them.
export default function MonthDetail({ monthKey, seg, segRows, costMode, onClose, onEdit }) {
  const pick = (list) => list.find((r) => r.key === monthKey)
  const c = pick(segRows.community)
  const v = pick(segRows.vip)
  const all = pick(segRows.all)
  const head = seg === 'community' ? c : seg === 'vip' ? v : all
  if (!head) return null
  const live = head.state === 'live'
  const future = head.state === 'future'
  const sides = seg === 'all' ? [['Community', c, 'community'], ['VIP', v, 'vip']] : [[seg === 'vip' ? 'VIP' : 'Community', head, seg]]
  return (
    <Modal open onClose={onClose} title={head.longLabel} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {future ? <span className="rounded-full bg-cloud px-2.5 py-0.5 text-[13px] font-semibold text-smoke">Upcoming</span> : <StatusChip status={head.status} live={live} />}
          <span className="text-[13px] text-smoke">
            {live ? `In progress: day ${Math.floor(head.elapsed) + 1} of ${head.days}. Figures are so far, with the pace they set.` : future ? 'Not started. The plan only.' : 'Complete. These are the final figures.'}
          </span>
        </div>

        {sides.map(([label, r, key], i) => (
          <section key={key} className="animate-rise rounded-2xl border border-gray-100 p-4" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[15px] font-bold text-ink">{label}</h4>
              <button type="button" onClick={() => onEdit(key)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand transition-transform hoverable:hover:translate-x-0.5">
                <Icon name="pencil" className="h-3.5 w-3.5" />Edit this month&apos;s plan
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Fig label={live ? 'Views so far' : 'Views'} value={r.achieved != null ? views(r.achieved) : '-'} sub={r.source === 'override' ? `Set by hand (platform: ${views(r.measured)})` : r.source === 'sheet' ? 'From the team sheet' : null} />
              <Fig label="Target" value={r.target != null ? views(r.target) : 'Not set'} sub={r.pct != null ? `${pct(r.pct, 1)} reached` : null} />
              {live && <Fig label="On pace for" value={views(r.projected)} sub={r.projectedPct != null ? `${pct(r.projectedPct)} of target` : null} />}
              {live && <Fig label="Needed a day" value={r.neededPerDay != null ? formatViews(r.neededPerDay) : '-'} sub={`Doing ${formatViews(r.perDay)} a day`} />}
              {!live && <Fig label="Videos" value={r.videos ?? '-'} sub={r.creators != null ? `${r.creators} creators gaining views` : null} />}
              {!live && <Fig label="Cost per 1,000" value={r.actualCpm != null ? eur(r.actualCpm, true) : '-'} sub={`Target ${eur(r.cpm, true)}`} />}
            </div>
            {!future && <ProgressBar className="mt-3" value={r.achieved} projected={live ? r.projected : null} target={r.target} expected={live && r.target ? r.target * r.share : null} />}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[13px] font-bold text-gray-500">Money</p>
                <Row label="Earnings" plan={r.estEarnings} actual={r.actualEarnings} pace={live ? r.projectedEarnings : null} />
                <Row label={costMode === 'target' ? 'Costs (at target CPM)' : 'Costs'} plan={r.estCost} actual={r.actualCost} pace={live ? r.projectedCost : null} />
                <Row label="Margin" plan={r.estMargin} actual={r.actualMargin} pace={live ? r.projectedMargin : null} strong />
                <p className="mt-1.5 text-[13px] text-smoke">EPM {eur(r.epm, true)} · target CPM {eur(r.cpm, true)}</p>
              </div>
              <div>
                <p className="mb-1.5 text-[13px] font-bold text-gray-500">Real costs{live ? ' so far' : ''}</p>
                {future ? <p className="text-sm text-smoke">Nothing spent yet.</p> : <CostLines r={r} seg={key} />}
              </div>
            </div>
            {r.note && <p className="mt-3 rounded-xl bg-cloud px-3 py-2 text-[13px] text-smoke"><span className="font-semibold text-ink">Note:</span> {r.note}</p>}
          </section>
        ))}
      </div>
    </Modal>
  )
}

function Fig({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-cloud/70 px-3 py-2.5">
      <p className="text-[13px] font-medium text-smoke">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-ink">{value}</p>
      {sub && <p className="text-[13px] text-smoke">{sub}</p>}
    </div>
  )
}
function Row({ label, plan, actual, pace, strong }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3 border-b border-gray-50 py-1.5 text-sm', strong && 'font-semibold')}>
      <span className="text-smoke">{label}</span>
      <span className="text-right tabular-nums">
        <span className={cx('text-ink', actual != null && actual < 0 && 'text-red-600')}>{actual != null ? eur(actual) : '-'}</span>
        <span className="ml-2 text-[13px] font-normal text-smoke">plan {eur(plan)}</span>
        {pace != null && <span className="block text-[13px] font-normal text-smoke">pace {eur(pace)}</span>}
      </span>
    </div>
  )
}
function CostLines({ r, seg }) {
  const lines = []
  if (seg === 'community') {
    for (const l of r.costs?.lines || []) {
      lines.push({ k: l.id, label: l.title, sub: `${pct(l.share)} of its prize money falls in this month${l.planned ? ' · draft' : ''}${l.market ? ` · ${l.market}` : ''}`, n: l.amount })
    }
    if (r.costs?.rewards) lines.push({ k: 'rewards', label: 'Other rewards', sub: 'Milestones, referrals and weekly prizes', n: r.costs.rewards })
  } else {
    if (r.costs?.vip) lines.push({ k: 'vip', label: 'VIP pay', sub: r.costs.source === 'sheet' ? 'From the team sheet' : r.costs.live ? 'Live month, so far' : 'Closed statements', n: r.costs.vip })
    if (r.costs?.official) lines.push({ k: 'official', label: 'Official creators pay', sub: r.costs.live ? 'Live month, so far' : 'Closed statements', n: r.costs.official })
  }
  if (r.otherCosts) lines.push({ k: 'other', label: 'Other costs', sub: 'Added to the plan', n: r.otherCosts })
  const total = lines.reduce((n, l) => n + l.n, 0)
  if (!lines.length) return <p className="text-sm text-smoke">Nothing recorded.</p>
  return (
    <ul className="space-y-1.5">
      {lines.map((l) => (
        <li key={l.k} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{l.label}</span>
            <span className="block text-[13px] text-smoke">{l.sub}</span>
          </span>
          <span className="shrink-0 tabular-nums text-ink">{eur(l.n)}</span>
        </li>
      ))}
      <li className="flex justify-between border-t border-gray-100 pt-1.5 text-sm font-bold"><span>Total</span><span className="tabular-nums">{eur(total)}</span></li>
    </ul>
  )
}
