import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../Icon'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { notice } from '../../lib/confirm'
import { cx } from '../../lib/utils'
import { vipRpc } from '../../lib/vip'
import { useT } from '../../lib/i18n'

// Its own file so Settings does not load the VIP page (and its map) to draw one switch.
/** Settings > Account, for a VIP: whether other VIPs see them on the VIP map. Draws nothing for anybody else. */
export default function VipMapSetting() {
  const tr = useT()
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
  const on = me.show_on_map !== false
  const hasTown = profile?.city_lat != null && profile?.city_lng != null
  const profileHidden = profile?.show_on_map === false

  async function toggle() {
    setBusy(true)
    try { await vipRpc('vip_set_on_map', { p_on: !on }); setMe({ show_on_map: !on }) }
    catch (e) { notice(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-light text-white shadow-card"><Icon name="star" className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{tr('Show me on the VIP map')}</span>
        <span className="block text-xs text-smoke">
          {!hasTown ? <>{tr('Add your town to your profile to appear.')} <Link to="/profile/edit" className="font-semibold text-brand hover:underline">{tr('Add it')}</Link></>
            : profileHidden ? tr('Your profile is hidden from maps, so this map hides you too.')
              : on ? tr('Other VIPs can see where you are based.') : tr('You are hidden from this map.')}
        </span>
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label={tr('Show me on the VIP map')} disabled={busy} onClick={toggle}
        className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-60', on ? 'bg-brand' : 'bg-gray-200')}>
        <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200', on ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </div>
  )
}

