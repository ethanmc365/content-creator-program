import { NavLink } from 'react-router-dom'
import { motion } from 'motion/react'
import { useCommunity } from '../../context/CommunityContext'
import Icon from '../Icon'
import { cx } from '../../lib/utils'

// Where am I, and what else is there. One horizontal strip instead of the
// persistent sidebar it replaces.
//
// The sidebar was wrong for two reasons. It ate 240px on every page including
// the ones that need the width most, and it followed you into a market's chat,
// which made a room that is supposed to feel local feel like a panel inside a
// global directory. A switcher belongs at the top of the pages where switching
// makes sense, and nowhere else.

export function flagFromIso(iso) {
  if (!iso || iso.length !== 2) return ''
  return iso.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65))
}

function Pill({ to, end, children, tone = 'default' }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium',
          'transition-all duration-200 hover:-translate-y-0.5',
          isActive
            ? 'border-brand bg-brand-tint text-brand'
            : tone === 'muted'
              ? 'border-dashed border-gray-200 bg-white text-gray-400'
              : 'border-gray-200 bg-white text-smoke hover:text-ink',
        )
      }
    >
      {children}
    </NavLink>
  )
}

export default function MarketSwitcher() {
  const { network, chapters, myCommunities } = useCommunity()
  const home = myCommunities.find((c) => c.membership?.is_home)

  const open = chapters
    .filter((c) => c.is_active)
    .sort((a, b) => (b.id === home?.id) - (a.id === home?.id) || a.name.localeCompare(b.name))
  const closed = chapters.filter((c) => !c.is_active).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <motion.nav
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      aria-label="Switch community"
      className="-mx-4 mb-8 overflow-x-auto px-4"
    >
      <div className="flex items-center gap-2 pb-1">
        <Pill to="/global" end>
          <Icon name="globe" className="h-4 w-4" />
          {network?.name || 'Worldwide'}
        </Pill>

        <span className="h-6 w-px shrink-0 bg-gray-200" aria-hidden />

        {open.map((c) => (
          <Pill key={c.id} to={`/c/${c.slug}`}>
            <span className="whitespace-nowrap" aria-hidden>
              {(c.country_codes || []).map(flagFromIso).join('')}
            </span>
            {c.name}
          </Pill>
        ))}

        {/* Closed markets are dashed and greyed rather than hidden: a global
            admin needs to see what exists but is not open, and a creator never
            reaches this component for a market they cannot read. */}
        {closed.map((c) => (
          <Pill key={c.id} to={`/c/${c.slug}`} tone="muted">
            <span className="whitespace-nowrap" aria-hidden>
              {(c.country_codes || []).map(flagFromIso).join('')}
            </span>
            {c.name}
          </Pill>
        ))}
      </div>
    </motion.nav>
  )
}
