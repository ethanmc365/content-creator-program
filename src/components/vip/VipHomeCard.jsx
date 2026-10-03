import { Link } from 'react-router-dom'
import Reveal from '../network/Reveal'
import Icon from '../Icon'
import { CountUp } from '../network/Motion'
import { daysLeft, money, monthLabel, useVipOverview } from '../../lib/vip'
import { useAuth } from '../../context/AuthContext'
import { useT } from '../../lib/i18n'

// A VIP's own month on their Worldwide page (2 Oct 2026): what it has earned so far and a way in, under the
// community card.
// Nothing is drawn for anybody who is not a VIP, and nothing is fetched either.
export default function VipHomeCard({ delay = 0, inCard = false }) {
  const tr = useT()
  const { profile, isAdmin } = useAuth()
  const on = !!profile?.is_vip && !isAdmin
  const { overview } = useVipOverview({ enabled: on })
  if (!on || !overview) return null
  const { stats, month, programme } = overview
  // INSIDE THE COMMUNITY CARD (3 Oct 2026). Ethan: "we have the Tryp.com Content Creator Community card, and then
  // below that we have a VIP card. I want them merged together ... so that everything is together and takes up less
  // space." So on the Worldwide page it is the foot of that card: a translucent band on the same orange, wiping in
  // after the card's own pieces, the way the global challenge strip does.
  if (inCard) {
    return (
      <Link to="/vip" className="wipe-item group relative mt-6 flex items-center gap-3.5 overflow-hidden rounded-2xl bg-white/15 p-3.5 ring-1 ring-white/25 backdrop-blur-sm transition-colors duration-300 hoverable:hover:bg-white/20 sm:mt-7 sm:gap-4 sm:p-4 lg:max-w-[calc(100%-21.5rem)] xl:max-w-[calc(100%-23.5rem)]" style={{ animationDelay: '0.7s' }}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-brand shadow-card"><Icon name="star" className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/85">{tr('VIP · {m}', { m: monthLabel(month.year, month.month) })}</span>
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xl font-bold tabular-nums leading-tight text-white"><CountUp value={stats.base} format={(n) => money(n, programme.currency)} /></span>
            <span className="text-xs text-white/90">{tr('earned so far, {d} days left', { d: daysLeft(month.ends_at) })}</span>
          </span>
        </span>
        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand transition-transform duration-200 group-hover:scale-105 sm:inline-flex">{tr('VIP page')}<Icon name="chevronRight" className="h-3.5 w-3.5" /></span>
        <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-white sm:hidden" />
      </Link>
    )
  }
  return (
    <Reveal delay={delay}>
    <Link to="/vip" className="brand-drift group relative flex items-center gap-4 overflow-hidden rounded-card p-5 text-white shadow-card transition-all duration-300 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift">
      <span aria-hidden className="survey-orb pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20"><Icon name="star" className="h-6 w-6" /></span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">{tr('{m} so far', { m: monthLabel(month.year, month.month) })}</span>
        <span className="block text-3xl font-bold tabular-nums leading-tight"><CountUp value={stats.base} format={(n) => money(n, programme.currency)} /></span>
        <span className="block text-xs text-white/90">{tr('{d} days left. Open your VIP page.', { d: daysLeft(month.ends_at) })}</span>
      </span>
      <Icon name="chevronRight" className="relative h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
    </Reveal>
  )
}
