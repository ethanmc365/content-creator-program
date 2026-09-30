import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { EmptyState, PageHeader, Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import Segmented from '../components/network/Segmented'
import { CountUp } from '../components/network/Motion'
import {
  PaymentBanner, TargetBar, VipBoardList, VipEarn, VipStatementCard, VipSubmit, VipTermsGate, VipVideoRow,
} from '../components/vip/parts'
import { VipAnnouncements, VipStats } from '../components/vip/mine'
import { cx } from '../lib/utils'
import { daysLeft, money, monthLabel, nf, rate, useVipOverview, vipRpc } from '../lib/vip'
import { useT } from '../lib/i18n'

// THE VIP PAGE (2 Oct 2026, migration 294).
//
// Ethan: VIP creators "are paid by views. They're not winning challenges ... They'll have their own section
// inside the community, so they'll have their own tab."
//
// It answers four questions in the order a creator asks them: what have I earned this month (a live counter:
// views gained in the month x the rate), am I on track (my target, my rank, how it projects), what do I do
// next (add a video), and what have I been paid (every month's statement with its invoice). The rules that
// decide every number live in the database, so this page, the team's page and the invoice agree.
export default function VipHub() {
  const tr = useT()
  const [params, setParams] = useSearchParams()
  const tab = ['month', 'videos', 'stats', 'payouts', 'board', 'earn'].includes(params.get('tab')) ? params.get('tab') : 'month'
  const { overview, error, reload } = useVipOverview()
  const [statements, setStatements] = useState(null)
  const [board, setBoard] = useState(null)
  const [rules, setRules] = useState(null)
  const [slug, setSlug] = useState('')

  const programmeId = overview?.programme?.id
  const communityId = overview?.programme?.community_id

  const loadMore = useCallback(async () => {
    if (!programmeId) return
    const [st, bd, rl, cm] = await Promise.all([
      vipRpc('vip_my_statements').catch(() => []),
      vipRpc('vip_board').catch(() => []),
      supabase.from('vip_bonus_rules').select('*').eq('programme_id', programmeId).eq('active', true).order('created_at'),
      supabase.from('communities').select('slug').eq('id', communityId).maybeSingle(),
    ])
    setStatements(st || [])
    setBoard(bd || [])
    setRules(rl.data || [])
    setSlug(cm.data?.slug || '')
  }, [programmeId, communityId])
  useEffect(() => { loadMore() }, [loadMore])

  const refresh = () => { reload(); loadMore() }

  if (overview === undefined) {
    return (
      <div className="page max-w-5xl">
        <Skeleton className="mb-5 h-10 w-40" />
        <Skeleton className="h-56 w-full rounded-card" />
        <Skeleton className="mt-5 h-12 w-full rounded-xl" />
      </div>
    )
  }
  if (overview === null) {
    return (
      <div className="page max-w-3xl">
        <PageHeader title={tr('VIP')} />
        <EmptyState
          icon={<Icon name="star" className="h-7 w-7" />}
          title={tr('This page is for VIP creators')}
          hint={error || tr('VIP creators are paid by the views they bring. If you think you should be one, ask your market lead.')}
        />
      </div>
    )
  }

  const { programme, member, month, stats } = overview
  const cur = programme.currency
  const left = daysLeft(month.ends_at)
  const paused = member.status !== 'active'
  const videosThisMonth = (overview.videos || []).filter((v) => v.status === 'tracking')

  return (
    <div className="page max-w-5xl">
      <PageHeader
        title={tr('VIP')}
        inlineAction
        action={<span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1.5 text-xs font-bold text-brand"><Icon name="star" className="h-3.5 w-3.5" />{programme.name}</span>}
      />

      {/* ---------------- this month, live ---------------- */}
      <section className="brand-drift relative mb-5 overflow-hidden rounded-card p-5 text-white shadow-card animate-fade-up sm:p-7">
        <span aria-hidden className="survey-orb pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-white/15 blur-2xl" />
        <span aria-hidden className="survey-orb pointer-events-none absolute -bottom-20 left-10 h-44 w-44 rounded-full bg-white/10 blur-2xl [animation-delay:-3s]" />
        <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-white" /></span>
              {tr('{m} so far', { m: monthLabel(month.year, month.month) })}
            </p>
            <p className="mt-2 text-5xl font-bold tabular-nums tracking-tight sm:text-6xl">
              <CountUp value={stats.base} format={(n) => money(n, cur)} />
            </p>
            <p className="mt-2 text-sm text-white/90">
              {tr('{n} views counted this month, at {r} per 1,000', { n: nf(stats.views), r: `${cur} ${rate(stats.effective_cpm)}` })}
            </p>
            {stats.projected_base != null && (
              <p className="mt-1 text-sm font-semibold text-white">{tr('On pace for about {a} by the end of the month.', { a: money(stats.projected_base, cur, { cents: false }) })}</p>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-2.5 sm:gap-3">
            <HeroStat label={tr('Days left')} value={String(left)} />
            <HeroStat label={tr('Videos')} value={String(stats.videos)} />
            <HeroStat label={tr('Rank')} value={stats.rank ? `#${stats.rank}` : '-'} hint={stats.of ? tr('of {n}', { n: stats.of }) : ''} />
          </dl>
        </div>
      </section>

      {paused && <p className="mb-4 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{tr('Your VIP place is paused, so new views are not being counted. Ask your market lead if that is a surprise.')}</p>}
      {!overview.payment_ready && <div className="mb-4"><PaymentBanner /></div>}

      <div className="mb-5">
        <Segmented
          value={tab}
          onChange={(v) => setParams(v === 'month' ? {} : { tab: v }, { replace: true })}
          label={tr('VIP sections')}
          options={[
            { value: 'month', label: tr('This month') },
            { value: 'videos', label: tr('My videos') },
            { value: 'stats', label: tr('Stats') },
            { value: 'payouts', label: tr('Payouts') },
            { value: 'board', label: tr('Board') },
            { value: 'earn', label: tr('Earn more') },
          ]}
        />
      </div>

      <div key={tab} className="animate-fade-up">
        {tab === 'month' && (
          <div className="space-y-5">
            <VipAnnouncements programmeId={programme.id} />
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card">
                <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="trophy" className="h-5 w-5 text-brand" />{tr('Your target this month')}</h2>
                {member.target_videos || member.target_views ? (
                  <div className="space-y-4">
                    {member.target_videos ? <TargetBar label={tr('Videos posted')} value={stats.videos} target={member.target_videos} /> : null}
                    {member.target_views ? <TargetBar label={tr('Views')} value={stats.views} target={member.target_views} /> : null}
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed text-smoke">{tr('No target has been set for you yet. Your views pay is what counts. Ask your market lead if you would like one to aim for.')}</p>
                )}
              </section>
              <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card">
                <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="money" className="h-5 w-5 text-brand" />{tr('How you are paid')}</h2>
                <dl className="space-y-2.5 text-sm">
                  <Row label={tr('Your rate')} value={tr('{r} per 1,000 views', { r: `${cur} ${rate(stats.effective_cpm)}` })} />
                  {programme.tiers?.length > 0 && !member.cpm && <Row label={tr('Higher rates')} value={programme.tiers.map((t) => tr('{r} from {n} views', { r: `${cur} ${rate(t.cpm)}`, n: nf(t.from_views) })).join(' · ')} />}
                  <Row label={tr('Counts')} value={tr('Views a video gains in the month, for videos posted in the last {n} days', { n: programme.window_days })} />
                  {(member.monthly_cap || programme.monthly_cap) && <Row label={tr('Monthly cap')} value={money(member.monthly_cap || programme.monthly_cap, cur, { cents: false })} />}
                  <Row label={tr('Minimum payout')} value={tr('{a}. Less than that carries over.', { a: money(programme.min_payout, cur, { cents: false }) })} />
                </dl>
              </section>
            </div>

            <VipSubmit disabled={paused} windowDays={programme.window_days} onAdded={refresh} />

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-bold text-ink">{tr('Latest videos')}</h2>
                {videosThisMonth.length > 3 && <button type="button" onClick={() => setParams({ tab: 'videos' })} className="text-xs font-semibold text-brand hover:underline">{tr('See all')}</button>}
              </div>
              {videosThisMonth.length === 0
                ? <p className="rounded-card border border-dashed border-gray-200 px-6 py-8 text-center text-sm text-smoke">{tr('No videos yet. Paste a link above and it starts counting.')}</p>
                : <ul className="space-y-3">{videosThisMonth.slice(0, 3).map((v) => <VipVideoRow key={v.id} video={v} cpm={stats.effective_cpm} currency={cur} onRemoved={refresh} />)}</ul>}
            </section>

            <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card">
              <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="chat" className="h-5 w-5 text-brand" />{tr('Your rooms')}</h2>
              <p className="mb-4 text-sm text-smoke">{tr('Only VIP creators and the team can see these. This is where the WhatsApp group lives now.')}</p>
              <div className="flex flex-wrap gap-2.5">
                {slug && <Link to={`/c/${slug}/chat/vip`} className="btn-primary !py-2.5 text-sm"><Icon name="star" className="h-4 w-4" />{tr('VIP room')}</Link>}
                <Link to="/global/chat/vip_global" className="btn-secondary !py-2.5 text-sm"><Icon name="globe" className="h-4 w-4" />{tr('VIP lounge')}</Link>
              </div>
            </section>
          </div>
        )}

        {tab === 'videos' && (
          <div className="space-y-5">
            <VipSubmit disabled={paused} windowDays={programme.window_days} onAdded={refresh} />
            {(overview.videos || []).length === 0
              ? <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('No videos yet. Paste a link above and it starts counting.')}</p>
              : <ul className="space-y-3">{overview.videos.map((v) => <VipVideoRow key={v.id} video={v} cpm={stats.effective_cpm} currency={cur} onRemoved={refresh} />)}</ul>}
          </div>
        )}

        {tab === 'stats' && <VipStats overview={overview} rules={rules} programmeId={programme.id} />}

        {tab === 'payouts' && (
          <div className="space-y-5">
            <div className={cx('flex items-center gap-3 rounded-card border px-4 py-3.5', overview.payment_ready ? 'border-emerald-100 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/70')}>
              <Icon name={overview.payment_ready ? 'check' : 'wallet'} className={cx('h-5 w-5 shrink-0', overview.payment_ready ? 'text-emerald-600' : 'text-amber-700')} strokeWidth={overview.payment_ready ? 2.4 : 1.8} />
              <p className="min-w-0 flex-1 text-sm font-semibold text-ink">{overview.payment_ready ? tr('Your payment details are saved.') : tr('Add your payment details so we can pay you.')}</p>
              <Link to="/settings?section=payment" className="btn-secondary !py-2 text-xs">{overview.payment_ready ? tr('Change') : tr('Add them')}</Link>
            </div>
            <p className="text-sm leading-relaxed text-smoke">{tr('On the last day of each month we take a final reading of your views, and your statement appears here once the team has checked it. Your invoice follows.')}</p>
            {statements === null ? <Skeleton className="h-20 w-full rounded-card" />
              : statements.length === 0
                ? <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('No statements yet. The first one arrives after this month closes.')}</p>
                : <ul className="space-y-3">{statements.map((s) => <VipStatementCard key={s.id} s={s} programmeCpm={programme.cpm} />)}</ul>}
          </div>
        )}

        {tab === 'board' && (
          <div className="space-y-3">
            <p className="text-sm text-smoke">{tr('This month\'s VIP creators by views counted. First names only.')}</p>
            {board === null ? <Skeleton className="h-48 w-full rounded-card" /> : <VipBoardList rows={board} rules={rules} currency={cur} />}
          </div>
        )}

        {tab === 'earn' && (
          <div className="space-y-3">
            <p className="text-sm text-smoke">{tr('On top of your views pay, these are the bonuses the team is running.')}</p>
            {rules === null ? <Skeleton className="h-48 w-full rounded-card" /> : <VipEarn rules={rules} overview={overview} currency={cur} />}
          </div>
        )}
      </div>

      <VipTermsGate open={!member.terms_ok} programme={programme} onAccepted={refresh} />
    </div>
  )
}

function HeroStat({ label, value, hint }) {
  return (
    <div className="min-w-[4.6rem] rounded-2xl bg-white/15 px-3.5 py-3 text-center backdrop-blur-sm">
      <dd className="text-2xl font-bold tabular-nums leading-none">{value}</dd>
      <dt className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-white/85">{label}{hint ? ` ${hint}` : ''}</dt>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-smoke">{label}</dt>
      <dd className="text-right font-semibold text-ink">{value}</dd>
    </div>
  )
}
