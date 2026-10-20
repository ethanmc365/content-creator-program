import { useEffect, useState } from 'react'
import { teamApi } from '../../../api/team'
import { convert, FALLBACK_RATES } from '../../../lib/programme'
import { challengeProfit, planOf } from '../../../lib/cccTargets'
import { cx } from '../../../lib/utils'

// WHAT A CHALLENGE MADE OR LOST FOR TRYP.COM (20 Oct 2026). Ethan: "see the results in terms of profits or losses for
// tryp.com for specific challenges". The same sum as Targets & profit, for one challenge: its views x the community EPM
// (what 1,000 views are worth to Tryp.com, from the growth plan) minus what it really cost (prize pot or what was paid,
// plus vouchers). One small read of the plan, shared by every card on the page.
let epmPromise = null
function loadEpm() {
  if (!epmPromise) {
    epmPromise = Promise.resolve(teamApi.cccPlans().select('*'))
      .then(({ data }) => planOf(data || [], 'community').epm)
      .catch(() => { epmPromise = null; return planOf([], 'community').epm })
  }
  return epmPromise
}
export function useCommunityEpm() {
  const [epm, setEpm] = useState(null)
  useEffect(() => { let alive = true; loadEpm().then((v) => alive && setEpm(v)); return () => { alive = false } }, [])
  return epm
}

const fmt = (n, currency) => {
  const abs = Math.abs(n)
  const s = abs.toLocaleString('en-GB', { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0 })
  return `${n < 0 ? '-' : '+'}${s}`
}

/** One line: profit or loss, the margin, and the sum behind it. `live` says "so far". */
export function ProfitLine({ views, spend, currency = 'EUR', live = false, className }) {
  const epmEur = useCommunityEpm()
  if (epmEur == null || !(views > 0)) return null
  const epm = currency === 'EUR' ? epmEur : (convert(epmEur, 'EUR', currency, FALLBACK_RATES) || epmEur)
  const p = challengeProfit({ views, spend }, epm)
  const good = p.profit >= 0
  const money = (n) => Math.round(n).toLocaleString('en-GB', { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0 })
  return (
    <div className={cx('flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl px-3.5 py-2.5', good ? 'bg-emerald-50' : 'bg-red-50', className)}>
      <span className="flex items-baseline gap-2">
        <span className={cx('text-lg font-extrabold tabular-nums', good ? 'text-emerald-700' : 'text-red-600')}>{fmt(p.profit, currency)}</span>
        <span className={cx('text-[13px] font-semibold', good ? 'text-emerald-700' : 'text-red-600')}>{good ? 'profit' : 'loss'} for Tryp.com{live ? ' so far' : ''}</span>
      </span>
      <span className="text-[13px] tabular-nums text-smoke">
        {money(p.earnings)} earned − {money(spend || 0)} spent{p.margin != null && p.margin > -1 ? ` · ${Math.round(p.margin * 100)}% margin` : ''}
      </span>
    </div>
  )
}
