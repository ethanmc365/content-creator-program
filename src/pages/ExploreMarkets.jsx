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
import { Badge, Skeleton } from '../components/ui'
import { cx } from '../lib/utils'
import { notice } from '../lib/confirm'
import { listContainer, listItem, cardHover, pageFade } from '../lib/motion'

// Every market, and whether it is yours.
//
// This page is the reason the switcher no longer lists every country. Discovery
// needs to explain itself: what a market is, why you can or cannot join one, and
// what joining changes. A pill in a strip can do none of that, and trying made
// the strip a wall of flags a UK creator had no use for.
//
// EXPLORE OPENS DOORS. IT DOES NOT ASK FOR COMMITMENTS.
//
// Every card used to carry a filled "Join" button beside a quiet "Look first"
// link, which is a choice between committing to a place you have never seen and
// admitting you would rather not. Nobody should be asked to answer that from a
// 200px card, and the two buttons made the smaller, sensible one look like the
// timid option.
//
// So a card is now a door: one action, "Open", on every market. The invitation
// to join lives inside the market, under its header, once you have actually
// looked at it (see MarketHeader). What survives here is the part that genuinely
// belongs to discovery: whether you COULD join, said plainly, so the answer is
// visible before you spend a click rather than arriving as an error after one.
//
// The rule is `communities.join_policy`, enforced by join_market() in the
// database. This mirrors it; the database is still the one that decides.

const MotionLink = motion.create(Link)

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
function MarketCard({ market, highlight, isMine, joinState, count, hasLive, requestState, onRequest }) {
  const flags = (market.country_codes || []).map(flagFromIso).join(' ')
  // The whole card is the door. A card with one action in it should not make
  // you find the action.
  return (
    <MotionLink
      to={`/c/${market.slug}`}
      variants={listItem}
      {...cardHover}
      className={cx(
        'flex flex-col rounded-card border bg-white p-5 transition-shadow duration-200 hover:shadow-lift',
        highlight ? 'border-brand/40 bg-brand-tint/20' : isMine ? 'border-brand/25' : 'border-gray-100',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="shrink-0 text-2xl leading-none" aria-hidden>{flags || '🌍'}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{market.name}</span>
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

      {/* PUTTING YOUR HAND UP.
          A creator looking at a market they are not in could see it and do
          nothing about it, so the only route in was to find somebody and ask.
          "Request to join" is that ask, made once, visible to the market's
          leads, and answered - a decline carries a reason and both outcomes
          reach the creator's bell. */}
      <div className="mt-5 flex items-center gap-3 border-t border-gray-50 pt-4">
        <span className="min-w-0 flex-1 truncate text-xs text-smoke">
          {isMine ? 'You are a member'
            : requestState === 'pending' ? 'Request sent'
              : joinState.can ? `Open to you · ${joinState.why}` : joinState.why}
        </span>
        {isMine ? (
          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand">
            Open <Icon name="chevronRight" className="h-4 w-4" />
          </span>
        ) : requestState === 'pending' ? (
          <span className="shrink-0 rounded-full bg-cloud px-3 py-1 text-xs font-medium text-smoke">Waiting</span>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRequest?.(market) }}
            className="shrink-0 rounded-full border border-brand px-3.5 py-1.5 text-xs font-semibold text-brand transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand hover:text-white"
          >
            Request to join
          </button>
        )}
      </div>
    </MotionLink>
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
  const { profile, user } = useAuth()
  const { network, chapters, myChapters, isGlobalAdmin, loading: ctxLoading } = useCommunity()
  const [counts, setCounts] = useState(null)
  const [live, setLive] = useState({})

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

  // What this creator has already asked for, so a card never offers to send a
  // request they have already sent.
  const [requests, setRequests] = useState({})
  useEffect(() => {
    if (!user?.id) return
    let alive = true
    supabase.from('market_join_requests')
      .select('community_id, status')
      .eq('profile_id', user.id)
      .eq('status', 'pending')
      .then(({ data }) => {
        if (alive) setRequests(Object.fromEntries((data ?? []).map((r) => [r.community_id, r.status])))
      })
    return () => { alive = false }
  }, [user])

  async function requestJoin(market) {
    if (!user?.id) return
    // Optimistic: the button has to stop offering immediately or it reads as
    // having done nothing and gets pressed again.
    setRequests((r) => ({ ...r, [market.id]: 'pending' }))
    const { error } = await supabase.from('market_join_requests')
      .insert({ community_id: market.id, profile_id: user.id })
    if (error) {
      setRequests((r) => { const next = { ...r }; delete next[market.id]; return next })
      notice(`Could not send that request: ${error.message}`)
      return
    }
    notice(`Asked to join ${market.name}. The team there will let you know.`)
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
        requestState={requests[m.id]}
        onRequest={requestJoin}
        joinState={joinability(m, profile, isGlobalAdmin)}
        count={counts ? (counts[m.id] ?? 0) : null}
        hasLive={!!live[m.id]}
      />
    ))

  return (
    <NetworkMotion>
      <NetworkLayout>
        <motion.div {...pageFade} className="space-y-10">
          <section className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:p-9">
            <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
            <TrypPlane variant="hero" id="markets" />
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
            </>
          )}
        </motion.div>
      </NetworkLayout>
    </NetworkMotion>
  )
}
