import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Reveal from '../network/Reveal'
import Icon from '../Icon'
import { CountUp } from '../network/Motion'
import { daysLeft, money, monthLabel, nf, useVipOverview } from '../../lib/vip'
import { useAuth } from '../../context/AuthContext'
import { useT } from '../../lib/i18n'
import { cx, formatViews } from '../../lib/utils'

// A VIP's own month on their Worldwide page (2 Oct 2026): what it has earned so far and a way in, under the
// community card.
// Nothing is drawn for anybody who is not a VIP, and nothing is fetched either.
export default function VipHomeCard({ delay = 0, inCard = false, className = '' }) {
  const tr = useT()
  const { profile, isAdmin } = useAuth()
  const on = !!profile?.is_vip && !isAdmin
  const { overview } = useVipOverview({ enabled: on })
  if (!on || !overview) return null
  const { stats, month, programme } = overview
  // INSIDE THE COMMUNITY CARD (3 Oct 2026). Ethan: "we have the Tryp.com Content Creator Community card, and then
  // below that we have a VIP card. I want them merged together ... so that everything is together and takes up less
  // space." So on the Worldwide page it is the foot of that card: a translucent band on the same orange, wiping in
  // after the card's own pieces, the way the global challenge strip does.
  // A FULL-WIDTH BAND, WITH THE PLANE FLYING ABOVE IT (3 Oct 2026). Ethan, seeing it as a VIP: "I would rather have this
  // expanding across the full width of that big card, and the Tryp.com airplane animation to be sitting above it, kind
  // of like how the worldwide one is right now." So it takes the place the global challenge band takes for everybody
  // else (GlobalChallengeStrip): the month's earnings, how the month is going, and the two things to do.
  if (inCard) {
    const left = daysLeft(month.ends_at)
    return (
      <div className={cx('mt-7', className)}>
        <div className="relative animate-card-wipe overflow-hidden rounded-2xl bg-gradient-to-br from-[#8f2a04] via-brand to-brand-light p-5 text-white shadow-[0_18px_40px_-14px_rgba(90,25,0,0.45)] ring-1 ring-white/25 sm:p-6" style={{ animationDelay: '0.08s' }}>
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-black/20 blur-2xl" />
          <div aria-hidden className="challenge-sheen pointer-events-none absolute inset-0" style={{ animationDelay: '0.5s' }} />
          <div className="relative grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="wipe-item min-w-0" style={{ animationDelay: '0.18s' }}>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider">
                <Icon name="star" className="h-3.5 w-3.5" />{tr('VIP · {m}', { m: monthLabel(month.year, month.month) })}
              </span>
              <p className="mt-2.5 flex flex-wrap items-baseline gap-x-2.5">
                <span className="text-3xl font-bold tabular-nums leading-tight"><CountUp value={stats.base} format={(n) => money(n, programme.currency)} /></span>
                <span className="text-sm text-white/85">{tr('earned so far')}</span>
              </p>
              {stats.projected_base != null && <p className="mt-0.5 text-sm text-white/85">{tr('On pace for about {a}', { a: money(stats.projected_base, programme.currency, { cents: false }) })}</p>}
            </div>
            <dl className="wipe-item grid grid-cols-3 gap-2" style={{ animationDelay: '0.26s' }}>
              {[[tr('Days left'), String(left)], [tr('Views'), formatViews(stats.views)], [tr('Rank'), stats.rank ? `#${stats.rank}` : '-']].map(([label, value]) => (
                <div key={label} className="min-w-[4.5rem] rounded-xl bg-white/15 px-3 py-2.5 text-center backdrop-blur-sm">
                  <dd className="text-xl font-bold tabular-nums leading-none">{value}</dd>
                  <dt className="mt-1 text-[9.5px] font-bold uppercase tracking-wide text-white/80">{label}</dt>
                </div>
              ))}
            </dl>
            <div className="wipe-item grid grid-cols-2 gap-2 lg:grid-cols-1" style={{ animationDelay: '0.34s' }}>
              <Link to="/vip?tab=videos" className="btn justify-center whitespace-nowrap border border-white bg-white !text-brand hover:bg-white/90"><Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />{tr('Add a video')}</Link>
              <Link to="/vip" className="btn justify-center whitespace-nowrap border border-white/50 !text-white hover:bg-white/10">{tr('VIP page')}</Link>
            </div>
          </div>
        </div>
      </div>
    )
  }
  return (
    <Reveal delay={delay}>
    <Link to="/vip" className="brand-drift group relative flex items-center gap-4 overflow-hidden rounded-card p-5 text-white shadow-card transition-all duration-300 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift">
      <span aria-hidden className="survey-orb pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20"><Icon name="star" className="h-6 w-6" /></span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">{tr('{m} so far', { m: monthLabel(month.year, month.month) })}</span>
        <span className="block text-3xl font-bold tabular-nums leading-tight"><CountUp value={stats.base} format={(n) => money(n, programme.currency)} /></span>
        <span className="block text-xs text-white/90">{tr('{d} days left. Open your VIP page.', { d: daysLeft(month.ends_at) })}</span>
      </span>
      <Icon name="chevronRight" className="relative h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
    </Reveal>
  )
}

/** The VIP's month in the Worldwide page's right rail, where everybody else sees the live challenge. */
export function VipRailCard({ overview }) {
  const tr = useT()
  const [brief, setBrief] = useState(undefined)
  const y = overview?.month?.year
  const m = overview?.month?.month
  useEffect(() => {
    if (!y) return undefined
    let alive = true
    supabase.from('vip_briefs').select('id, title, theme').eq('year', y).eq('month', m).order('programme_id', { ascending: false, nullsFirst: false }).limit(1)
      .then(({ data }) => { if (alive) setBrief(data?.[0] || null) })
    return () => { alive = false }
  }, [y, m])
  if (!overview) return <div className="space-y-2"><div className="h-24 w-full animate-pulse rounded-xl bg-cloud" /></div>
  const { stats, member, month } = overview
  const tv = member?.target_videos
  const tw = member?.target_views
  const bar = (label, value, target) => {
    const pct = target > 0 ? Math.min(1, value / target) : 0
    return (
      <div>
        <div className="flex items-baseline justify-between text-[11px]"><span className="font-semibold text-ink">{label}</span><span className="tabular-nums text-smoke"><span className="font-bold text-ink">{nf(value)}</span> / {nf(target)}</span></div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={cx('h-full rounded-full transition-[width] duration-1000', pct >= 1 ? 'bg-emerald-500' : 'bg-gradient-to-r from-brand to-brand-light')} style={{ width: `${Math.max(pct > 0 ? 4 : 0, Math.round(pct * 100))}%` }} /></div>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <Link to="/vip" className="relative block overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light px-4 py-3.5 text-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift">
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-0" />
        <span className="relative block text-[10px] font-semibold uppercase tracking-wider text-white/80">{brief ? tr('VIP challenge · {m}', { m: monthLabel(month.year, month.month) }) : tr('{d} days left in {m}', { d: daysLeft(month.ends_at), m: monthLabel(month.year, month.month) })}</span>
        <span className="relative mt-1 block truncate text-[15px] font-semibold leading-snug">{brief ? brief.title : tr('{a} earned so far', { a: money(stats.base, overview.programme.currency) })}</span>
        <span className="relative mt-0.5 block text-xs text-white/80">{stats.rank ? tr('You are #{n} of {t} this month', { n: stats.rank, t: stats.of || stats.rank }) : tr('Add a video to get on the board')}</span>
      </Link>
      {(tv || tw) ? (
        <div className="space-y-2.5 rounded-xl bg-cloud/50 px-3.5 py-3">
          {tv ? bar(tr('Videos'), stats.videos, tv) : null}
          {tw ? bar(tr('Views'), stats.views, tw) : null}
        </div>
      ) : null}
      <Link to="/vip?tab=videos" className="btn-primary w-full justify-center !py-2.5 text-sm"><Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />{tr('Add a video')}</Link>
    </div>
  )
}
