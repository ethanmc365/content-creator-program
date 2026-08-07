import { NavLink, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { useCommunity } from '../../context/CommunityContext'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { SOFT_SPRING } from '../../lib/motion'

// Shared frame for every network page: content on the left, a rail of
// communities on the right.
//
// The rail is the answer to "where am I and what else is there". Before it, the
// only way to reach Spain was to go back to the hub and find a card, which made
// the markets feel like a list you browse rather than places you move between.
//
// On mobile the rail becomes a horizontal scroller pinned under the header,
// because a 240px sidebar on a 375px screen is not a sidebar, it is the page.

export function flagFromIso(iso) {
  if (!iso || iso.length !== 2) return ''
  return iso.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65))
}

function RailLink({ to, icon, flags, label, sub, active, badge }) {
  return (
    <NavLink
      to={to}
      className={cx(
        'group flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all duration-200',
        active
          ? 'bg-brand-tint text-brand'
          : 'text-ink hover:bg-cloud',
      )}
    >
      {flags ? (
        // Nordics carries five country codes. Rendered raw they wrap onto five
        // lines and turn a 40px row into a 140px one, so the rail shows the
        // first flag only and never wraps.
        <span className="w-5 shrink-0 overflow-hidden whitespace-nowrap text-center text-base leading-none" aria-hidden>
          {flags}
        </span>
      ) : (
        <Icon name={icon} className={cx('h-4 w-4 shrink-0', active ? 'text-brand' : 'text-smoke')} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {sub && <span className="block truncate text-[11px] text-smoke">{sub}</span>}
      </span>
      {badge}
    </NavLink>
  )
}

export default function NetworkLayout({ children }) {
  const { slug } = useParams()
  const { network, chapters, myCommunities, isGlobalAdmin, manages } = useCommunity()

  const mine = new Set(myCommunities.map((c) => c.id))
  const home = myCommunities.find((c) => c.membership?.is_home)
  // Same order as the hub: your own market first, then alphabetical. Two
  // different orders for the same list is how a rail stops being navigation and
  // starts being a puzzle.
  const open = chapters
    .filter((c) => c.is_active)
    .sort((a, b) => (b.id === home?.id) - (a.id === home?.id) || a.name.localeCompare(b.name))
  const closed = chapters.filter((c) => !c.is_active).sort((a, b) => a.name.localeCompare(b.name))

  const rail = (
    <>
      <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-smoke">Network</p>
      <RailLink
        to="/global"
        icon="globe"
        label={network?.name || 'Worldwide'}
        sub="Everyone, everywhere"
        active={!slug}
      />

      <p className="mt-4 px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-smoke">Markets</p>
      {open.map((c) => (
        <RailLink
          key={c.id}
          to={`/c/${c.slug}`}
          flags={(c.country_codes || []).map(flagFromIso).join('')}
          label={c.name}
          sub={mine.has(c.id) ? 'You are here' : undefined}
          active={slug === c.slug}
        />
      ))}

      {closed.length > 0 && (
        <>
          <p className="mt-4 px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-smoke">Not open yet</p>
          {closed.map((c) => (
            <RailLink
              key={c.id}
              to={`/c/${c.slug}`}
              flags={(c.country_codes || []).map(flagFromIso).join('')}
              label={c.name}
              active={slug === c.slug}
            />
          ))}
        </>
      )}

      {(isGlobalAdmin || (slug && manages(chapters.find((c) => c.slug === slug)?.id))) && (
        <>
          <p className="mt-4 px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-smoke">Team</p>
          {slug && (
            <RailLink to={`/manage/${slug}`} icon="shield" label="Market settings" active={false} />
          )}
          {isGlobalAdmin && (
            <RailLink to="/global/settings" icon="pencil" label="Network settings" active={false} />
          )}
        </>
      )}
    </>
  )

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:py-8">
      {/* Mobile: the rail collapses to a scroller. Kept above the content so
          switching market is one thumb reach from the top of the page. */}
      <div className="mb-5 -mx-4 overflow-x-auto px-4 lg:hidden">
        <div className="flex gap-2 pb-1">
          <NavLink
            to="/global"
            className={cx(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-all duration-200',
              !slug ? 'border-brand bg-brand-tint text-brand' : 'border-gray-200 bg-white text-smoke',
            )}
          >
            <Icon name="globe" className="h-4 w-4" />
            Worldwide
          </NavLink>
          {open.map((c) => (
            <NavLink
              key={c.id}
              to={`/c/${c.slug}`}
              className={cx(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-all duration-200',
                slug === c.slug ? 'border-brand bg-brand-tint text-brand' : 'border-gray-200 bg-white text-smoke',
              )}
            >
              <span aria-hidden>{(c.country_codes || []).map(flagFromIso).join('')}</span>
              {c.name}
            </NavLink>
          ))}
        </div>
      </div>

      <div className="flex flex-col-reverse gap-8 lg:flex-row lg:items-start">
        <main className="min-w-0 flex-1">{children}</main>

        <motion.aside
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={SOFT_SPRING}
          className="hidden w-60 shrink-0 lg:block lg:sticky lg:top-24"
        >
          <nav className="rounded-card border border-gray-100 bg-white p-2 shadow-card">{rail}</nav>
        </motion.aside>
      </div>
    </div>
  )
}
