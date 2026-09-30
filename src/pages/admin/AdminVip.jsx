import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { EmptyState, PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import Segmented from '../../components/network/Segmented'
import { VipMembersTab, VipOverviewTab } from '../../components/vip/adminA'
import { VipAccessTab } from '../../components/vip/access'
import { VipAnalyticsTab, VipBonusesTab, VipCloseTab, VipKpiTab, VipSettingsTab } from '../../components/vip/adminB'
import { cx } from '../../lib/utils'
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
const TABS = ['overview', 'members', 'bonuses', 'close', 'kpis', 'analytics', 'settings', 'access']

export default function AdminVip() {
  const tr = useT()
  const { isAdmin, profile } = useAuth()
  // Who can open these tools is the owner's to decide (migration 296), so that tab is theirs alone.
  const isOwner = profile?.platform_role === 'owner'
  const [params, setParams] = useSearchParams()
  const [programmes, setProgrammes] = useState(null)
  const [pid, setPid] = useState(null)
  const tab = TABS.includes(params.get('tab')) && (params.get('tab') !== 'access' || isOwner) ? params.get('tab') : 'overview'

  const load = useCallback(async () => {
    const { data } = await supabase.from('vip_programmes').select('*, community:community_id(name, slug)').order('name')
    const mine = []
    for (const p of data || []) {
      const { data: ok } = await supabase.rpc('vip_can_manage', { p_programme: p.id })
      if (ok) mine.push(p)
    }
    setProgrammes(mine)
    setPid((cur) => cur && mine.some((p) => p.id === cur) ? cur : mine[0]?.id || null)
  }, [])
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

  return (
    <div className="page max-w-6xl">
      <PageHeader title={tr('VIP tools')} back={isAdmin ? '/admin' : undefined} />

      {programmes.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label={tr('Programme')}>
          {programmes.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={p.id === programme.id} onClick={() => setPid(p.id)}
              className={cx('inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200', p.id === programme.id ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:text-ink')}>
              <Icon name="star" className="h-3.5 w-3.5" />{p.name}
            </button>
          ))}
        </div>
      )}

      <div className="mb-6 overflow-x-auto">
        <Segmented
          value={tab}
          onChange={(v) => setParams(v === 'overview' ? {} : { tab: v }, { replace: true })}
          label={tr('VIP tools')}
          options={[
            { value: 'overview', label: tr('Overview') },
            { value: 'members', label: tr('Members') },
            { value: 'bonuses', label: tr('Bonuses') },
            { value: 'close', label: tr('Month end') },
            { value: 'kpis', label: tr('KPIs') },
            { value: 'analytics', label: tr('Analytics') },
            { value: 'settings', label: tr('Settings') },
            ...(isOwner ? [{ value: 'access', label: tr('Access') }] : []),
          ]}
        />
      </div>

      <div key={`${programme.id}:${tab}`} className="animate-fade-up">
        {tab === 'overview' && <VipOverviewTab programme={programme} />}
        {tab === 'members' && <VipMembersTab programme={programme} />}
        {tab === 'bonuses' && <VipBonusesTab programme={programme} />}
        {tab === 'close' && <VipCloseTab programme={programme} />}
        {tab === 'kpis' && <VipKpiTab programme={programme} />}
        {tab === 'analytics' && <VipAnalyticsTab programme={programme} isAdmin={isAdmin} />}
        {tab === 'settings' && <VipSettingsTab programme={programme} onSaved={load} />}
        {tab === 'access' && <VipAccessTab programmes={programmes} />}
      </div>
    </div>
  )
}
