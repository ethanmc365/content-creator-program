import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { Skeleton } from '../../../components/ui'
import { VipAnalyticsTab } from '../../../components/vip/adminB'

// THE VIP, INSIDE THE MAIN ANALYTICS (4 Oct 2026). Ethan: "for the general analytics, I want the same: the ability to see analytics for
// everything and then toggles for VIP Spain ... overall from all the markets, and also for the specific markets." It is the VIP programme's
// own analytics (every VIP market added together first, then one market at a time), reached from here as well as from the VIP tools.
export default function VipAnalytics() {
  const { isAdmin } = useAuth()
  const [programmes, setProgrammes] = useState(null)
  useEffect(() => {
    let alive = true
    supabase.from('vip_programmes').select('*, community:community_id(name, slug, country_codes)').eq('active', true).order('name')
      .then(({ data }) => { if (alive) setProgrammes(data || []) })
    return () => { alive = false }
  }, [])
  if (programmes === null) return <div className="space-y-4"><Skeleton className="h-12 w-full rounded-card" /><Skeleton className="h-72 w-full rounded-card" /></div>
  if (programmes.length === 0) return <p className="rounded-card border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-smoke">No VIP markets are open yet.</p>
  return <VipAnalyticsTab programme={programmes[0]} programmes={programmes} isAdmin={isAdmin} />
}
