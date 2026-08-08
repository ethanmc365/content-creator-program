import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCommunity } from '../context/CommunityContext'
import NetworkLayout, { flagFromIso } from '../components/network/NetworkLayout'
import NetworkMotion from '../components/NetworkMotion'
import TrypPlane from '../components/network/TrypPlane'
import Icon from '../components/Icon'
import { notice } from '../lib/confirm'
import { clearScopeCache } from '../lib/scope'
import { Badge, Skeleton } from '../components/ui'
import { cx } from '../lib/utils'
import { listContainer, listItem, pageFade } from '../lib/motion'

// Every market, and whether it is yours.
//
// This page is the reason the switcher no longer lists every country. Discovery
// needs to explain itself: what a market is, why you can or cannot join one, and
// what joining changes. A pill in a strip can do none of that, and trying made
// the strip a wall of flags a UK creator had no use for.
//
// The joinability rule is `communities.join_policy`, enforced by join_market()
// in the database. This page mirrors it so the reason is visible BEFORE the
// click rather than arriving as an error afterwards.

function joinability(market, profile, isGlobalAdmin) {
  if (!market.is_active) {
    return { can: isGlobalAdmin, why: 'Not open yet', tone: 'closed' }
  }
  if (isGlobalAdmin) return { can: true, why: 'You run the platform', tone: 'open' }
  if (market.join_policy === 'open') return { can: true, why: 'Open to any creator', tone: 'open' }
  if (market.join_policy === 'invite') {
    return { can: false, why: 'Invite only. Ask the team.', tone: 'closed' }
  }
  const codes = market.country_codes || []
  if (profile?.country_code && codes.includes(profile.country_code)) {
    return { can: true, why: 'Your country is in this market', tone: 'match' }
  }
  return {
    can: false,
    why: profile?.country_code
      ? `For creators based in ${codes.join(', ') || 'this region'}`
      : 'Add your country to your profile to join a market',
    tone: 'closed',
  }
}

// Declared at module scope, not inside ExploreMarkets. A component defined
// during render is a NEW component type on every render, so React unmounts and
// remounts the whole subtree each time - which here would drop the "Joining…"
// state the instant the join finished.
function MarketCard({ market, highlight, isMine, joinState, count, hasLive, busy, onJoin }) {
  const flags = (market.country_codes || []).map(flagFromIso).join(' ')
  return (
    <motion.div
      variants={listItem}
      className={cx(
        'flex flex-col rounded-card border bg-white p-5 transition-shadow duration-200 hover:shadow-card',
        highlight ? 'border-brand/40 bg-brand-tint/20' : isMine ? 'border-brand/25' : 'border-gray-100',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="shrink-0 text-2xl leading-none" aria-hidden>{flags || '🌍'}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <Link to={`/c/${market.slug}`}
              className="inline-block origin-left truncate font-semibold transition-transform duration-200 hover:scale-105">
              {market.name}
            </Link>
            {isMine && <Badge tone="light">Yours</Badge>}
            {!market.is_active && <Badge tone="grey">Closed</Badge>}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-smoke">
            {market.tagline || `Challenges, briefs and rooms for ${market.name}.`}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-smoke">
        <span className="flex items-center gap-1.5">
          <Icon name="users" className="h-3.5 w-3.5" />
          {count == null ? '—' : count} creators
        </span>
        <span className="flex items-center gap-1.5">
          <Icon name="money" className="h-3.5 w-3.5" />
          {market.currency}
        </span>
        {hasLive && (
          <span className="flex items-center gap-1.5 font-medium text-brand">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
            </span>
            Challenge running
          </span>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2">
        {isMine ? (
          <Link to={`/c/${market.slug}`} className="btn-secondary flex-1 justify-center !py-2 !text-sm">
            Open
          </Link>
        ) : joinState.can ? (
          <button onClick={() => onJoin(market)} disabled={busy}
            className="btn-primary flex-1 justify-center !py-2 !text-sm">
            {busy ? 'Joining…' : 'Join'}
          </button>
        ) : (
          <span className="flex-1 rounded-full bg-cloud px-3 py-2 text-center text-xs text-smoke">
            {joinState.why}
          </span>
        )}
        {!isMine && joinState.can && (
          <Link to={`/c/${market.slug}`}
            className="rounded-full border border-gray-200 px-3 py-2 text-xs font-medium transition-transform duration-200 hover:scale-105 hover:border-brand hover:text-brand">
            Look first
          </Link>
        )}
      </div>
    </motion.div>
  )
}

function Group({ title, hint, children }) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint && <p className="mt-1 text-sm text-smoke">{hint}</p>}
      </div>
      <motion.div variants={listContainer} initial="hidden" animate="show"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {children}
      </motion.div>
    </section>
  )
}

export default function ExploreMarkets() {
  const { profile } = useAuth()
  const { network, chapters, myChapters, isGlobalAdmin, reload, loading: ctxLoading } = useCommunity()
  const [counts, setCounts] = useState(null)
  const [live, setLive] = useState({})
  const [busy, setBusy] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ data: mems }, { data: challenges }] = await Promise.all([
        supabase.from('community_members')
          .select('community_id, profiles!inner(is_admin, is_test, status)')
          .eq('status', 'active')
          .eq('profiles.is_admin', false).eq('profiles.is_test', false).eq('profiles.status', 'active'),
        supabase.from('challenges').select('id, title, community_id').eq('status', 'active'),
      ])
      if (cancelled) return
      const tally = {}
      for (const m of mems || []) tally[m.community_id] = (tally[m.community_id] || 0) + 1
      const byMarket = {}
      for (const c of challenges || []) byMarket[c.community_id] = c
      setCounts(tally)
      setLive(byMarket)
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function join(market) {
    setBusy(market.slug)
    const { error } = await supabase.rpc('join_market', { p_slug: market.slug })
    setBusy('')
    if (error) { notice(error.message); return }
    clearScopeCache()
    await reload()
    notice(`You are in ${market.name}.`)
  }

  const mineIds = new Set(myChapters.map((c) => c.id))
  const suggested = chapters.filter(
    (c) => c.is_active && !mineIds.has(c.id)
      && (c.country_codes || []).includes(profile?.country_code)
  )
  const open = chapters.filter((c) => c.is_active && !mineIds.has(c.id) && !suggested.includes(c))
  const closed = chapters.filter((c) => !c.is_active && !mineIds.has(c.id))
  const mine = chapters.filter((c) => mineIds.has(c.id))

  const cards = (items, highlight = false) =>
    items.map((m) => (
      <MarketCard
        key={m.id}
        market={m}
        highlight={highlight}
        isMine={mineIds.has(m.id)}
        joinState={joinability(m, profile, isGlobalAdmin)}
        count={counts ? (counts[m.id] ?? 0) : null}
        hasLive={!!live[m.id]}
        busy={busy === m.slug}
        onJoin={join}
      />
    ))

  return (
    <NetworkMotion>
      <NetworkLayout>
        <motion.div {...pageFade} className="space-y-10">
          <section className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:p-9">
            <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
            <TrypPlane variant="corner" />
            <div className="relative">
              <Link to="/global" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-white/80 transition-colors hover:text-white">
                <Icon name="chevronLeft" className="h-4 w-4" /> {network?.name || 'Worldwide'}
              </Link>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Markets</h1>
              <p className="mt-2 max-w-2xl text-white/85">
                A market is where the work happens: its own briefs, its own challenges, its own rooms.
                Everything social stays worldwide, so joining one never cuts you off from anybody.
              </p>
            </div>
          </section>

          {ctxLoading && !chapters.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" />
            </div>
          ) : (
            <>
              {suggested.length > 0 && (
                <Group title="Suggested for you" hint="Your profile says this is where you are based.">
                  {cards(suggested, true)}
                </Group>
              )}
              {mine.length > 0 && (
                <Group title="Your markets" hint="You are in these.">{cards(mine)}</Group>
              )}
              {open.length > 0 && (
                <Group title="Other markets" hint="Open, but for creators based there. Have a look around any of them.">
                  {cards(open)}
                </Group>
              )}
              {isGlobalAdmin && closed.length > 0 && (
                <Group title="Not open yet" hint="Visible to you because you run the platform. Creators cannot see or join these.">
                  {cards(closed)}
                </Group>
              )}
              {isGlobalAdmin && (
                <div className="rounded-card border border-dashed border-brand/30 bg-brand-tint/20 px-5 py-6 text-center">
                  <p className="text-sm font-semibold">Opening somewhere new?</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-smoke">
                    The wizard creates the market, its rooms and its first settings in one go, and leaves it closed until you say otherwise.
                  </p>
                  <Link to="/global/settings" className="btn-primary mt-4 !py-2.5">
                    Open a new market
                  </Link>
                </div>
              )}
            </>
          )}
        </motion.div>
      </NetworkLayout>
    </NetworkMotion>
  )
}
