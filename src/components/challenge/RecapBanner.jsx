import { Link } from 'react-router-dom'
import Icon from '../Icon'
import { useT } from '../../lib/i18n'

// "YOUR RECAP IS READY" (24 Sep 2026, its own component 26 Sep so the Testing
// Centre draws the exact banner a creator sees).
//
// WHERE IT APPEARS: at the top of a challenge's page, under the header, once
// the challenge has closed - for anybody who entered it. The "Results are in"
// notification that goes out when the winners are published links to that same
// page, so the banner is the first thing the tap lands on.
export default function RecapBanner({ to, onClick, className = '' }) {
  const tr = useT()
  const inner = (
    <>
      <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-y-0" />
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20">
        <Icon name="sparkles" className="hook-sparkles h-5 w-5" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-tight">{tr('Your recap is ready')}</span>
        <span className="block text-xs text-white/85">{tr('Where you placed, your top videos and what you made, ready to share.')}</span>
      </span>
      <Icon name="chevronRight" className="relative h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
    </>
  )
  const cls = `animate-fade-up group relative flex w-full items-center gap-4 overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light px-5 py-4 text-left text-white shadow-card transition-transform duration-200 hover:-translate-y-0.5 ${className}`
  return to
    ? <Link to={to} className={cls}>{inner}</Link>
    : <button type="button" onClick={onClick} className={cls}>{inner}</button>
}
