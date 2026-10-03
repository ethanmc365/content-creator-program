import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { CountUp } from '../network/Motion'
import { TargetBar } from './parts'
import { TrendCard } from './adminC'
import { cx, formatDate } from '../../lib/utils'
import { money, nf, useOptionalRpc } from '../../lib/vip'
import { useT } from '../../lib/i18n'

// THE VIP'S OWN SIDE, ADDED IN THE SECOND PASS (30 Sep 2026, migration 298): what the team has said, and how they are doing.

/** What the team has told the VIPs. Pinned first, three at most; draws nothing when there is nothing (or no table yet). */
export function VipAnnouncements({ programmeId }) {
  const tr = useT()
  const [rows, setRows] = useState([])
  useEffect(() => {
    let alive = true
    supabase.from('vip_announcements').select('*').eq('programme_id', programmeId)
      .order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(3)
      .then(({ data, error }) => { if (alive && !error) setRows(data || []) })
    return () => { alive = false }
  }, [programmeId])
  if (rows.length === 0) return null
  return (
    <section className="space-y-3" aria-label={tr('From the team')}>
      {rows.map((a, i) => <AnnouncementCard key={a.id} a={a} delay={i * 60} />)}
    </section>
  )
}

/** One announcement as a VIP sees it. The team's composer draws the same card as its live preview. */
export function AnnouncementCard({ a, delay = 0, preview = false }) {
  const tr = useT()
  return (
    <article className={cx('rounded-card border p-4 shadow-card animate-rise sm:p-5', a.pinned ? 'border-brand/25 bg-brand-tint/60' : 'border-gray-100 bg-white')} style={{ animationDelay: `${delay}ms` }}>
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-brand"><Icon name="megaphone" className="h-3.5 w-3.5" />{a.pinned ? tr('Pinned by the team') : tr('From the team')}<span className="font-medium normal-case tracking-normal text-gray-400">· {preview ? tr('just now') : formatDate(a.created_at)}</span></p>
      <h3 className={cx('mt-1.5 break-words text-[15px] font-bold', a.title ? 'text-ink' : 'text-gray-300')}>{a.title || tr('Your title')}</h3>
      <p className={cx('mt-1 whitespace-pre-line break-words text-sm leading-relaxed', a.body ? 'text-smoke' : 'text-gray-300')}>{a.body || tr('Your message to every VIP appears here.')}</p>
    </article>
  )
}

const LADDER = [10000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000]

/** Lifetime numbers, a streak, the next milestone, and the last weeks as a chart. */
export function VipStats({ overview, rules, programmeId }) {
  const tr = useT()
  const cur = overview.programme.currency
  const life = overview.lifetime || { views: 0, videos: 0, best_month: 0 }
  const { data: mine } = useOptionalRpc('vip_my_trends', { p_days: 30 }, programmeId)
  // the team's own milestone rules first (they may pay for them); the round-number ladder otherwise
  const ruleSteps = (rules || []).filter((r) => r.kind === 'milestone' && (r.conditions?.metric || 'lifetime_views') === 'lifetime_views').map((r) => Number(r.conditions?.threshold)).filter((n) => n > 0)
  const steps = (ruleSteps.length ? ruleSteps : LADDER).sort((a, b) => a - b)
  const next = steps.find((n) => n > life.views)
  // The best month's VIEWS, if the overview carries them; otherwise worked back from its pay at the creator's rate.
  const bestMonthViews = Number(life.best_month_views) || (Number(life.best_month) > 0 && Number(overview.stats?.effective_cpm) > 0
    ? Math.round((Number(life.best_month) / Number(overview.stats.effective_cpm)) * 1000) : 0)
  const tiles = [
    { label: tr('Views as a VIP'), value: life.views, format: nf, icon: 'eye' },
    { label: tr('Videos'), value: life.videos, format: nf, icon: 'video' },
    { label: tr('Best month'), value: Number(life.best_month), format: (n) => money(n, cur, { cents: false }), icon: 'trophy' },
    { label: tr('Months in a row'), value: mine?.streak_months ?? 0, format: nf, icon: 'fire' },
  ]
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <div key={t.label} className="rounded-card border border-gray-100 bg-white px-4 py-3.5 shadow-card animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
            <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-400"><Icon name={t.icon} className="h-3.5 w-3.5 text-brand" />{t.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-brand"><CountUp value={t.value} format={t.format} /></p>
          </div>
        ))}
      </div>
      {/* TWO BARS, NOT ONE (1 Oct 2026): the next milestone over all time, and this month against the creator's own best
          month, so there is always something close enough to chase. */}
      <section className="grid gap-5 rounded-card border border-gray-100 bg-white p-5 shadow-card animate-rise sm:grid-cols-2">
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="flag" className="h-5 w-5 text-brand" />{tr('Your next milestone')}</h2>
          {next ? <TargetBar label={tr('{n} views as a VIP', { n: nf(next) })} value={life.views} target={next} />
            : <p className="text-sm text-smoke">{tr('You have passed every milestone. Remarkable.')}</p>}
        </div>
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="fire" className="h-5 w-5 text-brand" />{tr('This month against your best')}</h2>
          {bestMonthViews > 0
            ? <TargetBar label={tr('Views this month')} value={Number(overview.stats?.views) || 0} target={bestMonthViews} done={tr('A new best month')} />
            : <TargetBar label={tr('Views this month')} value={Number(overview.stats?.views) || 0} target={Math.max(10000, next || 10000)} />}
        </div>
      </section>
      <TrendCard programmeId={programmeId} mine since={overview.member?.joined_on} title={tr('Your views, day by day')} />
    </div>
  )
}
