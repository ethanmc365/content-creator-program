import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { Skeleton } from '../../../components/ui'
import { VipAnalyticsTab } from '../../../components/vip/analytics'
import { vipApi } from '../../../api/vip'

// THE VIP, INSIDE THE MAIN ANALYTICS. It is the VIP programme's own analytics (every VIP market added together first,
// then one market at a time), reached from here as well as from the VIP tools.
export default function VipAnalytics({ market = '', periodKey, range }) {
  const { isAdmin } = useAuth()
  const [programmes, setProgrammes] = useState(null)
  useEffect(() => {
    let alive = true
    vipApi.programmes().select('*, community:community_id(name, slug, country_codes)').eq('active', true).order('name')
      .then(({ data }) => { if (alive) setProgrammes(data || []) })
    return () => { alive = false }
  }, [])
  if (programmes === null) return <div className="space-y-4"><Skeleton className="h-12 w-full rounded-card" /><Skeleton className="h-72 w-full rounded-card" /></div>
  if (programmes.length === 0) return <p className="rounded-card border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-smoke">No VIP markets are open yet.</p>
  // The page's market chip picks that market's VIP programme; Worldwide is every VIP market together.
  const vipOf = market ? programmes.find((p) => p.community_id === market && (p.kind || 'vip') === 'vip') : null
  if (market && !vipOf) return <p className="rounded-card border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-smoke">This market has no VIP programme yet.</p>
  // VIP programmes only: an official programme is its own space (VIP > Official) and never part of "every VIP market".
  const vips = programmes.filter((p) => (p.kind || 'vip') === 'vip')
  return <VipAnalyticsTab programme={vipOf || vips[0] || programmes[0]} programmes={vips.length ? vips : programmes} isAdmin={isAdmin} outer={{ scope: vipOf ? vipOf.id : 'all', periodKey, range }} />
}
