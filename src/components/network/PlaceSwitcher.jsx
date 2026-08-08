import { NavLink, Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { useCommunity } from '../../context/CommunityContext'
import Icon from '../Icon'
import { flagFromIso } from '../../lib/flags'
import { cx } from '../../lib/utils'

// Re-exported for the market components that already import it from here.
// The definition lives in lib/flags.js: this module pulls in `motion`, and
// anything eagerly routed that imports a flag helper from here would drag the
// whole motion runtime into the initial bundle.
export { flagFromIso }

// Where am I, and where else do I belong.
//
// WHAT CHANGED AND WHY
//
// The strip this replaces listed every market on the platform. That is a
// directory, not a switcher: a UK creator was shown a Spain pill they could not
// join, could not read and had no reason to think about, and the one place they
// actually live was buried among countries that meant nothing to them. Worse,
// it grew: at ten markets the strip is a scrolling wall of flags.
//
// So the rule is now: this shows the places you ARE, and one door to the places
// you are not. Discovery is a page (/global/markets) because discovery deserves
// room to explain itself, and a pill cannot.
//
// Global admins get a separate, clearly-labelled door rather than the old
// mixed-in dashed pills. Their need is real (they must see markets that are
// closed or empty) but it is an operating need, and dressing it up as ordinary
// navigation is what made the strip confusing for everyone else.

function Pill({ to, end, children, tone = 'default', title }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={title}
      className={({ isActive }) =>
        cx(
          'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium',
          'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card',
          isActive
            ? 'border-brand bg-brand-tint text-brand'
            : tone === 'ghost'
              ? 'border-dashed border-gray-200 bg-white text-smoke hover:border-brand hover:text-brand'
              : 'border-gray-200 bg-white text-smoke hover:text-ink',
        )
      }
    >
      {children}
    </NavLink>
  )
}

export default function PlaceSwitcher() {
  const { network, chapters, myChapters, isGlobalAdmin } = useCommunity()
  const home = myChapters.find((c) => c.membership?.is_home)

  // Your markets, home first. Everything else is behind a door.
  const mine = myChapters
    .slice()
    .sort((a, b) => (b.id === home?.id) - (a.id === home?.id) || a.name.localeCompare(b.name))

  const joinable = chapters.filter((c) => c.is_active && !myChapters.some((m) => m.id === c.id))

  return (
    <motion.nav
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      aria-label="Switch community"
      className="-mx-4 mb-7 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex items-center gap-2 pb-1">
        <Pill to="/global" end>
          <Icon name="globe" className="h-4 w-4" />
          {network?.name || 'Worldwide'}
        </Pill>

        {mine.length > 0 && <span className="h-6 w-px shrink-0 bg-gray-200" aria-hidden />}

        {mine.map((c) => (
          <Pill key={c.id} to={`/c/${c.slug}`} title={c.is_active ? undefined : 'Not open to creators yet'}>
            <span className="whitespace-nowrap" aria-hidden>
              {(c.country_codes || []).map(flagFromIso).join('')}
            </span>
            <span className="whitespace-nowrap">{c.name}</span>
            {c.id === home?.id && (
              <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">Home</span>
            )}
          </Pill>
        ))}

        {/* One door, not a list. Hidden entirely when there is genuinely
            nowhere else to go, so a single-market platform is not asking a
            creator to explore an empty room. */}
        {joinable.length > 0 && (
          <Pill to="/global/markets" tone="ghost">
            <Icon name="magnifier" className="h-4 w-4" />
            <span className="whitespace-nowrap">Explore markets</span>
          </Pill>
        )}

        {isGlobalAdmin && (
          <>
            <span className="h-6 w-px shrink-0 bg-gray-200" aria-hidden />
            <Link
              to="/global/settings"
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-brand/30 bg-white px-3.5 py-2 text-sm font-medium text-brand transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card"
            >
              <Icon name="shield" className="h-4 w-4" />
              <span className="whitespace-nowrap">All markets</span>
              <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                {chapters.length}
              </span>
            </Link>
          </>
        )}
      </div>
    </motion.nav>
  )
}
