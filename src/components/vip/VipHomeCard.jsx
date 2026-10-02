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
export default function VipHomeCard({ delay = 0 }) {
  const tr = useT()
  const { profile, isAdmin } = useAuth()
  const on = !!profile?.is_vip && !isAdmin
  const { overview } = useVipOverview({ enabled: on })
  if (!on || !overview) return null
  const { stats, month, programme } = overview
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
