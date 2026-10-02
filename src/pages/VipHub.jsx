import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { EmptyState, PageHeader, Select, Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import Segmented from '../components/network/Segmented'
import { ProgrammePill, ProgrammeSwitch, VipChipNav, VipQuickLinks, VipSideNav } from '../components/vip/hubNav'
import { CountUp } from '../components/network/Motion'
import {
  PaymentBanner, TargetBar, VipBoardList, VipEarn, VipSubmit, VipTermsGate, VipVideoRow,
} from '../components/vip/parts'
import { VipAnnouncements, VipStats } from '../components/vip/mine'
import { MarketStandings, PerksPath, VipChallengeCard, VipLibrary, VipMap, VipMySettings } from '../components/vip/v3'
import { VipWallet, StayInCard } from '../components/vip/wallet'
import { TeamPulse } from '../components/vip/teamTools'
// The team's tools are only ever drawn for the team, so creators never download them.
const VipTools = lazy(() => import('../components/vip/VipTools'))
import { VipPreviewContext, daysLeft, money, monthLabel, nf, rate, useVipAccess, useVipOverview, vipRpc, vipRpcAs } from '../lib/vip'
import { useT } from '../lib/i18n'
import ReaderText from '../components/ReaderText'

// THE VIP PAGE (2 Oct 2026, migration 294).
//
// Ethan: VIP creators "are paid by views. They're not winning challenges ... They'll have their own section
// inside the community, so they'll have their own tab."
//
// It answers four questions in the order a creator asks them: what have I earned this month (a live counter:
// views gained in the month x the rate), am I on track (my target, my rank, how it projects), what do I do
// next (add a video), and what have I been paid (every month's statement with its invoice). The rules that
// decide every number live in the database, so this page, the team's page and the invoice agree.
// THE TEAM SEES THE REAL PAGE (2 Oct 2026, migration 310). Ethan: the VIP tab "opens a VIP in a test preview,
// but I want it to be the actual VIP view." Somebody with VIP access who is not a VIP themselves no longer gets
// signed into the sandbox VIP: they stay themselves and see each market's real VIP page - the month so far
// across every VIP there, the real leaderboard, announcements, briefs, library, map and rooms - with the
// market switch at the top. The sections that are one person's own (videos, stats, payouts, perks) are hidden.
const STAFF_HIDDEN = new Set(['videos', 'stats', 'payouts', 'perks'])
const STAFF_PICK = 'tryp_vip_staff_programme'
// ...AND THEN EXACTLY THE CREATOR'S PAGE (2 Oct 2026, migration 311). Ethan: "the VIP page for admins is not useful,
// as it doesn't show it up the way it should, it should show everything the creators can see, see it how they can
// exactly." The team view above is kept one press away, but the page now OPENS as a creator sees it: a real VIP of the
// market (picked from a list, the test account included) through `vip_preview`, which runs that creator's own
// database functions as them, read-only. A market with no VIPs yet shows a new VIP's first day.
const STAFF_VIEW = 'tryp_vip_staff_view'

// The first day of a brand new VIP in this market: the market's own rate and month, nothing posted yet.
function sampleOverview(s) {
  if (!s?.programme) return null
  return {
    preview: true, sample: true,
    programme: s.programme,
    month: s.month,
    member: { status: 'active', cpm: null, monthly_cap: null, target_videos: null, target_views: null, terms_ok: true, joined_on: null },
    stats: { views: 0, videos: 0, base: 0, effective_cpm: s.programme.cpm, projected_base: null, projected_views: null, rank: null, of: null },
    lifetime: { views: 0, videos: 0, best_month: 0 },
    videos: [],
    payment_ready: true,
  }
}

export default function VipHub() {
  const tr = useT()
  const { user, profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const { overview: own, error, reload: reloadOwn } = useVipOverview()
  const access = useVipAccess(profile?.id, false)
  const [staffPick, setStaffPick] = useState(() => { try { return localStorage.getItem(STAFF_PICK) || null } catch { return null } })
  const [staffOv, setStaffOv] = useState(undefined)
  const staffMode = own === null && access === true
  // THREE VIEWS FOR THE TEAM (2 Oct 2026): a creator's page, the team overview, and the VIP tools (which used to be a
  // page of their own at /admin/vip). The view is in the URL (`mode`) so a notification can open the right one; with no
  // `mode` the last one used is remembered.
  const [savedMode] = useState(() => { try { return localStorage.getItem(STAFF_VIEW) || 'creator' } catch { return 'creator' } })
  const asMode = params.get('mode')
  const mode = ['creator', 'team', 'tools'].includes(asMode) ? asMode : (['creator', 'team'].includes(savedMode) ? savedMode : 'creator')
  const teamView = mode !== 'creator'
  const toolsMode = mode === 'tools'
  const [people, setPeople] = useState(undefined)
  const [who, setWho] = useState(null)
  const [previewOv, setPreviewOv] = useState(undefined)
  const loadStaff = useCallback(async () => {
    try {
      const d = await vipRpc('vip_staff_overview', { p_programme: staffPick })
      setStaffOv(d || null)
    } catch { setStaffOv(null) }
  }, [staffPick])
  useEffect(() => { if (staffMode) loadStaff() }, [staffMode, loadStaff])
  const pickProgramme = (id) => {
    setStaffPick(id)
    try { localStorage.setItem(STAFF_PICK, id) } catch { /* private mode */ }
  }
  // Who in this market can be previewed. A database without migration 311 answers with an error, and the page then
  // simply stays on the team view.
  const staffProg = staffOv?.programme?.id
  useEffect(() => {
    if (!staffMode || !staffProg) return undefined
    let alive = true
    setPeople(undefined)
    vipRpc('vip_preview_people', { p_programme: staffProg })
      .then((list) => {
        if (!alive) return
        const rows = list || []
        setPeople(rows)
        const lead = rows.find((r) => r.status === 'active' && !r.test) || rows.find((r) => r.status === 'active') || null
        setWho(lead?.id ?? null)
      })
      .catch(() => { if (alive) setPeople(null) })
    return () => { alive = false }
  }, [staffMode, staffProg])
  const previewing = staffMode && !teamView && people !== null
  const loadPreview = useCallback(async () => {
    if (!who) { setPreviewOv(sampleOverview(staffOv)); return }
    try { setPreviewOv(await vipRpcAs(who, 'vip_my_overview')) } catch { setPreviewOv(sampleOverview(staffOv)) }
  }, [who, staffOv])
  useEffect(() => { if (previewing && people !== undefined) loadPreview() }, [previewing, people, loadPreview])
  const pickView = (m) => {
    if (m !== 'tools') { try { localStorage.setItem(STAFF_VIEW, m) } catch { /* private mode */ } }
    setParams(m === 'creator' ? {} : { mode: m }, { replace: true })
    if (window.scrollY > 320) window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // While the staff question is still being asked, keep the skeleton rather than flashing "not a VIP".
  const staffShown = previewing ? (people === undefined ? undefined : previewOv) : staffOv
  const overview = own === null ? (access === undefined || (staffMode && staffShown === undefined) ? undefined : staffMode ? staffShown : null) : own
  const reload = staffMode ? (previewing ? loadPreview : loadStaff) : reloadOwn
  const isStaff = !!overview?.staff
  // The member being previewed, or null for "a new VIP" / not previewing.
  const previewWho = previewing ? who : null
  const asked = params.get('tab') === 'leaderboard' ? 'board' : params.get('tab')
  const allowed = ['month', 'videos', 'stats', 'payouts', 'board', 'earn', 'perks', 'library', 'map'].filter((k) => !(isStaff && STAFF_HIDDEN.has(k)))
  const tab = allowed.includes(asked) ? asked : 'month'
  const go = (v) => { setParams(() => { const n = new URLSearchParams(); if (asMode && asMode !== 'tools') n.set('mode', asMode); if (v !== 'month') n.set('tab', v); return n }, { replace: true }); if (window.scrollY > 320) window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const [board, setBoard] = useState(null)
  const [rules, setRules] = useState(null)
  const [slug, setSlug] = useState('')
  const [codes, setCodes] = useState([])
  const [boardView, setBoardView] = useState('mine')
  const [look, setLook] = useState(null)

  const programmeId = overview?.programme?.id
  const communityId = overview?.programme?.community_id

  const loadMore = useCallback(async () => {
    if (!programmeId) return
    const none = Promise.resolve({ data: null })
    const sample = !!overview?.sample
    const [bd, rl, cm, pr, me] = await Promise.all([
      (isStaff || sample ? vipRpc('vip_staff_board', { p_programme: programmeId }) : vipRpcAs(previewWho, 'vip_board')).catch(() => []),
      supabase.from('vip_bonus_rules').select('*').eq('programme_id', programmeId).eq('active', true).order('created_at'),
      supabase.from('communities').select('slug, country_codes').eq('id', communityId).maybeSingle(),
      supabase.from('vip_programmes').select('tagline').eq('id', programmeId).maybeSingle(),
      isStaff || sample ? none : supabase.from('vip_members').select('headline').eq('profile_id', previewWho || user.id).maybeSingle(),
    ])
    setLook({ tagline: pr.data?.tagline || null, headline: me.data?.headline || null })
    setBoard(bd || [])
    setRules(rl.data || [])
    setSlug(cm.data?.slug || '')
    setCodes(cm.data?.country_codes || [])
  }, [programmeId, communityId, user.id, isStaff, previewWho, overview?.sample])
  useEffect(() => { loadMore() }, [loadMore])

  const refresh = (opts) => { reload(); loadMore(); if (opts?.watch) setWatching((n) => n + 1) }
  // A NEW VIDEO'S FIRST READING, WITHOUT A REFRESH (1 Oct 2026). Ethan: "It seems to take a really long time to read
  // the views ... I guess I should update immediately." The reading is asked for the moment a video is added; this
  // asks the page again every few seconds until every new video has its first number (or two minutes pass).
  const [watching, setWatching] = useState(0)
  const waiting = (overview?.videos || []).some((v) => v.status === 'tracking' && !v.synced_at && !v.error)
  useEffect(() => {
    if (!watching || !waiting) return undefined
    const id = setInterval(reload, 4000)
    const stop = setTimeout(() => clearInterval(id), 120000)
    return () => { clearInterval(id); clearTimeout(stop) }
  }, [watching, waiting, reload])

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

  const programmes = staffOv?.programmes || overview.programmes || []
  return (
    <VipPreviewContext.Provider value={previewWho}>
    <div className="page max-w-5xl">
      <PageHeader
        title={tr('VIP')}
        inlineAction
        // THE FLAG, IN WHITE (1 Oct 2026). Ethan: "Maybe show the flag instead in a different colour. Don't make that
        // orange colour."
        action={staffMode && programmes.length > 1
          ? <ProgrammeSwitch programmes={programmes} value={programme.id} onChange={pickProgramme} />
          : <ProgrammePill name={programme.name} codes={codes} />}
      />

      {staffMode && (
        <PreviewBar
          mode={people === null ? (toolsMode ? 'tools' : 'team') : mode}
          canPreview={people !== null}
          onMode={pickView}
          people={people}
          who={who}
          onWho={setWho}
          market={programme.name}
        />
      )}

      {toolsMode && staffMode ? <Suspense fallback={<Skeleton className="h-72 w-full rounded-card" />}><VipTools programmeId={staffOv?.programme?.id || programme.id} /></Suspense> : (<>
      {isStaff && (
        <p className="-mt-2 mb-4 flex items-center gap-2 text-xs text-smoke animate-fade-up">
          <Icon name="eye" className="h-4 w-4 text-brand" />
          {tr('The real VIP page for {m}, as the team sees it: every VIP here, this month. Your own sections stay with the creators.', { m: programme.name })}
        </p>
      )}

      {/* ---------------- this month, live ---------------- */}
      <section
        key={programme.id}
        className="brand-drift relative mb-5 overflow-hidden rounded-card p-5 text-white shadow-card animate-fade-up sm:p-7"
      >
        <span aria-hidden className="survey-orb pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-white/15 blur-2xl" />
        <span aria-hidden className="survey-orb pointer-events-none absolute -bottom-20 left-10 h-44 w-44 rounded-full bg-white/10 blur-2xl [animation-delay:-3s]" />
        <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-white" /></span>
              {isStaff ? tr('{m} so far, every VIP', { m: monthLabel(month.year, month.month) }) : tr('{m} so far', { m: monthLabel(month.year, month.month) })}
            </p>
            {(look?.headline || look?.tagline) && <p className="mt-1 text-sm font-semibold text-white/90">{look.headline || <ReaderText text={look.tagline} />}</p>}
            <p className="mt-2 text-5xl font-bold tabular-nums tracking-tight sm:text-6xl">
              <CountUp value={stats.base} format={(n) => money(n, cur)} />
            </p>
            <p className="mt-2 text-sm text-white/90">
              {isStaff
                ? tr('{n} views counted across {m} this month, at {r} per 1,000', { n: nf(stats.views), m: programme.name, r: `${cur} ${rate(stats.effective_cpm)}` })
                : tr('{n} views counted this month, at {r} per 1,000', { n: nf(stats.views), r: `${cur} ${rate(stats.effective_cpm)}` })}
            </p>
            {stats.projected_base != null && (
              <p className="mt-1 text-sm font-semibold text-white">{tr('On pace for about {a} by the end of the month.', { a: money(stats.projected_base, cur, { cents: false }) })}</p>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-2.5 sm:gap-3">
            <HeroStat label={tr('Days left')} value={String(left)} />
            <HeroStat label={tr('Videos')} value={String(stats.videos)} />
            {isStaff
              ? <HeroStat label={tr('VIPs')} value={String(stats.members ?? 0)} />
              : <HeroStat label={tr('Rank')} value={stats.rank ? `#${stats.rank}` : '-'} hint={stats.of ? tr('of {n}', { n: stats.of }) : ''} />}
          </dl>
        </div>
      </section>

      {paused && <p className="mb-4 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{tr('Your VIP place is paused, so new views are not being counted. Ask your market lead if that is a surprise.')}</p>}
      {!overview.payment_ready && <div className="mb-4"><PaymentBanner /></div>}

      {/* Phones and tablets: the sections as a strip of chips. */}
      <div className="mb-5 lg:hidden"><VipChipNav value={tab} onChange={go} hidden={isStaff ? STAFF_HIDDEN : null} /></div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-7">
      <div key={tab} className="min-w-0 animate-tab-in">
        {tab === 'month' && (
          <div className="space-y-5">
            {isStaff && <TeamPulse programme={programme} onTool={(t) => setParams({ mode: 'tools', tab: t }, { replace: true })} />}
            <VipAnnouncements programmeId={programme.id} />
            {!isStaff && <StayInCard />}
            <VipChallengeCard overview={overview} />
            <div className="grid gap-5 lg:grid-cols-2">
              {isStaff ? (
                <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card">
                  <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="trophy" className="h-5 w-5 text-brand" />{tr('Top this month')}</h2>
                  {board === null ? <Skeleton className="h-32 w-full rounded-xl" /> : board.length === 0
                    ? <p className="text-sm leading-relaxed text-smoke">{tr('No VIP videos counted in {m} yet this month.', { m: programme.name })}</p>
                    : <VipBoardList rows={board.slice(0, 5)} rules={rules || []} currency={cur} />}
                </section>
              ) : (
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
              )}
              {/* HOW YOU ARE PAID, IN THREE LINES (1 Oct 2026). Ethan: "How they're paid looks like a lot. It says
                  'Videos posted in the last 60 days,' but it should only be for the month period ... There is no
                  minimum payout ... remove that." A VIP is paid by the month, for videos posted in that month. */}
              <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card">
                <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="money" className="h-5 w-5 text-brand" />{isStaff ? tr('How VIPs here are paid') : tr('How you are paid')}</h2>
                <dl className="space-y-2.5 text-sm">
                  <Row label={isStaff ? tr('Rate') : tr('Your rate')} value={tr('{r} per 1,000 views', { r: `${cur} ${rate(stats.effective_cpm)}` })} />
                  {/* A creator's own ladder (migration 311) replaces the market's; a flat rate of their own has none. */}
                  {(() => {
                    const steps = member.tiers?.length ? member.tiers : !member.cpm ? programme.tiers : null
                    return steps?.length > 0 && <Row label={tr('Higher rates')} value={steps.map((t) => tr('{r} from {n} views', { r: `${cur} ${rate(t.cpm)}`, n: nf(t.from_views) })).join(' · ')} />
                  })()}
                  {Number(member.monthly_fee) > 0 && <Row label={tr('Monthly fee')} value={member.fee_min_videos ? tr('{a}, with {n}+ videos', { a: money(member.monthly_fee, cur, { cents: false }), n: member.fee_min_videos }) : money(member.monthly_fee, cur, { cents: false })} />}
                  <Row label={tr('What counts')} value={tr('Videos you post this month')} />
                  <Row label={tr('Paid')} value={tr('Once a month')} />
                  {(member.monthly_cap || programme.monthly_cap) && <Row label={tr('Monthly cap')} value={money(member.monthly_cap || programme.monthly_cap, cur, { cents: false })} />}
                </dl>
              </section>
            </div>

            {!isStaff && <VipSubmit disabled={paused || previewing} month={month} onAdded={refresh} />}

            {!isStaff && <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-bold text-ink">{tr('Latest videos')}</h2>
                {videosThisMonth.length > 3 && <button type="button" onClick={() => go('videos')} className="text-xs font-semibold text-brand hover:underline">{tr('See all')}</button>}
              </div>
              {videosThisMonth.length === 0
                ? <p className="rounded-card border border-dashed border-gray-200 px-6 py-8 text-center text-sm text-smoke">{tr('No videos yet. Paste a link above and it starts counting.')}</p>
                : <ul className="space-y-3">{videosThisMonth.slice(0, 3).map((v) => <VipVideoRow key={v.id} video={v} cpm={stats.effective_cpm} currency={cur} onRemoved={refresh} />)}</ul>}
            </section>}

            {/* Your rooms used to be a card down here; on a desktop they are the quick links in the column. */}
            <VipQuickLinks slug={slug} staff={isStaff} className="lg:hidden" />
          </div>
        )}

        {tab === 'videos' && (
          <div className="space-y-5">
            <VipSubmit disabled={paused || previewing} month={month} onAdded={refresh} />
            {(overview.videos || []).length === 0
              ? <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('No videos yet. Paste a link above and it starts counting.')}</p>
              : <ul className="space-y-3">{overview.videos.map((v) => <VipVideoRow key={v.id} video={v} cpm={stats.effective_cpm} currency={cur} onRemoved={refresh} />)}</ul>}
          </div>
        )}

        {tab === 'stats' && (
          <div className="space-y-5">
            <VipStats overview={overview} rules={rules} programmeId={programme.id} />
            <VipMySettings overview={overview} onSaved={refresh} />
          </div>
        )}

        {tab === 'payouts' && <VipWallet onChanged={refresh} />}

        {tab === 'board' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-bold text-ink"><Icon name="trophy" className="h-5 w-5 text-brand" />{tr('Leaderboard')}</h2>
              <Segmented
                value={boardView}
                onChange={setBoardView}
                label={tr('Leaderboard view')}
                size="sm"
                options={[{ value: 'mine', label: <><ProgrammeFlags codes={codes} />{isStaff ? programme.name : tr('My market')}</> }, { value: 'markets', label: <><Icon name="globe" className="h-3.5 w-3.5" />{tr('All markets')}</> }]}
              />
            </div>
            {boardView === 'mine' ? (
              <div className="space-y-3">
                <p className="text-sm text-smoke">{tr('This month\'s VIP creators in {m}, by views counted. First names only.', { m: programme.name })}</p>
                {board === null ? <Skeleton className="h-48 w-full rounded-card" /> : <VipBoardList rows={board} rules={rules} currency={cur} />}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-smoke">{tr('Every VIP market, side by side. The same month, the same rules.')}</p>
                <MarketStandings />
              </div>
            )}
          </div>
        )}

        {tab === 'perks' && (
          <div className="space-y-3">
            <p className="text-sm text-smoke">{tr('Unlock perks and trips as your views and videos add up. The team marks each one delivered.')}</p>
            <PerksPath />
          </div>
        )}

        {tab === 'earn' && (
          <div className="space-y-3">
            <p className="text-sm text-smoke">{tr('On top of your views pay, these are the bonuses the team is running.')}</p>
            {rules === null ? <Skeleton className="h-48 w-full rounded-card" /> : <VipEarn rules={rules} overview={overview} currency={cur} />}
          </div>
        )}

        {tab === 'library' && <VipLibrary programmeId={programme.id} />}
        {tab === 'map' && <VipMap />}
      </div>

      {/* Desktop: the sections and the quick links, in a column that stays in view. */}
      {/* QUICK LINKS ON TOP (2 Oct 2026). Ethan: "the quick links card on the right column should be moved up to the
          top and be above the card with the other links." */}
      <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block">
        <div className="animate-slide-in-right"><VipQuickLinks slug={slug} staff={isStaff} /></div>
        <VipSideNav value={tab} onChange={go} hidden={isStaff ? STAFF_HIDDEN : null} />
      </aside>
      </div>

      </>)}

      {!staffMode && <VipTermsGate open={!member.terms_ok} programme={programme} onAccepted={refresh} />}
    </div>
    </VipPreviewContext.Provider>
  )
}

// THE TEAM'S BAR OVER THE PAGE: whose page this is, the team overview, or the VIP tools. The picked view is the sliding
// gradient (Segmented); the person is the house dropdown, never the OS one (and it floats over the page - ui/Select).
function PreviewBar({ mode, canPreview, onMode, people, who, onWho, market }) {
  const tr = useT()
  const options = useMemo(() => [
    ...(people || []).map((p) => ({
      value: p.id,
      label: p.test ? `${p.name} (${tr('test account')})` : p.status === 'paused' ? `${p.name} (${tr('paused')})` : p.status === 'left' ? `${p.name} (${tr('left')})` : p.name,
    })),
    { value: '__new', label: tr('A new VIP, day one') },
  ], [people, tr])
  return (
    <div className="relative z-20 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-gray-100 bg-white p-2 pl-2 shadow-card animate-fade-up sm:pl-3">
      <div className="scrollbar-none -mx-0.5 max-w-full overflow-x-auto px-0.5">
        <Segmented
          size="sm"
          id="vip-preview-mode"
          label={tr('How to see this page')}
          value={mode}
          onChange={onMode}
          options={[
            ...(canPreview ? [{ value: 'creator', label: <><Icon name="eye" className="h-3.5 w-3.5" /><span className="sm:hidden">{tr('Creator')}</span><span className="hidden sm:inline">{tr('As a creator')}</span></> }] : []),
            { value: 'team', label: <><Icon name="users" className="h-3.5 w-3.5" /><span className="sm:hidden">{tr('Team')}</span><span className="hidden sm:inline">{tr('Team overview')}</span></> },
            { value: 'tools', label: <><Icon name="key" className="h-3.5 w-3.5" /><span className="sm:hidden">{tr('Tools')}</span><span className="hidden sm:inline">{tr('VIP tools')}</span></> },
          ]}
        />
      </div>
      {mode === 'creator' && (
        <div className="flex min-w-0 flex-1 items-center gap-2 animate-tab-in">
          <span className="shrink-0 text-xs text-smoke">{tr('Seeing the page of')}</span>
          <Select
            value={who || '__new'}
            onChange={(v) => onWho(v === '__new' ? null : v)}
            options={options}
            variant="chip"
            className="w-56 max-w-full"
            ariaLabel={tr('Whose VIP page to see')}
          />
          <span className="ml-auto hidden text-[11px] text-gray-400 md:block">{tr('Read only. Exactly what they see in {m}.', { m: market })}</span>
        </div>
      )}
      {mode === 'team' && <span className="text-xs text-smoke animate-tab-in">{tr('Every VIP in {m} together, this month.', { m: market })}</span>}
      {mode === 'tools' && <span className="text-xs text-smoke animate-tab-in">{tr('Members, money and settings for {m}.', { m: market })}</span>}
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

function ProgrammeFlags({ codes }) {
  return codes?.length ? <span className="text-[13px] leading-none">{codes.slice(0, 2).map((c) => String.fromCodePoint(...[...c.toUpperCase()].map((ch) => 127397 + ch.charCodeAt(0)))).join('')}</span> : null
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-smoke">{label}</dt>
      <dd className="text-right font-semibold text-ink">{value}</dd>
    </div>
  )
}
