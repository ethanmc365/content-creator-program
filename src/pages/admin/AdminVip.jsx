import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { EmptyState, PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import Segmented from '../../components/network/Segmented'
import FlagStack from '../../components/network/FlagStack'
import { notice } from '../../lib/confirm'
import { VipMembersTab, VipOverviewTab } from '../../components/vip/adminA'
import { VipAccessTab } from '../../components/vip/access'
import { VipContentTab, VipMarketsTab } from '../../components/vip/adminD'
import { AnnouncementsTab } from '../../components/vip/adminC'
import { VipAnalyticsTab, VipBonusesTab, VipCloseTab, VipKpiTab, VipSettingsTab } from '../../components/vip/adminB'
import { useT } from '../../lib/i18n'

// THE VIP TOOLS (2 Oct 2026, migration 294).
//
// Ethan: "We'll need ... just one place where you can click for VIP tools ... analytics, VIP members, bonus
// rules ... We want to keep them kind of separate, but also combine them when we need to. A KPI tracker for
// just that, and analytics ... Specific payment stuff can go there too."
//
// One page, seven views of one programme: Overview (this month, live, against budget), Members (who is in,
// their own rates and targets, sign-up links), Bonuses (the rules and what they would cost), Close (the
// month-end statements, flags, approval, CSV), KPIs (goals for the programme itself), Analytics (how it is
// doing over time) and Settings (the rate, the rules, the terms). A market's own lead sees their market's
// programme and nothing else; the team sees all of them. The database decides which (vip_can_manage); this
// page only draws what it is given.
const TABS = ['overview', 'members', 'markets', 'content', 'bonuses', 'close', 'kpis', 'announcements', 'analytics', 'settings', 'access']

export default function AdminVip() {
  const tr = useT()
  const { isAdmin, profile, enterCreatorPreview } = useAuth()
  const navigate = useNavigate()
  const [entering, setEntering] = useState(false)
  // Who can open these tools is the owner's to decide (migration 296), so that tab is theirs alone.
  const isOwner = profile?.platform_role === 'owner'
  const [params, setParams] = useSearchParams()
  const [programmes, setProgrammes] = useState(null)
  const [pid, setPid] = useState(null)
  // TABS STAY MOUNTED ONCE OPENED (1 Oct 2026). Ethan: "there's a bit of lag when clicking between these with things
  // loading." Every tab used to be thrown away when you left it and fetched from nothing when you came back, so each
  // press was a skeleton and then a jump. Now a tab you have opened is kept (hidden) for this programme, so going back
  // to it is instant, and only the first visit loads.
  const [seen, setSeen] = useState(() => new Set())
  const tab = TABS.includes(params.get('tab')) && (params.get('tab') !== 'access' || isOwner) ? params.get('tab') : 'overview'

  // EVERYBODY WITH ACCESS SEES EVERY MARKET; THEY MANAGE THEIR OWN (migration 299). `can_manage` is what the
  // screens use to hide the controls a person could not use; the database refuses the rest either way.
  const load = useCallback(async () => {
    const { data } = await supabase.from('vip_programmes').select('*, community:community_id(name, slug, country_codes)').order('name')
    // All at once, not one round trip after another (it was the first second of every visit).
    const shown = (data || []).filter((p) => p.active || isOwner)
    const oks = await Promise.all(shown.map((p) => supabase.rpc('vip_can_manage', { p_programme: p.id }).then((r) => !!r.data)))
    const all = shown.map((p, i) => ({ ...p, can_manage: oks[i] }))
    all.sort((a, b) => Number(b.can_manage) - Number(a.can_manage))
    setProgrammes(all)
    setPid((cur) => cur && all.some((p) => p.id === cur) ? cur : all[0]?.id || null)
  }, [isOwner])
  useEffect(() => { load() }, [load])

  if (programmes === null) return <div className="page max-w-6xl"><Skeleton className="mb-5 h-10 w-48" /><Skeleton className="h-72 w-full rounded-card" /></div>
  if (programmes.length === 0) {
    return (
      <div className="page max-w-3xl">
        <PageHeader title={tr('VIP tools')} back={isAdmin ? '/admin' : undefined} />
        <EmptyState icon={<Icon name="star" className="h-7 w-7" />} title={tr('Nothing to manage here')} hint={tr('The VIP tools are for the owner and the managers they have added to a VIP programme.')} />
      </div>
    )
  }
  const programme = programmes.find((p) => p.id === pid) || programmes[0]
  const seenKey = `${programme.id}:${tab}`
  if (!seen.has(seenKey)) setSeen((s) => new Set(s).add(seenKey))
  const visited = (t) => t === tab || seen.has(`${programme.id}:${t}`)

  // THE WAY INTO THE VIP'S OWN SIDE (1 Oct 2026). Ethan: "how do I get to that screen?" A VIP sees their page, rooms,
  // videos, statements and guides; the team never sees those as a VIP. This opens the hidden sandbox VIP in Spain, the
  // same way "view as creator" opens the sandbox creator, and the bar at the top has the way back.
  async function previewAsVip() {
    setEntering(true)
    const { error } = await enterCreatorPreview('vip')
    setEntering(false)
    if (error) { notice(error); return }
    navigate('/vip')
  }

  return (
    <div className="page max-w-6xl">
      <PageHeader
        title={tr('VIP tools')}
        back={isAdmin ? '/admin' : undefined}
        // THE REAL PAGE FIRST (2 Oct 2026). "Open the VIP page" is the real one for each market (staff mode of
        // pages/VipHub); the sandbox VIP is still one press away for checking a creator's own sections.
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/vip" className="btn-primary !py-2 text-sm transition-transform duration-200 hover:-translate-y-0.5"><Icon name="star" className="h-4 w-4" />{tr('Open the VIP page')}</Link>
            {isAdmin && <button type="button" onClick={previewAsVip} disabled={entering} className="btn-secondary !py-2 text-sm"><Icon name="eye" className="h-4 w-4" />{entering ? tr('Opening...') : tr('As a test VIP')}</button>}
          </div>
        )}
      />

      {programmes.length > 1 && (
        <div className="mb-3">
          <Segmented
            shape="tabs"
            value={programme.id}
            onChange={(v) => setPid(v)}
            label={tr('Programme')}
            id="vip-programme"
            // THE FLAG BESIDE EACH MARKET (2 Oct 2026). Ethan: "add the flag beside the market where it shows VIP
            // Spain and VIP Romania".
            options={programmes.map((p) => ({ value: p.id, label: <span className="inline-flex items-center gap-1.5"><FlagStack codes={p.community?.country_codes} className="text-[15px]" />{p.name}</span> }))}
          />
        </div>
      )}

      <div className="mb-6">
        <Segmented
          shape="tabs"
          id="vip-tabs"
          value={tab}
          onChange={(v) => setParams(v === 'overview' ? {} : { tab: v }, { replace: true })}
          label={tr('VIP tools')}
          options={[
            { value: 'overview', label: tr('Overview') },
            { value: 'members', label: tr('Members') },
            { value: 'markets', label: tr('Markets') },
            { value: 'content', label: tr('Content') },
            { value: 'announcements', label: tr('Announcements') },
            { value: 'bonuses', label: tr('Bonuses') },
            { value: 'close', label: tr('Month end') },
            { value: 'kpis', label: tr('KPIs') },
            { value: 'analytics', label: tr('Analytics') },
            { value: 'settings', label: tr('Settings') },
            ...(isOwner ? [{ value: 'access', label: tr('Access') }] : []),
          ]}
        />
      </div>

      {!programme.can_manage && tab !== 'markets' && tab !== 'access' && (
        <p className="mb-4 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{tr('You are looking at {p}. You can see everything here, but only its own lead can change it.', { p: programme.name })}</p>
      )}

      <div key={programme.id}>
        {[
          ['overview', () => <VipOverviewTab programme={programme} />],
          ['members', () => <VipMembersTab programme={programme} />],
          ['markets', () => <VipMarketsTab programme={programme} isOwner={isOwner} onChanged={load} />],
          ['content', () => <VipContentTab programme={programme} isOwner={isOwner} part={params.get('part')} onPart={(v) => setParams({ tab: 'content', part: v }, { replace: true })} />],
          ['announcements', () => <AnnouncementsTab programme={programme} />],
          ['bonuses', () => <VipBonusesTab programme={programme} />],
          ['close', () => <VipCloseTab programme={programme} />],
          ['kpis', () => <VipKpiTab programme={programme} />],
          ['analytics', () => <VipAnalyticsTab programme={programme} isAdmin={isAdmin} />],
          ['settings', () => <VipSettingsTab programme={programme} onSaved={load} />],
          ['access', () => <VipAccessTab programmes={programmes} />],
        ].filter(([t]) => visited(t)).map(([t, render]) => (
          <div key={t} hidden={t !== tab} className={t === tab ? 'animate-tab-in' : undefined}>{render()}</div>
        ))}
      </div>
    </div>
  )
}
