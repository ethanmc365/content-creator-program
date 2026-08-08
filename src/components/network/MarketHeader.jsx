import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useCommunity } from '../../context/CommunityContext'
import { confirm, notice } from '../../lib/confirm'
import { clearScopeCache } from '../../lib/scope'
import Icon from '../Icon'
import { flagFromIso } from './PlaceSwitcher'
import { cx } from '../../lib/utils'

// The identity strip every page inside a market wears.
//
// A market has four surfaces (overview, challenges, rooms, members) and before
// this they were four pages that happened to be about the same place, reached
// by going back to the overview each time. The tabs are what make it one place.
//
// Membership lives here rather than on the overview because "am I in this?" is
// the question every one of those surfaces raises, and answering it in only one
// of them is how you end up reading a market's challenge board for weeks
// without realising you never joined.

const TABS = [
  { to: '', end: true, label: 'Overview', icon: 'home' },
  { to: '/challenges', label: 'Challenges', icon: 'flag' },
  { to: '/chat', label: 'Rooms', icon: 'chat' },
  { to: '/members', label: 'Creators', icon: 'users' },
]

export default function MarketHeader({ market, memberCount, canManage, tab }) {
  const { network, myChapters, reload } = useCommunity()
  const [busy, setBusy] = useState(false)
  const flags = (market.country_codes || []).map(flagFromIso).join(' ')
  const membership = myChapters.find((c) => c.id === market.id)?.membership
  const isMember = !!membership
  const isHome = !!membership?.is_home

  async function join() {
    setBusy(true)
    const { error } = await supabase.rpc('join_market', { p_slug: market.slug })
    setBusy(false)
    if (error) { notice(error.message); return }
    clearScopeCache()
    await reload()
    notice(`You are in ${market.name}. Its challenges and rooms are yours now.`)
  }

  async function leave() {
    const ok = await confirm(
      `Leave ${market.name}? You keep every point you earned here and every connection you made. You just stop seeing its challenges and rooms.`,
    )
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.rpc('leave_market', { p_slug: market.slug })
    setBusy(false)
    if (error) { notice(error.message); return }
    clearScopeCache()
    await reload()
  }

  async function makeHome() {
    setBusy(true)
    const { error } = await supabase.rpc('set_home_market', { p_slug: market.slug })
    setBusy(false)
    if (error) { notice(error.message); return }
    clearScopeCache()
    await reload()
    notice(`${market.name} is your home market.`)
  }

  return (
    <div>
      <Link to="/global" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-smoke transition-colors hover:text-brand">
        <Icon name="chevronLeft" className="h-4 w-4" />
        {network?.name || 'Worldwide'}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-3xl font-bold tracking-tight sm:text-4xl">
            {flags && <span aria-hidden>{flags}</span>}
            <span>{market.name}</span>
            {isHome && (
              <span className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                Home
              </span>
            )}
            {!market.is_active && (
              <span className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-smoke">
                Not open
              </span>
            )}
          </h1>
          <p className="mt-2 max-w-2xl text-smoke">
            {market.tagline
              || (market.is_active
                ? `Challenges, briefs and rooms for ${market.name}. Your connections and messages stay worldwide.`
                : 'This market is not open yet. It stays invisible to creators until the team turns it on.')}
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-smoke">
            <span className="flex items-center gap-1.5">
              <Icon name="users" className="h-4 w-4" />
              {memberCount == null ? '—' : memberCount} {memberCount === 1 ? 'creator' : 'creators'}
            </span>
            {market.currency && (
              <span className="flex items-center gap-1.5">
                <Icon name="money" className="h-4 w-4" />
                {market.currency}
              </span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!isMember && (
            <button onClick={join} disabled={busy} className="btn-primary !py-2.5">
              {busy ? 'Joining…' : `Join ${market.name}`}
            </button>
          )}
          {isMember && !isHome && (
            <button onClick={makeHome} disabled={busy}
              className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium transition-transform duration-200 hover:scale-105 hover:border-brand hover:text-brand">
              Make this my home
            </button>
          )}
          {isMember && (
            <button onClick={leave} disabled={busy}
              className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-smoke transition-transform duration-200 hover:scale-105 hover:border-red-300 hover:text-red-600">
              Leave
            </button>
          )}
          {canManage && (
            <Link to={`/manage/${market.slug}`} className="btn-secondary !py-2.5">
              <Icon name="shield" className="h-4 w-4" /> Settings
            </Link>
          )}
        </div>
      </div>

      {/* Tabs. Horizontally scrollable on a phone rather than wrapping to two
          rows: a wrapped tab strip pushes the content below the fold on a 375px
          screen, and four items scroll comfortably. */}
      <nav
        aria-label={`${market.name} sections`}
        className="-mx-4 mt-6 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex min-w-max items-center gap-1 border-b border-gray-100">
          {TABS.map((t) => (
            <NavLink
              key={t.label}
              to={`/c/${market.slug}${t.to}`}
              end={t.end}
              className={({ isActive }) =>
                cx(
                  'relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors',
                  (tab ? tab === t.label : isActive)
                    ? 'text-brand after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand'
                    : 'text-smoke hover:text-ink',
                )
              }
            >
              <Icon name={t.icon} className="h-4 w-4" />
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
