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
      {rows.map((a, i) => (
        <article key={a.id} className={cx('rounded-card border p-4 shadow-card animate-fade-up sm:p-5', a.pinned ? 'border-brand/25 bg-brand-tint/60' : 'border-gray-100 bg-white')} style={{ animationDelay: `${i * 60}ms` }}>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-brand"><Icon name="megaphone" className="h-3.5 w-3.5" />{a.pinned ? tr('Pinned by the team') : tr('From the team')}<span className="font-medium normal-case tracking-normal text-gray-400">· {formatDate(a.created_at)}</span></p>
          <h3 className="mt-1.5 text-[15px] font-bold text-ink">{a.title}</h3>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-smoke">{a.body}</p>
        </article>
      ))}
    </section>
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
          <div key={t.label} className="rounded-card border border-gray-100 bg-white px-4 py-3.5 shadow-card animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-400"><Icon name={t.icon} className="h-3.5 w-3.5 text-brand" />{t.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-brand"><CountUp value={t.value} format={t.format} /></p>
          </div>
        ))}
      </div>
      {next ? (
        <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card animate-fade-up">
          <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="flag" className="h-5 w-5 text-brand" />{tr('Your next milestone')}</h2>
          <TargetBar label={tr('{n} views as a VIP', { n: nf(next) })} value={life.views} target={next} />
        </section>
      ) : null}
      <TrendCard programmeId={programmeId} mine title={tr('Your views, day by day')} />
    </div>
  )
}
