import { VipMyEarnings } from '../components/vip/myEarnings'
import { gentleScrollToSelector } from '../lib/gentleScroll'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { lazyRoute } from '../lib/lazyRoute'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Avatar, PageHeader, Skeleton, Toggle } from '../components/ui'
import Icon from '../components/Icon'
import Segmented from '../components/network/Segmented'
import { ProgrammePill, ProgrammeSwitch, SpaceSwitch, VIP_LINKS, VipBalanceMini, VipChipNav, VipSideNav } from '../components/vip/hubNav'
import StaffBoard from '../components/vip/staffBoard'
import { CountUp, VIP_COUNT_MS } from '../components/network/Motion'
import {
  PaymentBanner, TargetBar, VipBoardList, VipEarn, VipSubmit, VipVideoCard,
} from '../components/vip/parts'
import { VipAnnouncements, VipStats } from '../components/vip/mine'
import { MarketStandings, PerksPath, VipChallengeCard, VipLibrary, VipMap, VipMySettings } from '../components/vip/v3'
import { VipWallet, StayInCard } from '../components/vip/wallet'
import { HowPaidCard, LatestVideos, TargetCard } from '../components/vip/month'
import { TeamPulse } from '../components/vip/teamTools'
import { VipLockedPage } from '../components/vip/VipLocked'
import { VipRecapPanel } from './VipRecap'
// The team's tools are only ever drawn for the team, so creators never download them.
const loadVipTools = () => import('../components/vip/VipTools')
const VipTools = lazyRoute(loadVipTools)
const VideoIdeasBoard = lazyRoute(() => import('../components/VideoIdeas'))
import { ProgrammeKindContext, VipPreviewContext, daysLeft, isOfficial, money, monthLabel, nf, perK, projectedMonthEarnings, useVipAccess, useVipOverview, vipRpc, vipRpcAs, useKindT } from '../lib/vip'
import { cx, formatViews } from '../lib/utils'
import { confirm, notice } from '../lib/confirm'
import { pickClass } from '../lib/pick'
import { useIsMobile } from '../lib/useKeyboardInset'
import ReaderText from '../components/ReaderText'
import { vipApi } from '../api/vip'
import { profilesApi } from '../api/profiles'
import { marketsApi } from '../api/markets'

// THE VIP PAGE (migration 294).
//
// The team: VIP creators "are paid by views. They're not winning challenges... They'll have their own section inside the
// community, so they'll have their own tab."
//
// It answers four questions in the order a creator asks them: what have I earned this month (a live counter:
// views gained in the month x the rate), am I on track (my target, my rank, how it projects), what do I do
// next (add a video), and what have I been paid (every month's statement with its invoice). The rules that
// decide every number live in the database, so this page, the team's page and the invoice agree.
// THE TEAM SEES THE REAL PAGE (migration 310). The team: the VIP tab "opens a VIP in a test preview, but I want it to be
// the actual VIP view." Somebody with VIP access who is not a VIP themselves no longer gets signed into the sandbox VIP:
// they stay themselves and see each market's real VIP page - the month so far across every VIP there, the real
// leaderboard, announcements, briefs, library, map and rooms - with the market switch at the top. The sections that are
// one person's own (videos, stats, payouts, perks) are hidden.
const STAFF_HIDDEN = new Set(['videos', 'stats', 'payouts', 'earnings', 'perks', 'recap'])
const PREVIEW_HIDDEN = new Set(['recap'])
// The team's own tracked videos are not paid through the platform, so their own page has no money sections.
const SELF_STAFF_HIDDEN = new Set(['payouts', 'earnings', 'perks', 'map'])
const STAFF_PICK = 'tryp_vip_staff_programme'
// ...AND THEN EXACTLY THE CREATOR'S PAGE (migration 311). The team view above is kept one press away, but the page now
// OPENS as a creator sees it: a real VIP of the market (picked from a list, the test account included) through
// `vip_preview`, which runs that creator's own database functions as them, read-only. A market with no VIPs yet shows a
// new VIP's first day.
// TWO VIEWS FOR THE TEAM, NOT THREE. So the team has the VIP PAGE (the market's real page, every VIP at once) and the
// VIP TOOLS. Seeing one creator's exact page is a tool now ("See as a VIP" in VIP tools), which opens it here as
// `mode=as&who=<id>` behind a banner that says whose page it is and leads back. Old links with mode=creator|team land on
// the VIP page.

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
  const tr = useKindT()
  const { user, profile, isAdmin } = useAuth()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { overview: own, reload: reloadOwn } = useVipOverview()
  const access = useVipAccess(profile?.id, false)
  const [staffPick, setStaffPick] = useState(() => { try { return localStorage.getItem(STAFF_PICK) || null } catch { return null } })
  const [staffOv, setStaffOv] = useState(undefined)
  const asMode = params.get('mode')
  const mode = asMode === 'tools' ? 'tools' : asMode === 'as' ? 'as' : asMode === 'me' ? 'me' : 'page'
  // THE TEAM'S OWN VIDEOS (migration 436). Somebody who runs an official programme can track their own videos in it
  // (`mode=me`, "My videos"). They stay the team everywhere else: being tracked never turns /vip into a creator's page
  // for them, it is the third view beside the page and the tools.
  const meMode = access === true && mode === 'me'
  const staffMode = access === true && !meMode
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
  useEffect(() => { if (access === true) loadStaff() }, [access, loadStaff])
  // The tools are one press away for the team, so their code and their market list load now, in the background.
  useEffect(() => {
    if (!staffMode) return
    loadVipTools().then((m) => m.warmVipTools?.(profile?.platform_role === 'owner')).catch(() => {})
  }, [staffMode, profile?.platform_role])
  const pickProgramme = (id, kind) => {
    setStaffPick(id)
    try { localStorage.setItem(STAFF_PICK, id); if (kind) localStorage.setItem(`${STAFF_PICK}_${kind}`, id) } catch { /* private mode */ }
    if (mode === 'as' || mode === 'me') setParams({}, { replace: true })
  }
  // VIP COMMUNITY OR OFFICIAL CREATORS: each space remembers the market last opened in it.
  const pickSpace = (kind, firstId) => {
    const list = (staffOv?.programmes || []).filter((p) => (p.kind || 'vip') === kind)
    let id = firstId
    try { const last = localStorage.getItem(`${STAFF_PICK}_${kind}`); if (list.some((p) => p.id === last)) id = last } catch { /* private mode */ }
    pickProgramme(id, kind)
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
    if (window.scrollY > 320) gentleScrollToSelector('[data-vip-anchor]')
  }
  // The name for the banner. From the market's list when it has them, or straight from their profile - a VIP opened
  // from the Creators page may be in another market than the one this page last showed.
  const [whoProfile, setWhoProfile] = useState(null)
  useEffect(() => {
    if (!who) return undefined
    let alive = true
    profilesApi.profiles().select('id, name').eq('id', who).maybeSingle().then(({ data }) => { if (alive) setWhoProfile(data || null) })
    return () => { alive = false }
  }, [who])
  const whoName = who ? ((people || []).find((p) => p.id === who)?.name || (whoProfile?.id === who ? whoProfile.name : null)) : null

  // While the staff question is still being asked, keep the skeleton rather than flashing "not a VIP".
  const staffShown = previewing ? (staffOv === undefined ? undefined : previewOv) : staffOv
  const overview = meMode
    ? (own === undefined ? undefined : own)
    : staffMode ? (staffShown === undefined ? undefined : staffShown)
    : own === null ? (access === undefined ? undefined : null) : own
  const reload = staffMode ? (previewing ? loadPreview : loadStaff) : reloadOwn
  const isStaff = !!overview?.staff
  // The member being previewed, or null for "a new VIP" / not previewing.
  const previewWho = previewing ? who : null
  const asked = params.get('tab') === 'leaderboard' ? 'board' : params.get('tab')
  const selfStaff = !isStaff && !!overview?.member?.staff_self
  const hiddenTabs = isStaff ? STAFF_HIDDEN : previewing ? PREVIEW_HIDDEN : selfStaff ? SELF_STAFF_HIDDEN : null
  const allowed = ['month', 'videos', 'stats', 'payouts', 'earnings', 'board', 'earn', 'perks', 'ideas', 'library', 'map', 'recap'].filter((k) => !hiddenTabs?.has(k))
  const tab = allowed.includes(asked) ? asked : 'month'
  const go = (v) => { setParams(() => { const n = new URLSearchParams(); if (mode === 'as') { n.set('mode', 'as'); if (who) n.set('who', who); if (params.get('from')) n.set('from', params.get('from')) } if (v !== 'month') n.set('tab', v); return n }, { replace: true }); if (window.scrollY > 320) gentleScrollToSelector('[data-vip-anchor]') }
  const [board, setBoard] = useState(null)
  const [rules, setRules] = useState(null)

  // THE FLAGS BELONG TO A COMMUNITY AND ARE NULL UNTIL THAT ONE LOADS. They started as an empty list, and an empty list
  // draws the globe - so "VIP Spain" opened with a globe that swapped to the Spanish flag a moment later.
  const [codesFor, setCodesFor] = useState({ id: null, codes: null })
  const [boardView, setBoardView] = useState('mine')
  const [look, setLook] = useState(null)

  const programmeId = overview?.programme?.id
  const communityId = overview?.programme?.community_id
  const official = isOfficial(overview?.programme)
  const codes = codesFor.id === communityId ? codesFor.codes : null

  const loadMore = useCallback(async () => {
    if (!programmeId) return
    const none = Promise.resolve({ data: null })
    const sample = !!overview?.sample
    const [bd, rl, cm, pr, me] = await Promise.all([
      (isStaff || sample ? vipRpc('vip_staff_board', { p_programme: programmeId }) : vipRpcAs(previewWho, 'vip_board')).catch(() => []),
      // What runs in this market, plus whatever is for EVERY VIP creator (set on VIP Worldwide).
      // An official programme runs only its own bonuses; the ones set for every VIP are not theirs (migration 376).
      official
        ? vipApi.bonusRules().select('*').eq('programme_id', programmeId).eq('active', true).order('created_at')
        : vipApi.bonusRules().select('*').or(`programme_id.eq.${programmeId},audience.eq.all`).eq('active', true).order('created_at'),
      marketsApi.communities().select('country_codes').eq('id', communityId).maybeSingle(),
      vipApi.programmes().select('tagline').eq('id', programmeId).maybeSingle(),
      isStaff || sample ? none : vipApi.members().select('headline').eq('profile_id', previewWho || user.id).maybeSingle(),
    ])
    setLook({ tagline: pr.data?.tagline || null, headline: me.data?.headline || null })
    setBoard(bd || [])
    setRules(rl.data || [])

    setCodesFor({ id: communityId, codes: cm.data?.country_codes || [] })
  }, [programmeId, communityId, user.id, isStaff, previewWho, overview?.sample, official])
  useEffect(() => { loadMore() }, [loadMore])

  const [walletVersion, setWalletVersion] = useState(0)
  const refresh = (opts) => { reload(); loadMore(); if (opts?.watch) setWatching((n) => n + 1) }
  // A NEW VIDEO'S FIRST READING, WITHOUT A REFRESH. The reading is asked for the moment a video is added; this asks the
  // page again every few seconds until every new video has its first number (or two minutes pass).
  const [watching, setWatching] = useState(0)
  const waiting = (overview?.videos || []).some((v) => v.status === 'tracking' && !v.synced_at && !v.error)
  useEffect(() => {
    if (!watching || !waiting) return undefined
    const id = setInterval(reload, 4000)
    const stop = setTimeout(() => clearInterval(id), 120000)
    return () => { clearInterval(id); clearTimeout(stop) }
  }, [watching, waiting, reload])

  // ADMIN PREVIEW OF THE LOCKED PAGE: `?locked=1` shows what a creator who is not a VIP sees, for the Testing Centre.
  // Admin only, so the address does nothing for anybody else.
  if (isAdmin && params.get('locked') === '1') return <VipLockedPage />
  if (overview === undefined) {
    return (
      <div className="page max-w-5xl">
        <Skeleton className="mb-5 h-10 w-40" />
        <Skeleton className="h-56 w-full rounded-card" />
        <Skeleton className="mt-5 h-12 w-full rounded-xl" />
      </div>
    )
  }
  // MY VIDEOS, NOT TRACKED YET (or switched off): the one card that starts it.
  const officialProgs = (staffOv?.programmes || []).filter((p) => p.kind === 'official')
  const startStaffSelf = async (programmeId, onBoard) => {
    await vipRpc('vip_staff_self', { p_programme: programmeId, p_track: true, p_on_board: onBoard })
    await reloadOwn()
  }
  if (meMode && (overview === null || (overview.member?.staff_self && overview.member.status === 'left'))) {
    return (
      <div className="page max-w-5xl">
        <PageHeader title={tr('My videos')} inlineAction />
        <StaffControl isMobile={isMobile} programmes={staffOv?.programmes || []} mode={mode} onSpace={pickSpace} onMode={pickView} official canSelf={officialProgs.length > 0} />
        <StaffSelfStart programmes={officialProgs} was={overview?.member?.staff_self ? overview.programme?.id : null} onStart={startStaffSelf} />
      </div>
    )
  }
  // NOT A VIP AND NOT THE TEAM: the locked VIP community page, not a dead end.
  if (overview === null) return <VipLockedPage />

  const { programme, member, month, stats } = overview
  const cur = programme.currency
  const left = daysLeft(month.ends_at)
  const paused = member.status !== 'active'
  // EVERY VIDEO EVER, in ONE grid of cards, three across beside the section column (15 Oct 2026). The rows past the sixth
  // used to drop below the column four across, and a four-across card is a different size from a three-across one, so the
  // page read as two mismatched grids. One grid, one card size; the section column stays in view beside it.
  const allVideos = (overview.videos || []).filter((v) => v.status !== 'removed')

  const programmes = staffOv?.programmes || overview.programmes || []
  const space = programme.kind || 'vip'
  const spaceProgrammes = programmes.filter((p) => (p.kind || 'vip') === space)
  return (
    <VipPreviewContext.Provider value={previewWho}>
    <ProgrammeKindContext.Provider value={programme.kind || 'vip'}>
    <div className="page max-w-5xl">
      <PageHeader
        title={meMode ? tr('My videos') : official ? tr('Official creators') : tr('VIP')}
        inlineAction
        // THE FLAG, IN WHITE.
        // ON A PHONE THE MARKETS MOVE INTO THE CONTROL CARD, as a row that scrolls - see below.
        // ONE CONTROL IN BOTH SPACES, AND IT CROSS-FADES. The team: switching from VIP community to official creators,
        // "Tryp.com Official Spain" in the top right had a UI bug. The VIP space drew the market switch and the official
        // space (one market) a differently shaped pill, swapped in on the same frame. For the team the same switch is
        // drawn either way (one market = one lit chip), keyed by the space so it rises in.
        action={staffMode && spaceProgrammes.length > 0
          ? (isMobile && spaceProgrammes.length > 1 ? null : (
            <span key={space} className="inline-flex animate-tab-in">
              <ProgrammeSwitch programmes={spaceProgrammes} value={programme.id} onChange={(id) => pickProgramme(id, space)} />
            </span>
          ))
          : <ProgrammePill name={programme.name} codes={codes} official={official} />}
      />

      {/* ONE CONTROL CARD FOR THE TEAM: which community, then page or tools - side by side on a desktop, stacked on a
          phone. It was two cards and a sentence, four rows of navigation before anything to read. */}
      {meMode && <StaffControl isMobile={isMobile} programmes={programmes} mode={mode} onSpace={pickSpace} onMode={pickView} official canSelf />}
      {meMode && selfStaff && <StaffSelfBar overview={overview} onChanged={reloadOwn} />}
      {staffMode && (mode === 'as'
        ? <PreviewBanner name={whoName} market={programme.name} fromCreators={params.get('from') === 'creators'} onBack={() => (params.get('from') === 'creators' ? navigate(-1) : setParams({ mode: 'tools', tab: 'preview' }, { replace: true }))} />
        : (
          // THE PHONE'S CONTROL CARD. Three plain rows, each the full width: which community, which market (a row that
          // scrolls), then page or tools as two equal halves. The desktop keeps its one-line card.
          isMobile ? (
            <div className="relative z-20 mb-4 space-y-2 rounded-card border border-gray-100 bg-white p-2 shadow-card animate-rise">
              <SpaceSwitch bare programmes={programmes} value={space} onChange={pickSpace} />
              {staffMode && spaceProgrammes.length > 1 && (
                <ProgrammeSwitch row programmes={spaceProgrammes} value={programme.id} onChange={(id) => pickProgramme(id, space)} />
              )}
              <StaffBar mode={mode} onMode={pickView} official={official} full canSelf={programmes.some((p) => p.kind === 'official')} />
            </div>
          ) : (
          <div className="relative z-20 mb-4 flex flex-col gap-1.5 rounded-card border border-gray-100 bg-white p-1.5 shadow-card animate-rise lg:flex-row lg:items-center">
            <SpaceSwitch bare programmes={programmes} value={space} onChange={pickSpace} />
            <StaffBar mode={mode} onMode={pickView} official={official} canSelf={programmes.some((p) => p.kind === 'official')} />
          </div>
          )
        ))}

      {/* PAGE AND TOOLS CROSS OVER, THEY DO NOT CUT. Each view arrives in its own keyed wrapper with a short fade and
          lift (`vip-mode-in`), the tools' code and markets are already warm (above), and the fallback is the tools' own
          outline rather than one grey block. */}
      {toolsMode && staffMode ? <div key="tools" className="vip-mode-in"><Suspense fallback={<VipToolsFallback />}><VipTools programmeId={staffOv?.programme?.id || programme.id} /></Suspense></div> : (<div key="page" className="vip-mode-in">

      {/* ---------------- this month, live ---------------- */}
      {tab === 'month' && <section
        key={programme.id}
        data-tour="vip-earnings"
        className="relative mb-5 overflow-hidden rounded-card bg-gradient-to-br from-brand via-[#ec6323] to-brand-light p-5 text-white shadow-lift animate-rise sm:p-7"
      >
        <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/40" /><span className="relative inline-flex h-2 w-2 rounded-full bg-white" /></span>
              {isStaff ? (official ? tr('{m} so far, every official creator', { m: monthLabel(month.year, month.month) }) : tr('{m} so far, every VIP', { m: monthLabel(month.year, month.month) })) : tr('{m} so far', { m: monthLabel(month.year, month.month) })}
            </p>
            {!isStaff && !selfStaff && look?.tagline && <p className="mt-1 text-sm font-semibold text-white/80"><ReaderText text={look.tagline} /></p>}
            <p className="mt-2 text-5xl font-bold tabular-nums tracking-tight sm:text-6xl">
              {selfStaff
                ? <CountUp duration={VIP_COUNT_MS} value={Number(stats.views) || 0} format={formatViews} />
                : <CountUp duration={VIP_COUNT_MS} value={stats.base} format={(n) => money(n, cur)} />}
            </p>
            <p className="mt-2 text-sm text-white/85">
              {selfStaff
                ? tr('Views your own videos gained this month, from {n} videos', { n: stats.videos })
                : isStaff
                ? tr('{n} views counted across {m} this month, at {r} per 1,000', { n: nf(stats.views), m: programme.name, r: perK(stats.effective_cpm, cur) })
                : tr('{n} views counted this month, at {r} per 1,000', { n: nf(stats.views), r: perK(stats.effective_cpm, cur) })}
            </p>
            {!isStaff && official && Number(member.monthly_fee) > 0 && (
              <p className="mt-1 text-sm font-semibold text-white">{member.fee_min_videos
                ? tr('Plus your {a} monthly fee once you reach {n} videos ({v} so far).', { a: money(member.monthly_fee, cur, { cents: false }), n: member.fee_min_videos, v: stats.videos })
                : tr('Plus your {a} monthly fee.', { a: money(member.monthly_fee, cur, { cents: false }) })}</p>
            )}
            {stats.projected_base != null && !selfStaff && (
              <p className="mt-1 text-sm font-semibold text-white">{tr('On pace for about {a} by the end of the month.', { a: money(isStaff ? stats.projected_base : projectedMonthEarnings(stats, member, programme), cur, { cents: false }) })}</p>
            )}
          </div>
          <dl className="hidden w-full grid-cols-3 gap-2.5 sm:grid sm:w-auto sm:gap-3">
            <HeroStat label={tr('Days left')} value={String(left)} />
            <HeroStat label={tr('Videos')} value={String(stats.videos)} />
            {isStaff
              ? <HeroStat label={official ? tr('Creators') : tr('VIPs')} value={String(stats.members ?? 0)} />
              : <HeroStat label={tr('Rank')} value={stats.rank ? `#${stats.rank}` : '-'} hint={stats.of ? tr('of {n}', { n: stats.of }) : ''} />}
          </dl>
        </div>
      </section>}

      {paused && <p className="mb-4 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{official ? tr('Your place is paused, so new views are not being counted. Ask the team if that is a surprise.') : tr('Your VIP place is paused, so new views are not being counted. Ask your market lead if that is a surprise.')}</p>}
      {!overview.payment_ready && !selfStaff && <div className="mb-4"><PaymentBanner /></div>}

      {/* Phones and tablets: the sections as a strip of chips. */}
      <div className="mb-5 lg:hidden"><VipChipNav value={tab} onChange={go} hidden={hiddenTabs} links={isStaff ? null : VIP_LINKS} official={official} /></div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-7">
      <div key={tab} className="min-w-0">
        {tab === 'month' && (
          <div className="vip-stage space-y-5">
            {isStaff && <TeamPulse programme={programme} onTool={(t) => setParams({ mode: 'tools', tab: t }, { replace: true })} />}
            <VipAnnouncements programmeId={programme.id} />
            {/* SUBMITTING COMES FIRST. */}
            {!isStaff && <VipSubmit disabled={paused || previewing} month={month} rules={rules} onAdded={refresh} />}
            <VipChallengeCard overview={overview} />

            {isStaff ? (
              <>
                <PayStrip staff member={member} programme={programme} stats={stats} month={month} cur={cur} />
                <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="trophy" className="h-5 w-5 text-brand" />{tr('Leaderboard')}</h2>
                    {board?.length > 5 && <button type="button" onClick={() => go('board')} className="text-xs font-semibold text-brand hover:underline">{tr('Full leaderboard')}</button>}
                  </div>
                  {board !== null && board.length === 0
                    ? <p className="rounded-xl bg-cloud/60 px-4 py-8 text-center text-sm text-smoke">{tr('No videos counted in {m} yet this month.', { m: programme.name })}</p>
                    : <StaffBoard programme={programme} monthRows={board} rules={rules} month={month} limit={6} onFull={() => go('board')} />}
                </section>
              </>
            ) : (
              <>
                {/* SMALL, THEN THE TARGET, THEN THE PAY: the stay-in rule is a one-row card now. */}
                {selfStaff ? null : official ? <FeeProgressCard member={member} stats={stats} cur={cur} /> : <StayInCard compact />}
                <div className={cx('grid grid-cols-1 gap-4', !selfStaff && 'lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]')}>
                  <TargetCard member={member} stats={stats} onSetGoal={previewing ? null : () => go('stats')} />
                  {!selfStaff && <HowPaidCard stats={stats} cur={cur} member={member} />}
                </div>
                <LatestVideos videos={overview.videos} cpm={stats.effective_cpm} currency={cur} onSeeAll={() => go('videos')} onChanged={refresh} />
              </>
            )}
          </div>
        )}

        {tab === 'videos' && (
          <div className="vip-stage space-y-5">
            <VipSubmit disabled={paused || previewing} month={month} rules={rules} onAdded={refresh} />
            {allVideos.length === 0
              ? <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('No videos yet. Paste a link above and it starts counting.')}</p>
              : (
                <>
                  <h2 className="flex items-baseline gap-2 text-[15px] font-bold text-ink">{tr('Every video you have added')}<span className="text-xs font-semibold text-smoke">{allVideos.length}</span></h2>
                  <ul className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
                    {allVideos.map((v, i) => <VipVideoCard key={v.id} video={v} cpm={stats.effective_cpm} currency={cur} onRemoved={refresh} delay={Math.min(i, 8) * 45} rules={rules} month={month} />)}
                  </ul>
                </>
              )}
          </div>
        )}

        {tab === 'stats' && (
          <div className="vip-stage space-y-5">
            <VipStats overview={overview} rules={rules} programmeId={programme.id} />
            <VipMySettings overview={overview} onSaved={refresh} />
          </div>
        )}

        {tab === 'payouts' && <VipWallet onChanged={() => { setWalletVersion((n) => n + 1); refresh() }} />}

        {tab === 'earnings' && <VipMyEarnings walletVersion={walletVersion} onWallet={() => go('payouts')} />}

        {tab === 'board' && (
          <div className="vip-stage space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-bold text-ink"><Icon name="trophy" className="h-5 w-5 text-brand" />{tr('Leaderboard')}</h2>
              {/* ONLY THE TEAM COMPARES MARKETS. A VIP sees their own market's board and nothing from other countries. */}
              {isStaff && (
                <Segmented
                  value={boardView}
                  onChange={setBoardView}
                  label={tr('Leaderboard view')}
                  size="sm"
                  options={[{ value: 'mine', label: <><ProgrammeFlags codes={codes} />{programme.name}</> }, { value: 'markets', label: <><Icon name="globe" className="h-3.5 w-3.5" />{official ? tr('Every market') : tr('All markets')}</> }]}
                />
              )}
            </div>
            {boardView === 'mine' || !isStaff ? (
              <div className="space-y-3">
                {isStaff
                  ? <StaffBoard programme={programme} monthRows={board} rules={rules} month={month} />
                  : board === null ? <Skeleton className="h-48 w-full rounded-card" /> : <VipBoardList rows={board} rules={rules} currency={cur} month={month} />}
              </div>
            ) : (
              <MarketStandings kind={space} />
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
            {rules === null ? <Skeleton className="h-48 w-full rounded-card" /> : <VipEarn rules={rules} overview={overview} currency={cur} onAnswer={() => go('videos')} />}
          </div>
        )}

        {tab === 'ideas' && <Suspense fallback={<Skeleton className="h-96 w-full" />}><VideoIdeasBoard compact /></Suspense>}
        {tab === 'library' && <VipLibrary programmeId={programme.id} />}
        {tab === 'map' && <VipMap />}
        {tab === 'recap' && <VipRecapPanel m={params.get('m')} onPick={(k) => setParams({ tab: 'recap', m: k }, { replace: true })} />}
      </div>

      {/* Desktop: the sections, in a column that stays in view. */}
      {/* NO QUICK LINKS CARD. The team: the links to the VIP rooms "are unnecessary. You can remove the quick link card
          entirely and just have the other right column"; a VIP's recap and portfolio join the sections. */}
      <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block">
        <VipSideNav value={tab} onChange={go} hidden={hiddenTabs} links={isStaff ? null : VIP_LINKS} official={official} unpaid={selfStaff} />
        {!isStaff && !selfStaff && <VipBalanceMini onOpen={() => go('payouts')} />}
      </aside>
      </div>

      </div>)}

      {/* NO TERMS SHEET HERE ANY MORE. The team: the VIP page's own terms "shouldn't be here anymore if we have the
          other one" - the signed VIP agreement, asked for by AgreementGate once it is published on Admin > Agreements.
          `terms_ok` now means "signed the published VIP agreement" (vip_terms_ok, migration 360). */}
    </div>
    </ProgrammeKindContext.Provider>
    </VipPreviewContext.Provider>
  )
}

function VipToolsFallback() {
  return (
    <div aria-busy="true">
      <div className="mb-3 grid grid-cols-5 gap-1.5 rounded-card border border-gray-100 bg-white p-1.5 shadow-card sm:gap-2 sm:p-2">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 rounded-xl" />)}
      </div>
      <Skeleton className="h-72 w-full rounded-card" />
    </div>
  )
}

// PAGE OR TOOLS: one sliding gradient, nothing else to choose. Sits inside the team's control card.
function StaffBar({ mode, onMode, official = false, full = false, canSelf = false }) {
  const tr = useKindT()
  return (
    <div className={cx('flex shrink-0 justify-center', full ? '' : 'px-1 pb-1 lg:px-1.5 lg:pb-0')}>
      <Segmented
        className={full ? cx('!grid w-full [&>button>span]:justify-center [&>button]:!py-2 [&>button]:!text-[13px]', canSelf ? 'grid-cols-3' : 'grid-cols-2') : undefined}
        size="sm"
        id="vip-staff-mode"
        label={tr('How to see this page')}
        value={mode}
        onChange={onMode}
        options={[
          { value: 'page', label: <><Icon name={official ? 'badge' : 'star'} className="h-3.5 w-3.5" />{official ? tr('Their page') : tr('VIP page')}</> },
          { value: 'tools', label: <><Icon name="key" className="h-3.5 w-3.5" />{official ? tr('Tools') : tr('VIP tools')}</> },
          ...(canSelf ? [{ value: 'me', label: <><Icon name="video" className="h-3.5 w-3.5" />{tr('My videos')}</> }] : []),
        ]}
      />
    </div>
  )
}

// THE TEAM'S CONTROL CARD IN "MY VIDEOS": both spaces unlit (pressing one goes back to its page) and the view switch.
function StaffControl({ isMobile, programmes, mode, onSpace, onMode, official, canSelf }) {
  return isMobile ? (
    <div className="relative z-20 mb-4 space-y-2 rounded-card border border-gray-100 bg-white p-2 shadow-card animate-rise">
      <SpaceSwitch bare programmes={programmes} value={null} onChange={onSpace} />
      <StaffBar mode={mode} onMode={onMode} official={official} full canSelf={canSelf} />
    </div>
  ) : (
    <div className="relative z-20 mb-4 flex flex-col gap-1.5 rounded-card border border-gray-100 bg-white p-1.5 shadow-card animate-rise lg:flex-row lg:items-center">
      <SpaceSwitch bare programmes={programmes} value={null} onChange={onSpace} />
      <StaffBar mode={mode} onMode={onMode} official={official} canSelf={canSelf} />
    </div>
  )
}

// MY VIDEOS, THE FIRST TIME (migration 436). The team (Marta runs Official Spain and posts too): track your own videos
// like an official creator - views read automatically, on your own page - without pay and without a second account.
function StaffSelfStart({ programmes, was, onStart }) {
  const tr = useKindT()
  const [pick, setPick] = useState(() => (programmes.some((p) => p.id === was) ? was : programmes[0]?.id || null))
  const [onBoard, setOnBoard] = useState(true)
  const [busy, setBusy] = useState(false)
  const chosen = pick && programmes.some((p) => p.id === pick) ? pick : programmes[0]?.id
  const start = async () => {
    if (!chosen) return
    setBusy(true)
    try { await onStart(chosen, onBoard) } catch (e) { notice(e.message || String(e)) } finally { setBusy(false) }
  }
  if (!programmes.length) {
    return <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke animate-rise">{tr('Your own videos are tracked in an official creators programme, and you do not run one yet.')}</p>
  }
  return (
    <section className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-rise">
      <div className="bg-gradient-to-br from-brand-tint via-white to-white px-5 pb-4 pt-6 sm:px-7">
        <Icon name="video" className="h-7 w-7 text-brand" />
        <h2 className="mt-3 text-xl font-bold text-ink">{was ? tr('Track your own videos again') : tr('Track your own videos')}</h2>
        <p className="mt-1.5 max-w-xl text-sm text-smoke">{tr('Add the TikTok, Instagram and Facebook videos you post for Tryp.com and their views are read automatically, the same as an official creator\'s. They are not paid through the platform, and you stay the team everywhere else.')}</p>
      </div>
      <div className="space-y-4 px-5 pb-6 pt-2 sm:px-7">
        {programmes.length > 1 && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-smoke">{tr('Tracked in')}</p>
            <div className="flex flex-wrap gap-2">
              {programmes.map((p) => (
                <button key={p.id} type="button" onClick={() => setPick(p.id)} className={pickClass(chosen === p.id, 'rounded-full border px-3.5 py-2 text-sm font-semibold')}>{p.name}</button>
              ))}
            </div>
          </div>
        )}
        <label className="flex items-start gap-3 rounded-xl bg-cloud/70 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">{tr('Count me on the board and in the bonuses')}</span>
            <span className="mt-0.5 block text-xs text-smoke">{onBoard
              ? tr('You show on the official creators\' leaderboard and in its totals, like everybody else.')
              : tr('Only you see your videos and views. Nobody else\'s board, totals or bonuses include you.')}</span>
          </span>
          <Toggle on={onBoard} onChange={setOnBoard} label={tr('Count me on the board and in the bonuses')} />
        </label>
        <button type="button" disabled={busy || !chosen} onClick={start} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-light px-5 py-2.5 text-sm font-bold text-white shadow-card transition-transform duration-200 disabled:opacity-60 hoverable:hover:scale-105">
          <Icon name="video" className="h-4 w-4" />{busy ? tr('Starting…') : was ? tr('Track my videos again') : tr('Start tracking my videos')}
        </button>
      </div>
    </section>
  )
}

// MY VIDEOS, WHILE TRACKING: where they are tracked, whether they count on the board, and the way out.
function StaffSelfBar({ overview, onChanged }) {
  const tr = useKindT()
  const [busy, setBusy] = useState(false)
  const onBoard = overview.member?.on_board !== false
  const run = async (track, board) => {
    setBusy(true)
    try { await vipRpc('vip_staff_self', { p_programme: overview.programme.id, p_track: track, p_on_board: board }); await onChanged() }
    catch (e) { notice(e.message || String(e)) } finally { setBusy(false) }
  }
  const stop = async () => {
    if (!(await confirm(tr('Your videos stay saved, but no new views are read and you leave the board. You can start again any time.'), { title: tr('Stop tracking your videos?'), confirmLabel: tr('Stop tracking') }))) return
    run(false, null)
  }
  return (
    <div className="relative z-10 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-card border border-gray-100 bg-white px-4 py-3 shadow-card animate-rise">
      <span className="w-full min-w-0 text-sm sm:w-auto sm:flex-1">
        <span className="flex items-center gap-1.5 font-bold text-ink"><Icon name="video" className="h-4 w-4 text-brand" />{tr('Your own videos')}</span>
        <span className="block text-xs text-smoke">{tr('Tracked in {p}. {n} views this month.', { p: overview.programme.name, n: formatViews(overview.stats?.views || 0) })}</span>
      </span>
      <span className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
        <label className="flex items-center gap-2 text-xs font-semibold text-ink">
          {tr('On the board')}
          <Toggle size="sm" on={onBoard} disabled={busy} onChange={(v) => run(true, v)} label={tr('Count me on the board and in the bonuses')} />
        </label>
        <button type="button" disabled={busy} onClick={stop} className="inline-flex min-h-9 items-center rounded-full bg-cloud px-3.5 py-1.5 text-xs font-bold text-smoke transition-transform duration-200 disabled:opacity-60 hoverable:hover:scale-105">{tr('Stop tracking')}</button>
      </span>
    </div>
  )
}

// LOOKING AT ONE VIP'S PAGE: says whose, says it is read only, and leads back to where it was opened.
function PreviewBanner({ name, market, onBack, fromCreators = false }) {
  const tr = useKindT()
  return (
    <div className="relative z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-cloud px-3 py-2 text-ink animate-rise">
      <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white sm:flex"><Icon name="eye" className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-bold">{name ? tr('{n}\'s VIP page', { n: name }) : tr('A new VIP\'s first day in {m}', { m: market })}</span>
        <span className="block text-xs text-smoke">{tr('Read only. Exactly what they see.')}</span>
      </span>
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-bold text-ink transition-transform duration-200 hoverable:hover:scale-105">
        <Icon name="chevronLeft" className="h-3.5 w-3.5" /><span className="sm:hidden">{tr('Back')}</span><span className="hidden sm:inline">{fromCreators ? tr('Back') : tr('Back to VIP tools')}</span>
      </button>
    </div>
  )
}

function HeroStat({ label, value, hint }) {
  return (
    <div className="min-w-[4.6rem] rounded-2xl border border-white/20 bg-white/15 px-3.5 py-3 text-center backdrop-blur-sm">
      <dd className="text-2xl font-bold tabular-nums leading-none">{value}</dd>
      <dt className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-white/80">{label}{hint ? ` ${hint}` : ''}</dt>
    </div>
  )
}

function ProgrammeFlags({ codes }) {
  return codes?.length ? <span className="text-[13px] leading-none">{codes.slice(0, 2).map((c) => String.fromCodePoint(...[...c.toUpperCase()].map((ch) => 127397 + ch.charCodeAt(0)))).join('')}</span> : null
}

// HOW THEY ARE PAID, AS FACTS. For the team it is one strip of tiles across the page instead of a tall card beside the
// leaderboard; for a VIP it is the same tiles in a card beside their target. Every rate shows its cents: €0.30, never
// €0.3.
function PayStrip({ member, programme, stats, month, cur, staff = false }) {
  const tr = useKindT()
  const official = programme.kind === 'official'
  const steps = member.tiers?.length ? member.tiers : !member.cpm ? programme.tiers : null
  const cap = member.monthly_cap || programme.monthly_cap
  // AN OFFICIAL CREATOR'S DEAL IS THEIR OWN. For the team it said one programme rate, while every official creator is on
  // their own rate and monthly fee (Marta 80 + 0.30, Ariakna 100 + 0.30 for 30 videos...). So the team sees the shared
  // rules once and then each creator's deal, one row each.
  const [deals, setDeals] = useState(null)
  useEffect(() => {
    if (!staff || !official) return undefined
    let alive = true
    vipApi.members().select('profile_id, cpm, monthly_fee, fee_min_videos, monthly_cap, invoice_outside, profiles:profile_id(name, photo_url)')
      .eq('programme_id', programme.id).eq('status', 'active')
      .then(({ data }) => { if (alive) setDeals((data || []).sort((a, b) => (Number(b.monthly_fee) || 0) - (Number(a.monthly_fee) || 0) || (a.profiles?.name || '').localeCompare(b.profiles?.name || ''))) })
    return () => { alive = false }
  }, [staff, official, programme.id])
  const facts = [
    ...(staff && official ? [] : [{ icon: 'money', label: staff ? tr('Rate') : tr('Your rate'), value: perK(stats.effective_cpm, cur), hint: tr('per 1,000 views') }]),
    ...(steps?.length && !(staff && official) ? steps.map((t) => ({ icon: 'trendUp', label: tr('From {n} views', { n: nf(t.from_views) }), value: perK(t.cpm, cur), hint: tr('per 1,000 views') })) : []),
    { icon: 'video', label: tr('What counts'), value: tr('New videos'), hint: tr('posted in {m}', { m: monthLabel(month.year, month.month) }) },
    { icon: 'calendar', label: tr('Paid'), value: tr('Monthly'), hint: tr('after the month closes') },
    ...(!staff && Number(member.monthly_fee) > 0 ? [{ icon: 'wallet', label: tr('Monthly bonus'), value: money(member.monthly_fee, cur, { cents: false }), hint: member.fee_min_videos ? tr('with {n}+ videos', { n: member.fee_min_videos }) : tr('every month') }] : []),
    ...(cap && !(staff && official) ? [{ icon: 'shield', label: tr('Monthly cap'), value: money(cap, cur, { cents: false }), hint: tr('on views pay') }] : []),
  ]
  return (
    <section className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-rise">
      <h2 className="flex items-center gap-2 px-5 pt-4 text-[15px] font-bold text-ink"><Icon name="money" className="h-5 w-5 text-brand" />{staff ? (official ? tr('How the official creators are paid') : tr('How VIPs here are paid')) : tr('How you are paid')}</h2>
      {/* The facts as one even row, divided by hairlines rather than boxed in grey, so a short row never leaves a hole. */}
      <dl className={cx('mt-3 grid divide-gray-100 border-t border-gray-100', facts.length > 2 ? 'grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] sm:divide-x' : 'grid-cols-2 divide-x')}>
        {facts.map((f, i) => (
          <div key={`${f.label}${i}`} className="min-w-0 px-5 py-3.5 animate-rise" style={{ animationDelay: `${i * 45}ms` }}>
            <dt className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-400"><Icon name={f.icon} className="h-3.5 w-3.5 shrink-0 text-brand" />{f.label}</dt>
            <dd className="mt-1 text-lg font-bold leading-tight tabular-nums text-ink">{f.value}</dd>
            <dd className="text-[12px] leading-snug text-smoke">{f.hint}</dd>
          </div>
        ))}
      </dl>
      {staff && official && (
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="mb-2.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{tr('Each creator\'s deal')}</p>
          {deals === null ? <Skeleton className="h-24 w-full rounded-xl" /> : deals.length === 0 ? <p className="text-sm text-smoke">{tr('Nobody in this programme yet.')}</p> : (
            <ul className="divide-y divide-gray-50">
              {deals.map((d, i) => {
                const fee = Number(d.monthly_fee) || 0
                return (
                  <li key={d.profile_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <span className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Avatar src={d.profiles?.photo_url} name={d.profiles?.name} size="sm" />
                      <span className="truncate text-sm font-semibold text-ink">{d.profiles?.name || tr('Creator')}</span>
                      {d.invoice_outside && <span className="shrink-0 rounded-full bg-cloud px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-smoke">{tr('Invoices outside')}</span>}
                    </span>
                    <span className="flex items-center gap-4 text-right text-[13px] tabular-nums">
                      <span><span className="font-bold text-ink">{perK(d.cpm ?? stats.effective_cpm, cur)}</span> <span className="text-smoke">{tr('per 1,000')}</span></span>
                      <span className="min-w-[8.5rem]">{fee > 0
                        ? <><span className="font-bold text-ink">+ {money(fee, cur, { cents: false })}</span> <span className="text-smoke">{d.fee_min_videos ? tr('a month, {n}+ videos', { n: d.fee_min_videos }) : tr('a month')}</span></>
                        : <span className="text-smoke">{tr('No monthly fee')}</span>}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

// THE MONTHLY FEE, AS A GOAL. An official creator's contract pays a fixed fee for a month with enough videos (Ariakna:
// EUR 100 for 30). That is what they are working towards, so it takes the place the VIP stay-in card has.
function FeeProgressCard({ member, stats, cur }) {
  const tr = useKindT()
  const fee = Number(member.monthly_fee) || 0
  if (!fee) return null
  const need = Number(member.fee_min_videos) || 0
  const done = !need || stats.videos >= need
  return (
    <section className={cx('rounded-card border bg-white px-4 py-3.5 shadow-card animate-rise', done ? 'border-brand/25' : 'border-gray-100')}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[13.5px] font-bold text-ink"><Icon name="badge" className="h-4 w-4 text-brand" />{tr('Your {a} monthly fee', { a: money(fee, cur, { cents: false }) })}</h2>
        <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors duration-500', done ? 'bg-brand text-white' : 'bg-cloud text-smoke')}>{done ? tr('Earned this month') : tr('Not yet')}</span>
      </div>
      {need > 0
        ? <div className="mt-3"><TargetBar label={tr('Videos this month')} value={stats.videos} target={need} done={tr('Reached')} /></div>
        : <p className="mt-1.5 text-xs text-smoke">{tr('Paid with your views pay at the end of every month.')}</p>}
    </section>
  )
}
