import { useCallback, useEffect, useState } from 'react'
import { ProgrammeKindContext, useKindT } from '../../lib/vip'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { EmptyState, Skeleton } from '../ui'
import Icon from '../Icon'
import { motion } from 'motion/react'
import { SPRING } from '../../lib/motion'
import { cx } from '../../lib/utils'
import { VipMembersTab, VipOverviewTab } from './adminA'
import { VipAccessTab } from './access'
import { VipContentTab, VipMarketsTab } from './adminD'
import { AnnouncementsTab } from './announce'
import { SyncEvery, VipBonusesTab, VipCloseTab, VipSettingsTab } from './adminB'
import { VipAnalyticsTab } from './analytics'
import { VipKpiTab } from './kpis'
import { VipPreviewTab } from './preview'
import { VipQuestionsTab, VipVideosTab } from './videosTab'
import { VipCertificatesTab } from './certificates'
import { VipRequirementsTab, VipRulesCard, VipSheetTab, VipWalletsTab } from './teamTools'
import { vipApi } from '../../api/vip'

// THE VIP TOOLS, INSIDE THE VIP PAGE.
//
// So /admin/vip is gone as a page of its own (it redirects here) and the tools are the third view of the team's VIP
// page: As a creator, Team overview, VIP tools. The market is the page's own switch at the top, so the tools always show
// the market the rest of the page is showing.
//
// The tools are grouped the way a month runs - People, Money, Content, Numbers, Setup - so fourteen tabs read as five
// short rows instead of one strip you scroll sideways on a phone. Once a tool is opened it stays mounted (hidden) for
// that market, so going back to it is instant.
// SIX GROUPS (14 Oct 2026): Videos is its own group now - every video in the market, and the questions asked on each
// one - instead of a list at the foot of People. "It's hard to understand where stuff is."
const GROUPS = [
  { key: 'people', label: 'People', icon: 'users', tabs: [['overview', 'Overview'], ['members', 'Members'], ['requirements', 'Stay-in check'], ['preview', 'See as a VIP']] },
  { key: 'videos', label: 'Videos', icon: 'video', tabs: [['videos', 'All videos'], ['questions', 'Video questions']] },
  { key: 'money', label: 'Money', icon: 'wallet', tabs: [['wallets', 'Balances'], ['close', 'Month end'], ['sheet', 'CPM sheet'], ['bonuses', 'Bonuses and perks']] },
  { key: 'content', label: 'Content', icon: 'megaphone', tabs: [['announcements', 'Announcements'], ['challenges', 'Monthly challenges'], ['guides', 'Guides'], ['certificates', 'Certificates']] },
  { key: 'numbers', label: 'Numbers', icon: 'chart', tabs: [['analytics', 'Analytics'], ['kpis', 'KPIs']] },
  { key: 'setup', label: 'Setup', icon: 'key', tabs: [['settings', 'Settings'], ['markets', 'Markets'], ['access', 'Access']] },
]
const ALL = GROUPS.flatMap((g) => g.tabs.map(([k]) => k))
// WHAT AN OFFICIAL PROGRAMME DOES NOT HAVE: no stay-in rule (their contract sets what they post) and no VIP markets to
// open, so those two tools are not offered there at all rather than shown switched off.
const NOT_FOR_OFFICIAL = new Set(['requirements', 'markets'])
// A market whose stay-in rule is switched off has no stay-in check to look at; the switch itself is in Settings.
const offered = (k, p, isOwner) => (k !== 'access' || isOwner) && !(p?.kind === 'official' && NOT_FOR_OFFICIAL.has(k))
  && !(k === 'requirements' && p?.req_on === false)

// THE MARKETS ARE ASKED FOR ONCE A SESSION. The team: going from the VIP page to VIP tools "the screen just appears, and
// it's really flashy. Everything loads in." The list of markets (and which ones you can manage) is one query plus one
// per market, and it was asked again on every switch, behind a grey block. It is kept here, and the VIP page warms it
// (and this file) while the team is still looking at the page, so the switch has nothing to wait for.
let programmesCache = null
async function fetchProgrammes(isOwner) {
  const { data } = await vipApi.programmes().select('*, community:community_id(name, slug, country_codes)').order('name')
  const shown = (data || []).filter((p) => p.active || isOwner)
  const oks = await Promise.all(shown.map((p) => vipApi.canManage({ p_programme: p.id }).then((r) => !!r.data)))
  return shown.map((p, i) => ({ ...p, can_manage: oks[i] }))
}

/** The tools' own outline while the first load runs: the same five cards, a row of pills, a panel - so nothing jumps. */
export function VipToolsSkeleton() {
  return (
    <div className="vip-mode-in" aria-busy="true">
      <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-card sm:grid-cols-6 border border-gray-100 bg-white p-1.5 shadow-card sm:gap-2 sm:p-2">
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-11 rounded-xl" />)}
      </div>
      <div className="mb-4 flex gap-2 pt-1.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-24 rounded-full" />)}</div>
      <Skeleton className="h-72 w-full rounded-card" />
    </div>
  )
}

export default function VipTools({ programmeId }) {
  const { isAdmin, profile } = useAuth()
  const isOwner = profile?.platform_role === 'owner'
  const [params, setParams] = useSearchParams()
  const [programmes, setProgrammes] = useState(() => (programmesCache && programmesCache.isOwner === isOwner ? programmesCache.list : null))
  // The tool names follow the programme on screen: "See as a VIP" reads "See as an official creator" there.
  const tr = useKindT((programmes || []).find((p) => p.id === programmeId)?.kind || programmes?.[0]?.kind)
  const [seen, setSeen] = useState(() => new Set())
  // THE TAB IS LOCAL STATE FIRST, THE URL SECOND. The press used to wait for a router update (inside a transition, which
  // React is free to put off) before anything moved. Now the pill and the panel change on the press, and the URL
  // follows.
  const fromUrl = params.get('tab')
  const [picked, setPicked] = useState(fromUrl)
  const [urlSeen, setUrlSeen] = useState(fromUrl)
  if (urlSeen !== fromUrl) { setUrlSeen(fromUrl); setPicked(fromUrl) }
  // The three old content links (?tab=content&part=perks) land on the tab that now holds each one.
  const asked0 = picked === 'content' ? ({ briefs: 'challenges', perks: 'perks', guides: 'guides' }[params.get('part')] || 'challenges') : picked
  // Milestones, perks and trips moved into Bonuses; an old link to them lands there, on the perks side.
  const asked = asked0 === 'perks' ? 'bonuses' : asked0
  const bonusPart = asked0 === 'perks' || params.get('part') === 'perks' ? 'perks' : 'monthly'

  const load = useCallback(async () => {
    const list = await fetchProgrammes(isOwner)
    programmesCache = { isOwner, list }
    setProgrammes(list)
  }, [isOwner])
  useEffect(() => { load() }, [load])

  const go = (t) => {
    setPicked(t)
    setParams((p) => { const n = new URLSearchParams(p); n.set('mode', 'tools'); if (t === 'overview') n.delete('tab'); else n.set('tab', t); n.delete('part'); return n }, { replace: true })
  }

  if (programmes === null) return <VipToolsSkeleton />
  if (programmes.length === 0) {
    return <EmptyState icon={<Icon name="star" className="h-7 w-7" />} title={tr('Nothing to manage here')} hint={tr('The VIP tools are for the owner and the managers they have added to a VIP programme.')} />
  }
  const programme = programmes.find((p) => p.id === programmeId) || programmes[0]
  const tab = ALL.includes(asked) && offered(asked, programme, isOwner) ? asked : 'overview'
  const group = GROUPS.find((g) => g.tabs.some(([k]) => k === tab)) || GROUPS[0]
  // THE OTHER MARKETS OF THE SAME KIND (migration 376): analytics, KPIs and "post to every market" compare VIP markets
  // with VIP markets and official programmes with official programmes, never the two together.
  const sameKind = (p) => programmes.filter((x) => (x.kind || 'vip') === (p.kind || 'vip'))
  const seenKey = `${programme.id}:${tab}`
  if (!seen.has(seenKey)) setSeen((s) => new Set(s).add(seenKey))

  const render = {
    overview: (p) => <VipOverviewTab programme={p} />,
    members: (p) => <VipMembersTab programme={p} />,
    requirements: (p) => <VipRequirementsTab programme={p} />,
    preview: (p) => <VipPreviewTab programme={p} />,
    videos: (p) => <VipVideosTab programme={p} />,
    questions: (p) => <VipQuestionsTab programme={p} isOwner={isOwner} />,
    wallets: (p) => <VipWalletsTab programme={p} />,
    close: (p) => <VipCloseTab programme={p} />,
    sheet: (p) => <VipSheetTab programme={p} />,
    bonuses: (p) => <VipBonusesTab programme={p} isOwner={isOwner} initialPart={bonusPart} />,
    announcements: (p) => <AnnouncementsTab programme={p} programmes={sameKind(p)} isOwner={isOwner} />,
    challenges: (p) => <VipContentTab programme={p} isOwner={isOwner} part="briefs" />,
    guides: (p) => <VipContentTab programme={p} isOwner={isOwner} part="guides" />,
    certificates: () => <VipCertificatesTab />,
    kpis: (p) => <VipKpiTab programme={p} programmes={sameKind(p)} isAdmin={isAdmin} />,
    analytics: (p) => <VipAnalyticsTab programme={p} programmes={sameKind(p)} isAdmin={isAdmin} />,
    settings: (p) => (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <VipSettingsTab programme={p} onSaved={load} />
        <aside className="space-y-5 lg:sticky lg:top-24">
          <VipRulesCard key={`${p.id}:${p.min_payout}:${p.voucher_min}:${p.req_videos}`} programme={p} onSaved={load} />
          <SyncEvery />
        </aside>
      </div>
    ),
    markets: (p) => <VipMarketsTab programme={p} isOwner={isOwner} onChanged={load} />,
    access: () => <VipAccessTab programmes={programmes} />,
  }

  return (
    <div>
      {/* Five groups as cards; the tools of the open group as a row of pills under them. */}
      <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-card sm:grid-cols-6 border border-gray-100 bg-white p-1.5 shadow-card sm:gap-2 sm:p-2">
        {GROUPS.map((g) => {
          const on = g.key === group.key
          const first = g.tabs.find(([k]) => offered(k, programme, isOwner))?.[0]
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => !on && go(first)}
              aria-current={on ? 'true' : undefined}
              className={cx('relative flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-bold transition-colors duration-200 sm:flex-row sm:justify-center sm:gap-2 sm:py-2.5 sm:text-[13px]', on ? 'text-white' : 'text-ink/75 hoverable:hover:bg-cloud hoverable:hover:text-ink')}
            >
              {on && <motion.span layoutId="vip-tools-group" transition={SPRING} className="absolute inset-0 rounded-xl bg-brand shadow-card" />}
              <Icon name={g.icon} className={cx('relative h-[18px] w-[18px]', on ? 'text-white' : 'text-brand')} strokeWidth={on ? 2.2 : 1.9} />
              <span className="relative truncate">{tr(g.label)}</span>
            </button>
          )
        })}
      </div>
      {/* The pills lift 1px on hover, and a row that scrolls sideways clips whatever pokes out of it - so the top of "Members"
          was cut off on hover. The padding above the pills is the room the lift needs. */}
      <div key={group.key} className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1.5 pt-1.5 animate-tab-in sm:mx-0 sm:px-0">
        {group.tabs.filter(([k]) => offered(k, programme, isOwner)).map(([k, label]) => {
          const on = k === tab
          return (
            <button
              key={k}
              type="button"
              onClick={() => !on && go(k)}
              className={cx('shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200', on ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-200 bg-white text-ink hoverable:hover:-translate-y-px hoverable:hover:border-brand hoverable:hover:text-brand')}
            >
              {tr(label)}
            </button>
          )
        })}
      </div>

      {!programme.can_manage && !['markets', 'access', 'sheet', 'requirements', 'wallets', 'preview'].includes(tab) && (
        <p className="mb-4 rounded-card border border-gray-100 bg-white px-4 py-3 text-sm text-ink">{tr('You are looking at {p}. You can see everything here, but only its own lead can change it.', { p: programme.name })}</p>
      )}

      {programmes.filter((p) => p.id === programme.id || [...seen].some((k) => k.startsWith(`${p.id}:`))).map((p) => {
        const here = p.id === programme.id
        return (
          <ProgrammeKindContext.Provider key={p.id} value={p.kind || 'vip'}>
          <div hidden={!here}>
            {ALL.filter((t) => (here && t === tab) || seen.has(`${p.id}:${t}`)).map((t) => (
              <div key={t} hidden={!here || t !== tab} className="vip-panel">{render[t](p)}</div>
            ))}
          </div>
          </ProgrammeKindContext.Provider>
        )
      })}
    </div>
  )
}
