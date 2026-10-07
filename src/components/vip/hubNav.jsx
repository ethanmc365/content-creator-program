import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import Icon from '../Icon'
import FlagStack from '../network/FlagStack'
import { SPRING } from '../../lib/motion'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'
import { CountUp } from '../network/Motion'
import { money, useOptionalRpc } from '../../lib/vip'

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
  { key: 'ideas', icon: 'bulb', label: 'Video ideas', hint: 'Hooks from 50k+ videos' },
  { key: 'library', icon: 'book', label: 'Library', hint: 'Hooks and guides' },
  { key: 'map', icon: 'globe', label: 'Map', hint: 'Every VIP creator' },
  { key: 'recap', icon: 'sparkles', label: 'My recap', hint: 'Your month as a story' },
]

/** The column on the right, desktop only. */
export function VipSideNav({ value, onChange, hidden, links }) {
  const tr = useT()
  return (
    <nav aria-label={tr('VIP sections')} className="rounded-card border border-gray-100 bg-white p-2 shadow-card animate-rise">
      <ul className="space-y-0.5">
        {VIP_SECTIONS.filter((s) => !hidden?.has(s.key)).map((s) => {
          const on = s.key === value
          return (
            <li key={s.key}>
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
      {links?.length > 0 && (
        <ul className="mt-1 space-y-0.5 border-t border-gray-100 pt-1">
          {links.map((l) => (
            <li key={l.to}>
              <Link to={l.to} className="group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-200 hoverable:hover:bg-cloud/70">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cloud text-smoke transition-all duration-300 group-hover:scale-105 group-hover:text-brand"><Icon name={l.icon} className="h-[18px] w-[18px]" strokeWidth={1.9} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold leading-tight text-ink/85">{tr(l.label)}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-smoke">{tr(l.hint)}</span>
                </span>
                <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brand group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}

/** The same sections as a strip of chips, phones and tablets. */
export function VipChipNav({ value, onChange, hidden, links }) {
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
              on ? 'z-10 border-transparent text-white' : 'border-gray-100 bg-white text-ink/80 shadow-card',
            )}
          >
            {on && <motion.span layoutId="vip-chip-nav" transition={SPRING} className="absolute inset-0 rounded-2xl bg-gradient-to-r from-brand to-brand-light shadow-card" />}
            <Icon name={s.icon} className={cx('relative h-4 w-4', on ? 'text-white' : 'text-brand')} strokeWidth={2} />
            <span className="relative whitespace-nowrap">{tr(s.label)}</span>
          </button>
        )
      })}
      {(links || []).map((l) => (
        <Link key={l.to} to={l.to} className="relative flex shrink-0 items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 py-2 text-[13px] font-semibold text-ink/80 shadow-card">
          <Icon name={l.icon} className="h-4 w-4 text-brand" strokeWidth={2} />
          <span className="whitespace-nowrap">{tr(l.label)}</span>
        </Link>
      ))}
    </nav>
  )
}

/** A VIP's own pages that live elsewhere, listed with the sections (3 Oct 2026: they were the quick links card). */
export const VIP_LINKS = [
  { to: '/portfolio', icon: 'briefcase', label: 'My portfolio', hint: 'Share your numbers' },
]

/** The VIP's balance, small, under the sections: just the number, kept up to date by itself (4 Oct 2026). Ethan: "don't say
 *  ... EUR 10 to a feature or +EUR 100 this month so far. Just have Your Balance and actually show the current balance." */
export function VipBalanceMini({ onOpen }) {
  const tr = useT()
  const { data: w, reload } = useOptionalRpc('vip_my_wallet')
  useEffect(() => {
    const id = setInterval(reload, 60000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // The same box before the number arrives, so the column never grows a card late.
  if (!w) return <div className="h-[5.25rem] w-full animate-pulse rounded-card border border-gray-100 bg-white shadow-card" />
  return (
    <button type="button" onClick={onOpen} className="group block w-full rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-200 animate-rise hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift">
      <span className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.12em] text-gray-400">
        <span className="flex items-center gap-1.5"><Icon name="wallet" className="h-3.5 w-3.5 text-brand" />{tr('Your balance')}</span>
        <Icon name="chevronRight" className="h-3.5 w-3.5 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
      </span>
      <span className="mt-1 block text-2xl font-bold tabular-nums text-ink"><CountUp value={Number(w.balance) || 0} format={(n) => money(n, w.currency)} /></span>
    </button>
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
      {/* null = not loaded yet: hold the space, draw nothing, so the globe never flashes before the real flag. */}
      {codes === null ? <span className="inline-block h-[15px] w-[19px] shrink-0" aria-hidden /> : <FlagStack codes={codes} className="text-[15px]" />}
      {name}
    </span>
  )
}
