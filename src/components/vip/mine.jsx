import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { CountUp } from '../network/Motion'
import { TargetBar } from './parts'
import { TrendCard } from './adminC'
import { cx, formatDate } from '../../lib/utils'
import { metricAmount, money, nf, useOptionalRpc } from '../../lib/vip'
import { useT } from '../../lib/i18n'

// THE VIP'S OWN SIDE, ADDED IN THE SECOND PASS (30 Sep 2026, migration 298): what the team has said, and how they are doing.

/** What the team has told the VIPs. Pinned first, three at most; draws nothing when there is nothing (or no table yet). */
export function VipAnnouncements({ programmeId }) {
  const tr = useT()
  const [rows, setRows] = useState([])
  useEffect(() => {
    let alive = true
    supabase.from('vip_announcements').select('*').eq('programme_id', programmeId)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
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
  // A PINNED NOTE GLOWS (3 Oct 2026). Ethan, on the preview: "don't like the colour ... maybe have a nice gradient or
  // something, still make it stand out, maybe it can glow." Pinned is the brand gradient with a soft orange halo and one
  // pass of light; an unpinned note is a plain white card.
  if (a.pinned) {
    return (
      <article className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand via-brand to-brand-light p-4 text-white shadow-[0_10px_34px_-10px_rgba(217,68,7,0.65)] ring-1 ring-white/20 animate-rise sm:p-5" style={{ animationDelay: `${delay}ms` }}>
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
        <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-0" />
        <p className="relative flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-white/85"><Icon name="megaphone" className="h-3.5 w-3.5" />{tr('From the team')}<span className="font-medium normal-case tracking-normal text-white/70">· {preview ? tr('just now') : formatDate(a.created_at)}</span></p>
        {(a.title || preview) && <h3 className={cx('relative mt-1.5 break-words text-[15px] font-bold', a.title ? 'text-white' : 'text-white/50')}>{a.title || tr('Your title')}</h3>}
        <p className={cx('relative mt-1 whitespace-pre-line break-words text-sm leading-relaxed', a.body ? 'text-white/95' : 'text-white/55')}>{a.body || tr('Your message to every VIP appears here.')}</p>
      </article>
    )
  }
  return (
    <article className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise sm:p-5" style={{ animationDelay: `${delay}ms` }}>
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-brand"><Icon name="megaphone" className="h-3.5 w-3.5" />{tr('From the team')}<span className="font-medium normal-case tracking-normal text-gray-400">· {preview ? tr('just now') : formatDate(a.created_at)}</span></p>
      {(a.title || preview) && <h3 className={cx('mt-1.5 break-words text-[15px] font-bold', a.title ? 'text-ink' : 'text-gray-300')}>{a.title || tr('Your title')}</h3>}
      <p className={cx('mt-1 whitespace-pre-line break-words text-sm leading-relaxed', a.body ? 'text-smoke' : 'text-gray-300')}>{a.body || tr('Your message to every VIP appears here.')}</p>
    </article>
  )
}

const LADDER = [10000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000]

// Where a creator stands on each thing a milestone can measure (migration 322 added most of these).
function milestoneValue(metric, { life, stats, videos, mine, joined, earnedTotal }) {
  switch (metric) {
    case 'lifetime_views': return life.views
    case 'lifetime_videos': return life.videos
    case 'month_views': return Number(stats?.views) || 0
    case 'month_videos': return Number(stats?.videos) || 0
    case 'month_earnings': return Number(stats?.base) || 0
    case 'lifetime_earnings': return earnedTotal
    case 'best_video_views': return Math.max(0, ...(videos || []).filter((v) => v.status === 'tracking').map((v) => Number(v.views_total) || 0))
    case 'streak_months': return Number(mine?.streak_months) || 0
    case 'months_active': return joined ? Math.max(0, Math.floor((Date.now() - new Date(joined).getTime()) / (30.4375 * 86400000))) : 0
    default: return 0
  }
}

/** Lifetime numbers, the next milestone the team has set, this month against the best one, and the last weeks as a chart. */
export function VipStats({ overview, rules, programmeId }) {
  const tr = useT()
  const cur = overview.programme.currency
  const life = overview.lifetime || { views: 0, videos: 0, best_month: 0 }
  const { data: mine } = useOptionalRpc('vip_my_trends', { p_days: 30 }, programmeId)
  const { data: wallet } = useOptionalRpc('vip_my_wallet')
  const ctx = {
    life, stats: overview.stats, videos: overview.videos, mine, joined: overview.member?.joined_on,
    earnedTotal: (Number(wallet?.lifetime_earned) || 0) + (Number(overview.stats?.base) || 0),
  }
  // THE TEAM'S MILESTONES FIRST (4 Oct 2026). Ethan: "if there's a milestone set up, then it will show the next milestone being
  // reached." Every milestone rule the team is running is measured on its own number; the nearest one still to reach is the
  // headline and the rest wait underneath. No rules at all: the round-number ladder on total views, as before.
  const set = (rules || [])
    .filter((r) => r.kind === 'milestone' && r.active !== false && Number(r.conditions?.threshold) > 0)
    .map((r) => {
      const metric = r.conditions?.metric || 'lifetime_views'
      const target = Number(r.conditions.threshold)
      const value = milestoneValue(metric, ctx)
      return { id: r.id, rule: r, metric, target, value, pct: Math.min(1, value / target), reached: value >= target }
    })
  const ahead = set.filter((m) => !m.reached).sort((a, b) => b.pct - a.pct)
  const reachedCount = set.length - ahead.length
  const ladderNext = LADDER.find((n) => n > life.views)
  const next = ahead[0] || null
  // The best month's VIEWS, if the overview carries them; otherwise worked back from its pay at the creator's rate.
  const bestMonthViews = Number(life.best_month_views) || (Number(life.best_month) > 0 && Number(overview.stats?.effective_cpm) > 0
    ? Math.round((Number(life.best_month) / Number(overview.stats.effective_cpm)) * 1000) : 0)
  const tiles = [
    { label: tr('Views as a VIP'), value: life.views, format: nf, icon: 'eye' },
    { label: tr('Videos'), value: life.videos, format: nf, icon: 'video' },
    { label: tr('Best month'), value: Number(life.best_month), format: (n) => money(n, cur, { cents: false }), icon: 'trophy' },
    { label: tr('Months in a row'), value: mine?.streak_months ?? 0, format: nf, icon: 'fire' },
  ]
  const rewardOf = (r) => (Number(r.amount) > 0 ? (r.reward === 'voucher' ? tr('a {a} voucher', { a: money(r.amount, cur, { cents: false }) }) : money(r.amount, cur, { cents: false })) : null)
  return (
    <div className="vip-stage space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-card border border-gray-100 bg-white px-4 py-3.5 shadow-card">
            <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-400"><Icon name={t.icon} className="h-3.5 w-3.5 text-brand" />{t.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-brand"><CountUp value={t.value} format={t.format} /></p>
          </div>
        ))}
      </div>
      <section className="grid gap-5 rounded-card border border-gray-100 bg-white p-5 shadow-card sm:grid-cols-2">
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="flag" className="h-5 w-5 text-brand" />{tr('Your next milestone')}</h2>
          {next ? (
            <>
              <TargetBar label={metricAmount(next.metric, next.target, tr, cur)} value={next.value} target={next.target} format={next.metric.endsWith('earnings') ? (n) => money(n, cur, { cents: false }) : nf} />
              {rewardOf(next.rule) && <p className="mt-2 text-xs font-semibold text-brand">{tr('Reach it and earn {p}', { p: rewardOf(next.rule) })}</p>}
              {ahead.length > 1 && (
                <ul className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
                  {ahead.slice(1, 4).map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-smoke">{metricAmount(m.metric, m.target, tr, cur)}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-ink">{Math.round(m.pct * 100)}%{rewardOf(m.rule) ? <span className="ml-2 font-medium text-brand">{rewardOf(m.rule)}</span> : null}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : set.length > 0 ? (
            <p className="text-sm text-smoke">{tr('You have reached all {n} milestones the team has set. Remarkable.', { n: reachedCount })}</p>
          ) : ladderNext ? (
            <TargetBar label={tr('{n} views as a VIP', { n: nf(ladderNext) })} value={life.views} target={ladderNext} />
          ) : <p className="text-sm text-smoke">{tr('You have passed every milestone. Remarkable.')}</p>}
        </div>
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="fire" className="h-5 w-5 text-brand" />{tr('This month against your best')}</h2>
          {bestMonthViews > 0
            ? <TargetBar label={tr('Views this month')} value={Number(overview.stats?.views) || 0} target={bestMonthViews} done={tr('A new best month')} />
            : <TargetBar label={tr('Views this month')} value={Number(overview.stats?.views) || 0} target={Math.max(10000, ladderNext || 10000)} />}
        </div>
      </section>
      <TrendCard programmeId={programmeId} mine since={overview.member?.joined_on} title={tr('Your views, day by day')} refreshKey={(overview.videos || []).reduce((a, v) => a + (Number(v.views_total) || 0), 0)} />
    </div>
  )
}
