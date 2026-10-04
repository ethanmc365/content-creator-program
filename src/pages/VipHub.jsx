import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { EmptyState, PageHeader, Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import Segmented from '../components/network/Segmented'
import { ProgrammePill, ProgrammeSwitch, VIP_LINKS, VipBalanceMini, VipChipNav, VipSideNav } from '../components/vip/hubNav'
import { CountUp } from '../components/network/Motion'
import {
  PaymentBanner, VipBoardList, VipEarn, VipSubmit, VipTermsGate, VipVideoRow,
} from '../components/vip/parts'
import { VipAnnouncements, VipStats } from '../components/vip/mine'
import { MarketStandings, PerksPath, VipChallengeCard, VipLibrary, VipMap, VipMySettings } from '../components/vip/v3'
import { VipWallet, StayInCard } from '../components/vip/wallet'
import { HowPaidCard, LatestVideos, TargetCard } from '../components/vip/month'
import { TeamPulse } from '../components/vip/teamTools'
import { VipRecapPanel } from './VipRecap'
// The team's tools are only ever drawn for the team, so creators never download them.
const VipTools = lazy(() => import('../components/vip/VipTools'))
import { VipPreviewContext, daysLeft, money, monthLabel, nf, perK, useVipAccess, useVipOverview, vipRpc, vipRpcAs } from '../lib/vip'
import { useT } from '../lib/i18n'
import { cx } from '../lib/utils'
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
const STAFF_HIDDEN = new Set(['videos', 'stats', 'payouts', 'perks', 'recap'])
const PREVIEW_HIDDEN = new Set(['recap'])
const STAFF_PICK = 'tryp_vip_staff_programme'
// ...AND THEN EXACTLY THE CREATOR'S PAGE (2 Oct 2026, migration 311). Ethan: "the VIP page for admins is not useful,
// as it doesn't show it up the way it should, it should show everything the creators can see, see it how they can
// exactly." The team view above is kept one press away, but the page now OPENS as a creator sees it: a real VIP of the
// market (picked from a list, the test account included) through `vip_preview`, which runs that creator's own
// database functions as them, read-only. A market with no VIPs yet shows a new VIP's first day.
// TWO VIEWS FOR THE TEAM, NOT THREE (3 Oct 2026). Ethan: "I don't really understand why we have the buttons ... As a
// creator and Team overview ... I guess they should all be merged into one ... You can remove the 'as a creator'." So
// the team has the VIP PAGE (the market's real page, every VIP at once) and the VIP TOOLS. Seeing one creator's exact
// page is a tool now ("See as a VIP" in VIP tools), which opens it here as `mode=as&who=<id>` behind a banner that
// says whose page it is and leads back. Old links with mode=creator|team land on the VIP page.

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
  const navigate = useNavigate()
  const { overview: own, error, reload: reloadOwn } = useVipOverview()
  const access = useVipAccess(profile?.id, false)
  const [staffPick, setStaffPick] = useState(() => { try { return localStorage.getItem(STAFF_PICK) || null } catch { return null } })
  const [staffOv, setStaffOv] = useState(undefined)
  const staffMode = own === null && access === true
  const asMode = params.get('mode')
  const mode = asMode === 'tools' ? 'tools' : asMode === 'as' ? 'as' : 'page'
  const toolsMode = mode === 'tools'
  const who = mode === 'as' ? (params.get('who') || null) : null
  const [people, setPeople] = useState(undefined)
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
    if (mode === 'as') setParams({}, { replace: true })
  }
  // Whose page is being looked at, for the banner's name.
  const staffProg = staffOv?.programme?.id
  useEffect(() => {
    if (!staffMode || !staffProg || mode !== 'as') return undefined
    let alive = true
    vipRpc('vip_preview_people', { p_programme: staffProg })
      .then((list) => { if (alive) setPeople(list || []) })
      .catch(() => { if (alive) setPeople([]) })
    return () => { alive = false }
  }, [staffMode, staffProg, mode])
  const previewing = staffMode && mode === 'as'
  const loadPreview = useCallback(async () => {
    if (!who) { setPreviewOv(sampleOverview(staffOv)); return }
    try { setPreviewOv(await vipRpcAs(who, 'vip_my_overview')) } catch { setPreviewOv(sampleOverview(staffOv)) }
  }, [who, staffOv])
  useEffect(() => { if (previewing && staffOv) loadPreview() }, [previewing, staffOv, loadPreview])
  const pickView = (m) => {
    setParams(m === 'page' ? {} : { mode: m }, { replace: true })
    if (window.scrollY > 320) window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  // The name for the banner. From the market's list when it has them, or straight from their profile - a VIP opened
  // from the Creators page may be in another market than the one this page last showed.
  const [whoProfile, setWhoProfile] = useState(null)
  useEffect(() => {
    if (!who) return undefined
    let alive = true
    supabase.from('profiles').select('id, name').eq('id', who).maybeSingle().then(({ data }) => { if (alive) setWhoProfile(data || null) })
    return () => { alive = false }
  }, [who])
  const whoName = who ? ((people || []).find((p) => p.id === who)?.name || (whoProfile?.id === who ? whoProfile.name : null)) : null

  // While the staff question is still being asked, keep the skeleton rather than flashing "not a VIP".
  const staffShown = previewing ? (staffOv === undefined ? undefined : previewOv) : staffOv
  const overview = own === null ? (access === undefined || (staffMode && staffShown === undefined) ? undefined : staffMode ? staffShown : null) : own
  const reload = staffMode ? (previewing ? loadPreview : loadStaff) : reloadOwn
  const isStaff = !!overview?.staff
  // The member being previewed, or null for "a new VIP" / not previewing.
  const previewWho = previewing ? who : null
  const asked = params.get('tab') === 'leaderboard' ? 'board' : params.get('tab')
  const hiddenTabs = isStaff ? STAFF_HIDDEN : previewing ? PREVIEW_HIDDEN : null
  const allowed = ['month', 'videos', 'stats', 'payouts', 'board', 'earn', 'perks', 'library', 'map', 'recap'].filter((k) => !hiddenTabs?.has(k))
  const tab = allowed.includes(asked) ? asked : 'month'
  const go = (v) => { setParams(() => { const n = new URLSearchParams(); if (mode === 'as') { n.set('mode', 'as'); if (who) n.set('who', who); if (params.get('from')) n.set('from', params.get('from')) } if (v !== 'month') n.set('tab', v); return n }, { replace: true }); if (window.scrollY > 320) window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const [board, setBoard] = useState(null)
  const [rules, setRules] = useState(null)

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
      supabase.from('communities').select('country_codes').eq('id', communityId).maybeSingle(),
      supabase.from('vip_programmes').select('tagline').eq('id', programmeId).maybeSingle(),
      isStaff || sample ? none : supabase.from('vip_members').select('headline').eq('profile_id', previewWho || user.id).maybeSingle(),
    ])
    setLook({ tagline: pr.data?.tagline || null, headline: me.data?.headline || null })
    setBoard(bd || [])
    setRules(rl.data || [])

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

      {staffMode && (mode === 'as'
        ? <PreviewBanner name={whoName} market={programme.name} fromCreators={params.get('from') === 'creators'} onBack={() => (params.get('from') === 'creators' ? navigate(-1) : setParams({ mode: 'tools', tab: 'preview' }, { replace: true }))} />
        : <StaffBar mode={mode} onMode={pickView} market={programme.name} />)}

      {toolsMode && staffMode ? <Suspense fallback={<Skeleton className="h-72 w-full rounded-card" />}><VipTools programmeId={staffOv?.programme?.id || programme.id} /></Suspense> : (<>

      {/* ---------------- this month, live ---------------- */}
      <section
        key={programme.id}
        className="brand-drift relative mb-5 overflow-hidden rounded-card p-5 text-white shadow-card animate-rise sm:p-7"
      >
        <span aria-hidden className="survey-orb pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-white/15 blur-2xl" />
        <span aria-hidden className="survey-orb pointer-events-none absolute -bottom-20 left-10 h-44 w-44 rounded-full bg-white/10 blur-2xl [animation-delay:-3s]" />
        <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-white" /></span>
              {isStaff ? tr('{m} so far, every VIP', { m: monthLabel(month.year, month.month) }) : tr('{m} so far', { m: monthLabel(month.year, month.month) })}
            </p>
            {!isStaff && look?.tagline && <p className="mt-1 text-sm font-semibold text-white/90"><ReaderText text={look.tagline} /></p>}
            <p className="mt-2 text-5xl font-bold tabular-nums tracking-tight sm:text-6xl">
              <CountUp value={stats.base} format={(n) => money(n, cur)} />
            </p>
            <p className="mt-2 text-sm text-white/90">
              {isStaff
                ? tr('{n} views counted across {m} this month, at {r} per 1,000', { n: nf(stats.views), m: programme.name, r: perK(stats.effective_cpm, cur) })
                : tr('{n} views counted this month, at {r} per 1,000', { n: nf(stats.views), r: perK(stats.effective_cpm, cur) })}
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
      <div className="mb-5 lg:hidden"><VipChipNav value={tab} onChange={go} hidden={hiddenTabs} links={isStaff ? null : VIP_LINKS} /></div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-7">
      <div key={tab} className="min-w-0">
        {tab === 'month' && (
          <div className="vip-stage space-y-5">
            {isStaff && <TeamPulse programme={programme} onTool={(t) => setParams({ mode: 'tools', tab: t }, { replace: true })} />}
            <VipAnnouncements programmeId={programme.id} />
            {/* SUBMITTING COMES FIRST (3 Oct 2026). Ethan: "I like the submitted video thing, but maybe that should be at
                the very top ... because that's obviously the most important thing." */}
            {!isStaff && <VipSubmit disabled={paused || previewing} month={month} onAdded={refresh} />}
            <VipChallengeCard overview={overview} />

            {isStaff ? (
              <>
                <PayStrip staff member={member} programme={programme} stats={stats} month={month} cur={cur} />
                <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="trophy" className="h-5 w-5 text-brand" />{tr('Top this month')}</h2>
                    {board?.length > 5 && <button type="button" onClick={() => go('board')} className="text-xs font-semibold text-brand hover:underline">{tr('Full leaderboard')}</button>}
                  </div>
                  {board === null ? <Skeleton className="h-48 w-full rounded-xl" /> : board.length === 0
                    ? <p className="rounded-xl bg-cloud/60 px-4 py-8 text-center text-sm text-smoke">{tr('No VIP videos counted in {m} yet this month.', { m: programme.name })}</p>
                    : <VipBoardList rows={board.slice(0, 6)} rules={rules || []} currency={cur} month={month} />}
                </section>
              </>
            ) : (
              <>
                {/* SMALL, THEN THE TARGET, THEN THE PAY (3 Oct 2026): the stay-in rule is a one-row card now. */}
                <StayInCard compact />
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                  <TargetCard member={member} stats={stats} onSetGoal={previewing ? null : () => go('stats')} />
                  <HowPaidCard stats={stats} cur={cur} />
                </div>
                <LatestVideos videos={overview.videos} cpm={stats.effective_cpm} currency={cur} onSeeAll={() => go('videos')} onChanged={refresh} />
              </>
            )}
          </div>
        )}

        {tab === 'videos' && (
          <div className="vip-stage space-y-5">
            <VipSubmit disabled={paused || previewing} month={month} onAdded={refresh} />
            {(overview.videos || []).length === 0
              ? <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('No videos yet. Paste a link above and it starts counting.')}</p>
              : <ul className="space-y-3">{overview.videos.map((v, i) => <VipVideoRow key={v.id} video={v} cpm={stats.effective_cpm} currency={cur} onRemoved={refresh} delay={Math.min(i, 8) * 45} />)}</ul>}
          </div>
        )}

        {tab === 'stats' && (
          <div className="vip-stage space-y-5">
            <VipStats overview={overview} rules={rules} programmeId={programme.id} />
            <VipMySettings overview={overview} onSaved={refresh} />
          </div>
        )}

        {tab === 'payouts' && <VipWallet onChanged={refresh} />}

        {tab === 'board' && (
          <div className="vip-stage space-y-4">
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
                {board === null ? <Skeleton className="h-48 w-full rounded-card" /> : <VipBoardList rows={board} rules={rules} currency={cur} month={month} />}
              </div>
            ) : (
              <MarketStandings />
            )}
          </div>
        )}

        {tab === 'perks' && (
          <div className="vip-stage space-y-3">
            <p className="text-sm text-smoke">{tr('Unlock perks and trips as your views and videos add up. The team marks each one delivered.')}</p>
            <PerksPath />
          </div>
        )}

        {tab === 'earn' && (
          <div className="vip-stage space-y-3">
            <p className="text-sm text-smoke">{tr('On top of your views pay, these are the bonuses the team is running.')}</p>
            {rules === null ? <Skeleton className="h-48 w-full rounded-card" /> : <VipEarn rules={rules} overview={overview} currency={cur} />}
          </div>
        )}

        {tab === 'library' && <VipLibrary programmeId={programme.id} />}
        {tab === 'map' && <VipMap />}
        {tab === 'recap' && <VipRecapPanel m={params.get('m')} onPick={(k) => setParams({ tab: 'recap', m: k }, { replace: true })} />}
      </div>

      {/* Desktop: the sections, in a column that stays in view. */}
      {/* NO QUICK LINKS CARD (3 Oct 2026). Ethan: the links to the VIP rooms "are unnecessary. You can remove the quick
          link card entirely and just have the other right column"; a VIP's recap and portfolio join the sections. */}
      <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block">
        <VipSideNav value={tab} onChange={go} hidden={hiddenTabs} links={isStaff ? null : VIP_LINKS} />
        {!isStaff && <VipBalanceMini onOpen={() => go('payouts')} />}
      </aside>
      </div>

      </>)}

      {!staffMode && <VipTermsGate open={!member.terms_ok} programme={programme} onAccepted={refresh} />}
    </div>
    </VipPreviewContext.Provider>
  )
}

// THE TEAM'S BAR: the market's VIP page, or the VIP tools. One sliding gradient, nothing else to choose.
function StaffBar({ mode, onMode, market }) {
  const tr = useT()
  return (
    <div className="relative z-20 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-gray-100 bg-white p-2 shadow-card animate-rise sm:pl-2">
      <Segmented
        size="sm"
        id="vip-staff-mode"
        label={tr('How to see this page')}
        value={mode}
        onChange={onMode}
        options={[
          { value: 'page', label: <><Icon name="star" className="h-3.5 w-3.5" />{tr('VIP page')}</> },
          { value: 'tools', label: <><Icon name="key" className="h-3.5 w-3.5" />{tr('VIP tools')}</> },
        ]}
      />
      <span key={mode} className="hidden min-w-0 flex-1 text-xs text-smoke animate-tab-in sm:block">
        {mode === 'tools' ? tr('Members, money, content and settings for {m}.', { m: market }) : tr('Every VIP in {m} together, this month.', { m: market })}
      </span>
    </div>
  )
}

// LOOKING AT ONE VIP'S PAGE: says whose, says it is read only, and leads back to where it was opened.
function PreviewBanner({ name, market, onBack, fromCreators = false }) {
  const tr = useT()
  return (
    <div className="relative z-20 mb-4 flex flex-wrap items-center gap-3 rounded-card bg-ink px-4 py-3 text-white shadow-card animate-rise">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15"><Icon name="eye" className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-bold">{name ? tr('{n}\'s VIP page', { n: name }) : tr('A new VIP\'s first day in {m}', { m: market })}</span>
        <span className="block text-xs text-white/70">{tr('Read only. Exactly what they see.')}</span>
      </span>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-ink transition-transform duration-200 hoverable:hover:scale-105">
        <Icon name="chevronLeft" className="h-3.5 w-3.5" />{fromCreators ? tr('Back') : tr('Back to VIP tools')}
      </button>
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

// HOW THEY ARE PAID, AS FACTS (3 Oct 2026). Ethan: "where it shows how VIPs here are paid. It shows rate, what counts and
// paid ... clean up the design of that ... have a lot of space in that card whenever the leaderboard shows up." For the
// team it is one strip of tiles across the page instead of a tall card beside the leaderboard; for a VIP it is the same
// tiles in a card beside their target. Every rate shows its cents: €0.30, never €0.3.
function PayStrip({ member, programme, stats, month, cur, staff = false }) {
  const tr = useT()
  const steps = member.tiers?.length ? member.tiers : !member.cpm ? programme.tiers : null
  const cap = member.monthly_cap || programme.monthly_cap
  const facts = [
    { icon: 'money', label: staff ? tr('Rate') : tr('Your rate'), value: perK(stats.effective_cpm, cur), hint: tr('per 1,000 views') },
    ...(steps?.length ? steps.map((t) => ({ icon: 'trendUp', label: tr('From {n} views', { n: nf(t.from_views) }), value: perK(t.cpm, cur), hint: tr('per 1,000 views') })) : []),
    { icon: 'video', label: tr('What counts'), value: tr('New videos'), hint: tr('posted in {m}', { m: monthLabel(month.year, month.month) }) },
    { icon: 'calendar', label: tr('Paid'), value: tr('Monthly'), hint: tr('after the month closes') },
    ...(Number(member.monthly_fee) > 0 ? [{ icon: 'wallet', label: tr('Monthly bonus'), value: money(member.monthly_fee, cur, { cents: false }), hint: member.fee_min_videos ? tr('with {n}+ videos', { n: member.fee_min_videos }) : tr('every month') }] : []),
    ...(cap ? [{ icon: 'shield', label: tr('Monthly cap'), value: money(cap, cur, { cents: false }), hint: tr('on views pay') }] : []),
  ]
  return (
    <section className={cx('rounded-card border border-gray-100 bg-white shadow-card animate-rise', staff ? 'p-3 sm:p-4' : 'p-5')}>
      <h2 className={cx('flex items-center gap-2 text-[15px] font-bold text-ink', staff ? 'mb-3 px-1' : 'mb-4')}><Icon name="money" className="h-5 w-5 text-brand" />{staff ? tr('How VIPs here are paid') : tr('How you are paid')}</h2>
      <dl className={cx('grid gap-2', staff ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2')}>
        {facts.map((f, i) => (
          <div key={`${f.label}${i}`} className="rounded-xl bg-cloud/60 px-3 py-2.5 animate-rise" style={{ animationDelay: `${i * 45}ms` }}>
            <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400"><Icon name={f.icon} className="h-3 w-3 text-brand" />{f.label}</dt>
            <dd className="mt-0.5 truncate text-[15px] font-bold tabular-nums text-ink">{f.value}</dd>
            <dd className="truncate text-[11px] text-smoke">{f.hint}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
