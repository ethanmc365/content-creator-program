import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../Icon'
import { Toggle } from '../ui'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { notice } from '../../lib/confirm'
import { vipRpc, useKindT } from '../../lib/vip'

// Its own file so Settings does not load the VIP page (and its map) to draw one switch.
/** Settings > Account, for a VIP: whether other VIPs see them on the VIP map. Draws nothing for anybody else. */
export default function VipMapSetting({ publicOn = true }) {
  const tr = useKindT()
  const { user, profile } = useAuth()
  const [me, setMe] = useState(undefined)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!user?.id || !profile?.is_vip) return undefined
    let alive = true
    supabase.from('vip_members').select('show_on_map').eq('profile_id', user.id).maybeSingle()
      .then(({ data: row }) => { if (alive) setMe(row || null) })
    return () => { alive = false }
  }, [user?.id, profile?.is_vip])
  if (!profile?.is_vip || !me) return null
  // ONE SWITCH, TWO FLAGS (4 Oct 2026). The public-pages switch above governs this map too (the map hides anyone whose profile
  // is off the maps), so when that one is off THIS one has to read off as well - it stayed on, which said the opposite of what
  // the map did. It keeps its own saved choice underneath, and comes back to it when the public switch goes back on.
  const saved = me.show_on_map !== false
  const on = saved && publicOn
  const hasTown = profile?.city_lat != null && profile?.city_lng != null
  const profileHidden = profile?.show_on_map === false

  async function toggle() {
    setBusy(true)
    try { await vipRpc('vip_set_on_map', { p_on: !saved }); setMe({ show_on_map: !saved }) }
    catch (e) { notice(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-light text-white shadow-card"><Icon name="star" className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{tr('Show me on the VIP map')}</span>
        <span className="block text-xs text-smoke">
          {!hasTown ? <>{tr('Add your town to your profile to appear.')} <Link to="/profile/edit" className="font-semibold text-brand hover:underline">{tr('Add it')}</Link></>
            : (profileHidden || !publicOn) ? tr('You are hidden from the public pages, so this map hides you too. Turn that on to choose.')
              : on ? tr('Other VIPs can see where you are based.') : tr('You are hidden from this map.')}
        </span>
      </span>
      <Toggle on={on} onChange={toggle} label={tr('Show me on the VIP map')} disabled={busy || !publicOn || profileHidden} />
    </div>
  )
}

