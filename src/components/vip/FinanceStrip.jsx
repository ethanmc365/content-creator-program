import { useEffect, useMemo, useState } from 'react'
import { money, vipRpc } from '../../lib/vip'

// Shared live wallet totals for the VIP tools and the main analytics page.
export default function FinanceStrip({ programmeIds = null, market = null, currency = 'EUR', showEarned = true }) {
  const [state, setState] = useState({ key: '', rows: null })
  const [tick, setTick] = useState(0)
  const key = programmeIds ? [...programmeIds].sort().join('|') : `market:${market || 'all'}`
  useEffect(() => {
    let active = true
    const requests = programmeIds
      ? programmeIds.map((id) => vipRpc('vip_finance_summary', { p_programme: id }))
      : [vipRpc('vip_finance_summary', { p_market: market || null })]
    Promise.all(requests).then((data) => {
      if (active) setState({ key, rows: data.flatMap((d) => d?.rows || []) })
    }).catch(() => { if (active) setState({ key, rows: null }) })
    return () => { active = false }
  }, [key, market, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  // Read again when the tab comes back into view, never on a timer (the database rules: nothing new on a timer).
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') setTick((n) => n + 1) }
    document.addEventListener('visibilitychange', visible)
    return () => { document.removeEventListener('visibilitychange', visible) }
  }, [])
  const totals = useMemo(() => (state.rows || []).reduce((a, r) => ({
    earned: a.earned + Number(r.lifetime || 0),
    paid: a.paid + Number(r.paid_out || 0),
    balance: a.balance + Number(r.balance || 0),
    provisional: a.provisional + Number(r.provisional || 0),
  }), { earned: 0, paid: 0, balance: 0, provisional: 0 }), [state.rows])
  if (!state.rows || state.key !== key) return null
  return <section aria-label="Creator finances" className={`grid grid-cols-2 gap-2.5 ${showEarned ? 'sm:grid-cols-3' : ''}`}>
    {showEarned && <FinanceCard label="Earned all time" value={totals.earned} hint={`Includes ${money(totals.provisional, currency)} still counting this month`} featured currency={currency} />}
    <FinanceCard label="Paid or withdrawn" value={totals.paid} hint="Earlier payouts and wallet withdrawals" currency={currency} />
    <FinanceCard label="Available in balances" value={totals.balance} hint="Current creator wallet balances" currency={currency} />
  </section>
}
function FinanceCard({ label, value, hint, featured, currency }) {
  return <div className={`rounded-card p-4 shadow-card animate-rise ${featured ? 'col-span-2 bg-gradient-to-br from-brand to-brand-light text-white sm:col-span-1' : 'border border-orange-100 bg-white text-ink'}`}>
    <p className={`text-xs font-semibold ${featured ? 'text-white/85' : 'text-smoke'}`}>{label}</p>
    <p className="mt-1.5 text-xl font-extrabold tabular-nums sm:text-2xl">{money(value, currency)}</p>
    <p className={`mt-1 text-[11px] ${featured ? 'text-white/80' : 'text-smoke'}`}>{hint}</p>
  </div>
}
