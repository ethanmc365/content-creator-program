import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import Icon from '../Icon'
import FlagStack from '../network/FlagStack'
import { SPRING } from '../../lib/motion'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// THE VIP PAGE'S OWN NAVIGATION (1 Oct 2026).
//
// Ethan: "rather than having the 'This month' video stats, payouts, rewards, perks, and more, like every map, all at
// the top, I would maybe have it as a thing down the side, like a separate column with custom icons. Make it look more
// UI and nice, with animations, and then the content will show up on the left side."
//
// So on a desktop the sections are a column on the right, each with its own icon tile, and the one you are on is a
// solid tile with a highlight that slides to it. A phone has no room for a column: the same sections are a strip of
// icon chips across the top, which scrolls. Both are drawn from one list, so they can never disagree.

export const VIP_SECTIONS = [
  { key: 'month', icon: 'sparkles', label: 'This month', hint: 'Your pay so far' },
  { key: 'videos', icon: 'video', label: 'My videos', hint: 'Add and track' },
  { key: 'stats', icon: 'chart', label: 'Stats', hint: 'Views over time' },
  { key: 'payouts', icon: 'wallet', label: 'Payouts', hint: 'Balance, cash or voucher' },
  { key: 'board', icon: 'trophy', label: 'Leaderboard', hint: 'This month' },
  { key: 'perks', icon: 'plane', label: 'Perks and trips', hint: 'Unlock as you grow' },
  { key: 'earn', icon: 'trendUp', label: 'Earn more', hint: 'Bonuses running now' },
  { key: 'library', icon: 'book', label: 'Library', hint: 'Hooks and guides' },
  { key: 'map', icon: 'globe', label: 'Map', hint: 'Every VIP creator' },
]

/** The column on the right, desktop only. */
export function VipSideNav({ value, onChange, hidden }) {
  const tr = useT()
  return (
    <nav aria-label={tr('VIP sections')} className="rounded-card border border-gray-100 bg-white p-2 shadow-card">
      <ul className="space-y-0.5">
        {VIP_SECTIONS.filter((s) => !hidden?.has(s.key)).map((s, i) => {
          const on = s.key === value
          return (
            <li key={s.key} className="animate-slide-in-right" style={{ animationDelay: `${i * 35}ms` }}>
              <button
                type="button"
                onClick={() => !on && onChange(s.key)}
                aria-current={on ? 'page' : undefined}
                className={cx('group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-200', !on && 'hoverable:hover:bg-cloud/70')}
              >
                {on && <motion.span layoutId="vip-side-nav" transition={SPRING} className="absolute inset-0 rounded-xl bg-brand-tint/70" />}
                <span className={cx(
                  'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300',
                  on ? 'bg-gradient-to-br from-brand to-brand-light text-white shadow-card' : 'bg-cloud text-smoke group-hover:scale-105 group-hover:text-brand',
                )}>
                  <Icon name={s.icon} className="h-[18px] w-[18px]" strokeWidth={on ? 2.2 : 1.9} />
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className={cx('block truncate text-[13.5px] leading-tight', on ? 'font-bold text-ink' : 'font-semibold text-ink/85')}>{tr(s.label)}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-smoke">{tr(s.hint)}</span>
                </span>
                <Icon name="chevronRight" className={cx('relative h-4 w-4 shrink-0 transition-all duration-200', on ? 'text-brand' : 'text-gray-300 opacity-0 group-hover:translate-x-0.5 group-hover:opacity-100')} />
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** The same sections as a strip of chips, phones and tablets. */
export function VipChipNav({ value, onChange, hidden }) {
  const tr = useT()
  return (
    <nav aria-label={tr('VIP sections')} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
      {VIP_SECTIONS.filter((s) => !hidden?.has(s.key)).map((s) => {
        const on = s.key === value
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => !on && onChange(s.key)}
            aria-current={on ? 'page' : undefined}
            ref={(el) => { if (el && on) el.scrollIntoView?.({ block: 'nearest', inline: 'center' }) }}
            className={cx(
              'relative flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-[13px] font-semibold transition-colors duration-200',
              on ? 'border-transparent text-white' : 'border-gray-100 bg-white text-ink/80 shadow-card',
            )}
          >
            {on && <motion.span layoutId="vip-chip-nav" transition={SPRING} className="absolute inset-0 rounded-2xl bg-gradient-to-r from-brand to-brand-light shadow-card" />}
            <Icon name={s.icon} className={cx('relative h-4 w-4', on ? 'text-white' : 'text-brand')} strokeWidth={2} />
            <span className="relative whitespace-nowrap">{tr(s.label)}</span>
          </button>
        )
      })}
    </nav>
  )
}

/** The quick links: their rooms, their recap and their portfolio. A callout in the column, a card on a phone. */
export function VipQuickLinks({ slug, className, staff = false }) {
  const tr = useT()
  const rows = [
    slug && { to: `/c/${slug}/chat/vip`, icon: 'star', label: tr('VIP room'), hint: tr('Your market') },
    slug && { to: `/c/${slug}/chat/vip_announcements`, icon: 'megaphone', label: tr('VIP announcements'), hint: tr('From the team') },
    { to: '/global/chat/vip_global', icon: 'globe', label: tr('VIP lounge'), hint: tr('Every market') },
    !staff && { to: '/vip/recap', icon: 'sparkles', label: tr('My recap'), hint: tr('Your month as a story') },
    !staff && { to: '/portfolio', icon: 'briefcase', label: tr('My portfolio'), hint: tr('Share your numbers') },
    staff && { to: '/vip?mode=tools', icon: 'shield', label: tr('VIP tools'), hint: tr('Members, payouts, settings') },
  ].filter(Boolean)
  return (
    <section className={cx('rounded-card border border-gray-100 bg-white p-3 shadow-card', className)}>
      <h2 className="mb-1.5 px-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400">{tr('Quick links')}</h2>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.to}>
            <Link to={r.to} className="group flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hoverable:hover:bg-cloud/70">
              <Icon name={r.icon} className="h-4 w-4 shrink-0 text-brand transition-transform duration-200 group-hover:scale-110" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{r.label}</span>
              <Icon name="chevronRight" className="h-3.5 w-3.5 shrink-0 text-gray-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * THE MARKET SWITCH ON THE TEAM'S VIP PAGE (2 Oct 2026). The team sees the real VIP page of each market they
 * look after, so the pill becomes a pair (or more): the flag beside each name, the picked one solid brand with
 * white on it (the house rule for a picked option), sliding between them.
 */
export function ProgrammeSwitch({ programmes, value, onChange }) {
  const tr = useT()
  return (
    <div role="tablist" aria-label={tr('VIP market')} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1 shadow-card">
      {programmes.map((p) => {
        const on = p.id === value
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => !on && onChange(p.id)}
            className={cx('relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors duration-200', on ? 'text-white' : 'text-ink/80 hoverable:hover:text-ink')}
          >
            {on && <motion.span layoutId="vip-programme-switch" transition={SPRING} className="absolute inset-0 rounded-full bg-gradient-to-r from-brand to-brand-light shadow-card" />}
            <FlagStack codes={p.country_codes} className="relative text-[14px]" />
            <span className="relative whitespace-nowrap">{p.name}</span>
          </button>
        )
      })}
    </div>
  )
}

/** The programme pill at the top right: the market's flag and name, white, never orange. */
export function ProgrammePill({ name, codes }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-card">
      <FlagStack codes={codes} className="text-[15px]" />
      {name}
    </span>
  )
}
