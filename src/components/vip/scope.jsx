import { motion } from 'motion/react'
import { SPRING } from '../../lib/motion'
import { flagFromIso } from '../../lib/flags'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// WHICH VIP MARKET THE NUMBERS ARE FOR (4 Oct 2026).
//
// Ethan, on VIP Analytics and KPIs: "There should be a page first for the overall ... for the VIP market, and then also for the specific
// markets, like toggling through." So the first answer is EVERY VIP MARKET added together, and one press moves to a single market. The
// list is a row of chips - a star for every market together, a globe for the Worldwide VIP market, a flag for a country's - the same
// three symbols the announcement and content dropdowns use, so a symbol always means the same thing.
export const programmeIcon = (p) => (p?.community?.country_codes?.length ? p.community.country_codes.slice(0, 2).map(flagFromIso).join('') : '🌍')

export default function VipScopeSwitch({ programmes, value, onChange, allowAll = true, className }) {
  const tr = useT()
  const options = [
    ...(allowAll && programmes.length > 1 ? [{ value: 'all', icon: '⭐', label: tr('All VIP markets') }] : []),
    ...programmes.map((p) => ({ value: p.id, icon: programmeIcon(p), label: p.name })),
  ]
  if (options.length < 2) return null
  return (
    <div role="radiogroup" aria-label={tr('Which VIP market')} className={cx('scrollbar-none -mx-1 flex max-w-full gap-1 overflow-x-auto px-1 py-1', className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => !on && onChange(o.value)}
            className={cx('relative inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors duration-200', on ? 'z-10 border-transparent text-white' : 'border-gray-200 bg-white text-ink/80 hoverable:hover:border-brand/40 hoverable:hover:text-ink')}
          >
            {on && <motion.span layoutId="vip-scope-pill" transition={SPRING} className="absolute inset-0 rounded-full bg-gradient-to-r from-brand to-brand-light shadow-card" />}
            <span aria-hidden className="relative text-[14px] leading-none">{o.icon}</span>
            <span className="relative whitespace-nowrap">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
