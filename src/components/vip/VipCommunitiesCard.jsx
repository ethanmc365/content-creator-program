import { Link, useLocation } from 'react-router-dom'
import { RailCard } from '../network/NetworkLayout'
import FlagStack from '../network/FlagStack'
import { PICKED_ROW, PRESS_ROW } from '../network/MarketsRailCard'
import Icon from '../Icon'
import { useAuth } from '../../context/AuthContext'
import { useVipAccess, useVipCommunities, vipSlugFromPath } from '../../lib/vip'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// THE VIP COMMUNITIES, IN A BOX OF THEIR OWN UNDER "YOUR MARKETS" (1 Oct 2026). Ethan: "a similar box directly below
// that which will show the VIP communities, so it's not mixed in with the general communities."
//
// THE SAME WHITE AS THE MARKETS, NO STAR (2 Oct 2026). Ethan: "remove the star from it, also don't use the gradient
// for this, just have the same white style card, clicking on a card should show this gradient (same for the
// markets) indicating that it's selected." So a row is the plain market row, and the VIP market you are in is the
// one with the gradient. The lounge is not here any more: it is a room at the foot of the Worldwide rooms.
//
// Who sees what is the database's call: the people on the VIP access list get every programme, a VIP gets their own,
// and everybody else gets an empty answer - so the card draws nothing.
export default function VipCommunitiesCard({ className }) {
  const tr = useT()
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const access = useVipAccess(profile?.id, false)
  const rows = useVipCommunities(profile?.id)
  const here = vipSlugFromPath(pathname)
  if (!rows || rows.length === 0) return null
  return (
    // Desktop only: on a phone the team finds these in the market switch sheet, under their markets, and a VIP has
    // the VIP tab - a card at the foot of a long page was the wrong door for both (2 Oct 2026).
    <RailCard
      className={cx('hidden animate-slide-in-right lg:block', className)}
      icon={<Icon name="sparkles" className="h-3.5 w-3.5 text-brand" />}
      title={tr('VIP communities')}
      action={access
        ? <Link to="/admin/vip" className="text-[11px] font-medium text-brand transition-transform duration-200 hover:scale-105">{tr('VIP tools')}</Link>
        : (profile?.is_vip ? <Link to="/vip" className="text-[11px] font-medium text-brand transition-transform duration-200 hover:scale-105">{tr('My VIP page')}</Link> : null)}
    >
      <div className="space-y-0.5">
        {rows.map((p) => {
          const picked = here && here === p.community?.slug
          return (
            <Link
              key={p.id}
              to={`/c/${p.community?.slug}/chat/vip`}
              aria-current={picked ? 'page' : undefined}
              className={cx(
                'group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-200',
                picked ? cx(PICKED_ROW, 'font-semibold') : cx('font-medium text-ink hoverable:hover:bg-cloud', PRESS_ROW),
              )}
            >
              <FlagStack codes={p.community?.country_codes} className="text-[13px]" />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <Icon name="chevronRight" className={cx('h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5', picked ? 'text-white/80' : 'text-gray-300 group-hover:text-brand')} />
            </Link>
          )
        })}
      </div>
    </RailCard>
  )
}
