import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
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
import { SyncEvery, VipAnalyticsTab, VipBonusesTab, VipCloseTab, VipSettingsTab } from './adminB'
import { VipKpiTab } from './kpis'
import { VipPreviewTab } from './preview'
import { VipRequirementsTab, VipRulesCard, VipSheetTab, VipWalletsTab } from './teamTools'
import { useT } from '../../lib/i18n'

// THE VIP TOOLS, INSIDE THE VIP PAGE (2 Oct 2026).
//
// Ethan: "we could build all those admin tools into that VIP page for admins rather than having a separate page ...
// ensure it's also accessible on mobile for admins via a button at the top beside 'Admin'." So /admin/vip is gone as
// a page of its own (it redirects here) and the tools are the third view of the team's VIP page: As a creator, Team
// overview, VIP tools. The market is the page's own switch at the top, so the tools always show the market the rest of
// the page is showing.
//
// The tools are grouped the way a month runs - People, Money, Content, Numbers, Setup - so fourteen tabs read as five
// short rows instead of one strip you scroll sideways on a phone. Once a tool is opened it stays mounted (hidden) for
// that market, so going back to it is instant.
const GROUPS = [
  { key: 'people', label: 'People', icon: 'users', tabs: [['overview', 'Overview'], ['members', 'Members'], ['requirements', 'Stay-in check'], ['preview', 'See as a VIP']] },
  { key: 'money', label: 'Money', icon: 'wallet', tabs: [['wallets', 'Balances'], ['close', 'Month end'], ['sheet', 'CPM sheet'], ['bonuses', 'Bonuses']] },
  { key: 'content', label: 'Content', icon: 'megaphone', tabs: [['announcements', 'Announcements'], ['challenges', 'Monthly challenges'], ['perks', 'Milestones, perks, trips'], ['guides', 'Guides']] },
  { key: 'numbers', label: 'Numbers', icon: 'chart', tabs: [['analytics', 'Analytics'], ['kpis', 'KPIs']] },
  { key: 'setup', label: 'Setup', icon: 'key', tabs: [['settings', 'Settings'], ['markets', 'Markets'], ['access', 'Access']] },
]
const ALL = GROUPS.flatMap((g) => g.tabs.map(([k]) => k))

export default function VipTools({ programmeId }) {
  const tr = useT()
  const { isAdmin, profile } = useAuth()
  const isOwner = profile?.platform_role === 'owner'
  const [params, setParams] = useSearchParams()
  const [programmes, setProgrammes] = useState(null)
  const [seen, setSeen] = useState(() => new Set())
  // THE TAB IS LOCAL STATE FIRST, THE URL SECOND (3 Oct 2026). Ethan: "a bit of delay and lag when clicking between
  // members, overview, etc." The press used to wait for a router update (inside a transition, which React is free to
  // put off) before anything moved. Now the pill and the panel change on the press, and the URL follows.
  const fromUrl = params.get('tab')
  const [picked, setPicked] = useState(fromUrl)
  const [urlSeen, setUrlSeen] = useState(fromUrl)
  if (urlSeen !== fromUrl) { setUrlSeen(fromUrl); setPicked(fromUrl) }
  // The three old content links (?tab=content&part=perks) land on the tab that now holds each one.
  const asked = picked === 'content' ? ({ briefs: 'challenges', perks: 'perks', guides: 'guides' }[params.get('part')] || 'challenges') : picked
  const tab = ALL.includes(asked) && (asked !== 'access' || isOwner) ? asked : 'overview'
  const group = GROUPS.find((g) => g.tabs.some(([k]) => k === tab)) || GROUPS[0]

  const load = useCallback(async () => {
    const { data } = await supabase.from('vip_programmes').select('*, community:community_id(name, slug, country_codes)').order('name')
    const shown = (data || []).filter((p) => p.active || isOwner)
    const oks = await Promise.all(shown.map((p) => supabase.rpc('vip_can_manage', { p_programme: p.id }).then((r) => !!r.data)))
    setProgrammes(shown.map((p, i) => ({ ...p, can_manage: oks[i] })))
  }, [isOwner])
  useEffect(() => { load() }, [load])

  const go = (t) => {
    setPicked(t)
    setParams((p) => { const n = new URLSearchParams(p); n.set('mode', 'tools'); if (t === 'overview') n.delete('tab'); else n.set('tab', t); n.delete('part'); return n }, { replace: true })
  }

  if (programmes === null) return <Skeleton className="h-72 w-full rounded-card" />
  if (programmes.length === 0) {
    return <EmptyState icon={<Icon name="star" className="h-7 w-7" />} title={tr('Nothing to manage here')} hint={tr('The VIP tools are for the owner and the managers they have added to a VIP programme.')} />
  }
  const programme = programmes.find((p) => p.id === programmeId) || programmes[0]
  const seenKey = `${programme.id}:${tab}`
  if (!seen.has(seenKey)) setSeen((s) => new Set(s).add(seenKey))

  const render = {
    overview: (p) => <VipOverviewTab programme={p} />,
    members: (p) => <VipMembersTab programme={p} />,
    requirements: (p) => <VipRequirementsTab programme={p} />,
    preview: (p) => <VipPreviewTab programme={p} />,
    wallets: (p) => <VipWalletsTab programme={p} />,
    close: (p) => <VipCloseTab programme={p} />,
    sheet: (p) => <VipSheetTab programme={p} />,
    bonuses: (p) => <VipBonusesTab programme={p} />,
    announcements: (p) => <AnnouncementsTab programme={p} programmes={programmes} isOwner={isOwner} />,
    challenges: (p) => <VipContentTab programme={p} isOwner={isOwner} part="briefs" />,
    perks: (p) => <VipContentTab programme={p} isOwner={isOwner} part="perks" />,
    guides: (p) => <VipContentTab programme={p} isOwner={isOwner} part="guides" />,
    kpis: (p) => <VipKpiTab programme={p} />,
    analytics: (p) => <VipAnalyticsTab programme={p} isAdmin={isAdmin} />,
    settings: (p) => (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
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
      <div className="mb-3 grid grid-cols-5 gap-1.5 rounded-card border border-gray-100 bg-white p-1.5 shadow-card sm:gap-2 sm:p-2">
        {GROUPS.map((g) => {
          const on = g.key === group.key
          const first = g.tabs.find(([k]) => k !== 'access' || isOwner)?.[0]
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => !on && go(first)}
              aria-current={on ? 'true' : undefined}
              className={cx('relative flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-bold transition-colors duration-200 sm:flex-row sm:justify-center sm:gap-2 sm:py-2.5 sm:text-[13px]', on ? 'text-white' : 'text-ink/75 hoverable:hover:bg-cloud hoverable:hover:text-ink')}
            >
              {on && <motion.span layoutId="vip-tools-group" transition={SPRING} className="absolute inset-0 rounded-xl bg-gradient-to-br from-brand to-brand-light shadow-card" />}
              <Icon name={g.icon} className={cx('relative h-[18px] w-[18px]', on ? 'text-white' : 'text-brand')} strokeWidth={on ? 2.2 : 1.9} />
              <span className="relative truncate">{tr(g.label)}</span>
            </button>
          )
        })}
      </div>
      <div key={group.key} className="scrollbar-none -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 animate-tab-in sm:mx-0 sm:px-0">
        {group.tabs.filter(([k]) => k !== 'access' || isOwner).map(([k, label]) => {
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
        <p className="mb-4 rounded-card border border-brand/15 bg-brand-tint/40 px-4 py-3 text-sm text-ink">{tr('You are looking at {p}. You can see everything here, but only its own lead can change it.', { p: programme.name })}</p>
      )}

      {programmes.filter((p) => p.id === programme.id || [...seen].some((k) => k.startsWith(`${p.id}:`))).map((p) => {
        const here = p.id === programme.id
        return (
          <div key={p.id} hidden={!here}>
            {ALL.filter((t) => (here && t === tab) || seen.has(`${p.id}:${t}`)).map((t) => (
              <div key={t} hidden={!here || t !== tab} className="vip-panel">{render[t](p)}</div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
