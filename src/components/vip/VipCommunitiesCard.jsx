import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { RailCard } from '../network/NetworkLayout'
import FlagStack from '../network/FlagStack'
import Icon from '../Icon'
import { useAuth } from '../../context/AuthContext'
import { useVipAccess } from '../../lib/vip'
import { useT } from '../../lib/i18n'

// THE VIP COMMUNITIES, IN A BOX OF THEIR OWN UNDER "YOUR MARKETS" (1 Oct 2026). Ethan: "a similar box directly below
// that which will show the VIP communities, so it's not mixed in with the general communities."
//
// Who sees what is the database's call: the people on the VIP access list get every programme, a VIP gets their own,
// and everybody else gets an empty answer - so the card draws nothing and asks nothing more of them. Each row is
// a tinted gradient card rather than the white of the market rows, so the two lists never read as one.
export default function VipCommunitiesCard() {
  const tr = useT()
  const { profile } = useAuth()
  const access = useVipAccess(profile?.id, false)
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!profile?.id) return undefined
    let alive = true
    supabase.from('vip_programmes').select('id, name, community:community_id(slug, country_codes)').eq('active', true).order('name')
      .then(({ data }) => { if (alive) setRows(data || []) })
    return () => { alive = false }
  }, [profile?.id])
  if (!rows || rows.length === 0) return null
  return (
    <RailCard icon={<Icon name="star" className="h-3.5 w-3.5 text-brand" />} title={tr('VIP communities')}
      action={access ? <Link to="/admin/vip" className="text-[11px] font-medium text-brand transition-transform duration-200 hover:scale-105">{tr('VIP tools')}</Link> : (profile?.is_vip ? <Link to="/vip" className="text-[11px] font-medium text-brand transition-transform duration-200 hover:scale-105">{tr('My VIP page')}</Link> : null)}>
      <div className="space-y-1.5">
        {rows.map((p) => (
          <Link key={p.id} to={`/c/${p.community?.slug}/chat/vip`}
            className="group relative flex items-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-r from-brand to-[#f0711f] px-3 py-2.5 text-sm font-semibold text-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift">
            <span aria-hidden className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-white/15 blur-xl" />
            <FlagStack codes={p.community?.country_codes} className="relative text-[13px]" />
            <span className="relative min-w-0 flex-1 truncate">{p.name}</span>
            <Icon name="star" className="relative h-3.5 w-3.5 text-white/80" />
            <Icon name="chevronRight" className="relative h-4 w-4 text-white/80 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
        {access && (
          <Link to="/global/chat/vip_global" className="flex items-center gap-2.5 rounded-xl border border-brand/30 bg-brand-tint/50 px-3 py-2 text-xs font-semibold text-brand transition-colors hover:bg-brand-tint">
            <Icon name="chat" className="h-3.5 w-3.5" />{tr('The VIP lounge, every market together')}
          </Link>
        )}
      </div>
    </RailCard>
  )
}
