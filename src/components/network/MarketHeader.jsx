import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useCommunity } from '../../context/CommunityContext'
import { confirm, notice, promptText } from '../../lib/confirm'
import { clearScopeCache } from '../../lib/scope'
import { toast } from '../../lib/toast'
import Icon from '../Icon'
import { flagFromIso } from './PlaceSwitcher'
import { cx } from '../../lib/utils'

// The identity strip every page inside a market wears.
//
// A market has four surfaces (overview, challenges, rooms, members) and before
// this they were four pages that happened to be about the same place, reached
// by going back to the overview each time. The tabs are what make it one place.
//
// LOOKING IS NOT A DECISION, JOINING IS
//
// The old version put a "Join Spain" button in the header and, over on Explore,
// a "Join" button beside a "Look first" link. Two doors to the same room, with
// the loud one asking for a commitment before you had seen anything. Nobody can
// answer "do you want to be in this market" from a card.
//
// So the button is gone. Every market page is readable by anyone, and the ask
// moves BELOW the header into a slim banner that only appears once you are
// actually looking at the place, phrased as what you would get rather than as a
// gate. Explore now just opens markets. See ExploreMarkets for the other half.
//
// LEAVING IS A DECISION TOO, AND A COSTLIER ONE
//
// Leave used to sit in the header next to Join, one click and one OK away from
// dropping out of your own market. It now lives behind the overflow menu and
// asks you to type the market's name. Reversible in principle, annoying in
// practice, and nobody does it by accident.
//
// NOTIFICATIONS ARE NOT A HEADER CONTROL
//
// The mute toggle was removed outright. Notification preferences belong in
// Settings with the rest of them, and a "Mute this market" button sitting at the
// top of the market is an invitation to turn the programme off.

const TABS = [
  { to: '', end: true, label: 'Overview', icon: 'home' },
  { to: '/challenges', label: 'Challenges', icon: 'flag' },
  { to: '/chat', label: 'Rooms', icon: 'chat' },
  { to: '/members', label: 'Creators', icon: 'users' },
]

function OverflowMenu({ items, label = 'More' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-smoke transition-transform duration-200 hover:scale-105 hover:border-brand hover:text-brand"
      >
        <Icon name="dots" className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-30 w-60 overflow-hidden rounded-2xl border border-gray-100 bg-white py-1.5 shadow-lift"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick() }}
              className={cx(
                'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors disabled:opacity-40',
                it.danger ? 'text-red-600 hover:bg-red-50' : 'hover:bg-cloud',
              )}
            >
              <Icon name={it.icon} className="h-4 w-4 shrink-0" />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MarketHeader({ market, memberCount, canManage, tab }) {
  const { myChapters, reload } = useCommunity()
  const [busy, setBusy] = useState(false)
  const flags = (market.country_codes || []).map(flagFromIso).join(' ')
  const membership = myChapters.find((c) => c.id === market.id)?.membership
  const isMember = !!membership

  async function join() {
    setBusy(true)
    const { error } = await supabase.rpc('join_market', { p_slug: market.slug })
    setBusy(false)
    if (error) { notice(error.message); return }
    clearScopeCache()
    await reload()
    toast(`You are in ${market.name}. Its briefs and rooms are yours now.`)
  }

  async function leave() {
    const ok = await confirm(
      `Leaving ${market.name} takes its challenges, its rooms and its standings off your account.\n\n`
      + 'You keep every point you have earned, every connection you have made and every message you have sent. '
      + 'Your place on the worldwide network does not change.',
      { title: `Leave ${market.name}?`, confirmLabel: 'Continue', danger: true },
    )
    if (!ok) return
    // A second, deliberately awkward step. The first dialog explains; this one
    // makes it impossible to do by reflex.
    const typed = await promptText(
      `Type ${market.name} to confirm.`,
      { title: 'Are you sure?', placeholder: market.name, confirmLabel: 'Leave the market' },
    )
    if (!typed || typed.toLowerCase() !== market.name.toLowerCase()) {
      if (typed) notice(`That did not match "${market.name}", so nothing has changed.`)
      return
    }
    setBusy(true)
    const { error } = await supabase.rpc('leave_market', { p_slug: market.slug })
    setBusy(false)
    if (error) { notice(error.message); return }
    clearScopeCache()
    await reload()
    toast(`You have left ${market.name}.`)
  }


  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-3xl font-bold tracking-tight sm:text-4xl">
            {flags && <span aria-hidden>{flags}</span>}
            <span>{market.name}</span>
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
          {/* The meta line, and where "home" now lives.
              It used to be a solid orange pill the size of a button sitting
              beside the market's name, which read as a call to action and
              competed with the title for the loudest thing on the page.
              THERE IS NO "HOME MARKET" ANY MORE. It was a label plus a menu
              item that let you nominate one of your markets as the main one,
              and it never meant anything: your briefs, your rooms and your
              standings come from every market you are in, not from one of them.
              A setting that changes nothing but has to be explained is worse
              than no setting. You are simply in whatever markets you are in.
              `is_home` survives in the database as the ordering hint join_market
              already sets for the first chapter somebody joins - nothing reads
              it as a preference and nothing writes it. */}
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

        {/* No Join button up here. The only things in this corner are for people
            who already belong: managing the place, and the small set of
            membership actions nobody needs twice a day. */}
        <div className="flex shrink-0 items-center gap-2">
          {canManage && (
            <Link to={`/manage/${market.slug}`} className="btn-secondary !py-2.5">
              <Icon name="shield" className="h-4 w-4" /> Manage
            </Link>
          )}
          {isMember && (
            <OverflowMenu
              label={`${market.name} membership`}
              items={[
                { label: `Leave ${market.name}`, icon: 'exit', onClick: leave, danger: true, disabled: busy },
              ]}
            />
          )}
        </div>
      </div>

      {/* THE INVITATION, not a gate. It appears under the header of a market you
          are reading but have not joined, so the offer arrives after you have
          had a look rather than before. */}
      {!isMember && market.is_active && (
        <div className="mt-6 flex flex-col gap-3 rounded-card border border-brand/25 bg-brand-tint/25 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">You are looking around {market.name}</p>
            <p className="mt-0.5 text-sm text-smoke">
              Join to enter its challenges, post in its rooms and appear in its standings. You can be in more than one.
            </p>
          </div>
          <button onClick={join} disabled={busy} className="btn-primary shrink-0 !py-2.5">
            {busy ? 'Joining…' : `Join ${market.name}`}
          </button>
        </div>
      )}

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
