import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCommunity } from '../context/CommunityContext'
import NetworkLayout, { RailCard, flagFromIso } from '../components/network/NetworkLayout'
import NetworkMotion from '../components/NetworkMotion'
import TrypPlane from '../components/network/TrypPlane'
import LiveChallengeCard from '../components/network/LiveChallengeCard'
import { CountUp } from '../components/network/Motion'
import ProfileProgress from '../components/network/ProfileProgress'
import Reorderable from '../components/network/Reorderable'
import FlagStack from '../components/network/FlagStack'
import CreatorMap from '../components/CreatorMap'
import CreatorSpotlight from '../components/CreatorSpotlight'
import Icon from '../components/Icon'
import { Avatar, EmptyState, Skeleton } from '../components/ui'
import { flagForCountry } from '../lib/flags'
import { stripMarkup } from '../lib/richText'
import { cx, timeAgo } from '../lib/utils'
import { cardHover } from '../lib/motion'
import Reveal from '../components/network/Reveal'

// The Worldwide hub. Reads as a HOME PAGE, not a directory of markets: a
// greeting, then what is happening, then where everyone is.
//
// THE DIVISION OF LABOUR, which the whole shell depends on
//
// Worldwide owns the PEOPLE. Connections, DMs, the map, the collab board, the
// creator directory, the daily game and the combined standings all live here and
// are never split by country, because splitting them is what would make a
// four-market network feel like four small lonely apps.
//
// A market owns the WORK. Challenges, briefs, rooms, its own standings and its
// own team. Those belong to the place they were set for.
//
// The rail on the right is the people layer made reachable from anywhere,
// because those pages have no natural home in a feed.

const MotionLink = motion.create(Link)

function SectionHead({ icon, title, hint, to, toLabel }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Icon name={icon} className="h-5 w-5 shrink-0 text-brand" /> {title}
        </h2>
        {hint && <p className="mt-1 text-sm text-smoke">{hint}</p>}
      </div>
      {to && <Link to={to} className="shrink-0 text-sm font-medium text-brand transition-transform duration-200 hover:scale-105">{toLabel} →</Link>}
    </div>
  )
}

// A market as a DOOR, not a summary.
//
// This card used to print the market's live challenge title, which is what made
// Worldwide and Spain feel intertwined: you would be reading the network hub and
// half of what you saw belonged to one market. A challenge belongs on its
// market's page. What survives is only what helps you decide where to go.
function MarketCard({ chapter, mine, isHome, memberCount, hasLive }) {
  return (
    <MotionLink
      to={`/c/${chapter.slug}`}
      {...cardHover}
      className={cx(
        'flex items-center gap-3 rounded-card border bg-white px-5 py-4 hover:shadow-lift',
        mine ? 'border-brand/30 bg-brand-tint/20' : 'border-gray-100',
      )}
    >
      <FlagStack codes={chapter.country_codes} className="text-lg" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold">{chapter.name}</span>
          {isHome && <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">Home</span>}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-smoke">
          <span>{memberCount == null ? '—' : memberCount} {memberCount === 1 ? 'creator' : 'creators'}</span>
          {hasLive && (
            <>
              <span aria-hidden>•</span>
              <span className="flex items-center gap-1.5 font-medium text-brand">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
                </span>
                Challenge running
              </span>
            </>
          )}
        </span>
      </span>
      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
    </MotionLink>
  )
}

// The people layer, as one block.
//
// This IS the old avatar dropdown, moved somewhere it can be read. Fourteen
// unlabelled links in a 240px menu is a list you scan by hunting; the same links
// grouped, described and always in the same place on the hub is navigation. The
// menu now keeps only what is about you.
// `short` is what the mobile quick-action grid shows: four across at 375px is
// about nine characters, and "Travel collab board" truncated to "Travel c…"
// helps nobody.
const NETWORK_LINKS = [
  { to: '/creators', icon: 'users', label: 'Creator directory', short: 'Creators', hint: 'Everyone, on a map' },
  { to: '/messages', icon: 'envelope', label: 'Direct messages', short: 'DMs', hint: 'Anyone, any market' },
  { to: '/connections', icon: 'heart', label: 'Connections', short: 'Connect', hint: 'Requests and mutuals', badge: 'connections' },
  { to: '/collab', icon: 'pin', label: 'Travel collab board', short: 'Collab', hint: 'Who is going where' },
  { to: '/events', icon: 'calendar', label: 'Calendar', short: 'Calendar', hint: 'Events and meetups' },
  { to: '/leaderboard', icon: 'chart', label: 'Leaderboard', short: 'Ranks', hint: 'Across every market' },
  { to: '/game', icon: 'joystick', label: 'Travel games', short: 'Games', hint: 'Puzzles, quizzes and streaks' },
  { to: '/resources', icon: 'book', label: 'Resource library', short: 'Library', hint: 'Guides and templates', badge: 'resources' },
  { to: '/jobs', icon: 'briefcase', label: 'Roles', short: 'Roles', hint: 'Paid work with Tryp.com' },
  { to: '/refer', icon: 'share', label: 'Refer a creator', short: 'Refer', hint: 'Bring someone in' },
]

// Everyone gets to put these in their own order.
//
// Ten links in a fixed order is somebody else's guess at what matters to you.
// A creator who lives in the DMs and never opens the game should not scroll past
// the game to reach the DMs, and the cost of letting them fix that is one array
// in localStorage. Per device on purpose: it is a layout preference, not an
// account setting, and it should not need a round trip to take effect.
//
// Links added to the product later fall in at the end rather than vanishing,
// because the saved value is an order, not a whitelist.
const ORDER_KEY = 'network-links-order'
// Your places gets the same treatment, keyed separately. Somebody in four
// markets has a favourite, and it is not always the one they call home.
const MARKET_ORDER_KEY = 'network-market-order'

function loadOrder() {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY)) || [] } catch { return [] }
}

function loadMarketOrder() {
  try { return JSON.parse(localStorage.getItem(MARKET_ORDER_KEY)) || [] } catch { return [] }
}

// A saved order is a preference over the markets you had THEN. Markets you join
// later fall in at the end rather than disappearing, and markets you leave drop
// out without leaving a hole.
function orderMarkets(markets, order, homeId) {
  if (!order.length) return markets
  const rank = new Map(order.map((id, i) => [id, i]))
  return [...markets].sort(
    (a, b) => (rank.has(a.id) ? rank.get(a.id) : 1e9) - (rank.has(b.id) ? rank.get(b.id) : 1e9)
      || (b.id === homeId) - (a.id === homeId)
      || a.name.localeCompare(b.name),
  )
}

function orderLinks(order) {
  if (!order.length) return NETWORK_LINKS
  const rank = new Map(order.map((to, i) => [to, i]))
  return [...NETWORK_LINKS].sort(
    (a, b) => (rank.has(a.to) ? rank.get(a.to) : 1e9) - (rank.has(b.to) ? rank.get(b.to) : 1e9),
  )
}

// THE GRIP IS A SEPARATE ELEMENT FROM THE LINK.
//
// This row used to spread `handleProps` straight onto its <Link>, which made
// the entire link the drag handle. Every press on it was therefore a press on
// a handle first and a navigation second, and the disambiguation lost often
// enough that the markets in the rail read as simply not clickable. The grip
// is its own target now, sitting outside the <Link>, and the link is only ever
// a link. Same shape as NetworkLinkRow below, for the same reason.
function MarketLinkRow({ market, live, handleProps, dragging }) {
  return (
    <div className={cx(
      'group flex items-center gap-1 rounded-xl transition-shadow',
      // The lift is on the row itself. Reorderable used to draw it on its own
      // wrapper, at a different corner radius, which showed as grey arcs at the
      // corners of whatever was being dragged.
      dragging ? 'bg-white shadow-card' : 'hover:bg-cloud',
    )}>
      <Link to={`/c/${market.slug}`} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2 text-sm">
        <FlagStack codes={market.country_codes} className="text-[13px]" />
        <span className="min-w-0 flex-1 truncate">{market.name}</span>
        {live && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" title="Challenge running" />}
      </Link>
      <span {...handleProps} title="Drag to reorder" className={GRIP_CLASS}>
        <Icon name="grip" className="h-4 w-4" />
      </span>
    </div>
  )
}

// The grip is always in the DOM. It used to be fully transparent until hover,
// which was survivable when the whole row could be dragged and is not now that
// the grip is the only way to reorder anything: a control you cannot see is a
// feature nobody has. It sits at low opacity instead, and comes up to full on
// hover or focus. Below `sm` there is no hover to speak of, so it stays lit.
const GRIP_CLASS = 'mr-1 flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-gray-300 transition-opacity hover:text-smoke focus:opacity-100 focus:outline-none focus-visible:text-brand sm:opacity-40 sm:group-hover:opacity-100'

// One row of the "Across the network" list. Module scope, not nested: a
// component defined during render is a new type every render, which would
// unmount the row mid-drag.
function NetworkLinkRow({ link, count, isNew, handleProps, dragging }) {
  return (
    <div className={cx(
      'group flex items-center gap-1 rounded-xl transition-shadow',
      // The lift is on the row itself. Reorderable used to draw it on its own
      // wrapper, at a different corner radius, which showed as grey arcs at the
      // corners of whatever was being dragged.
      dragging ? 'bg-white shadow-card' : 'hover:bg-cloud',
    )}>
      <Link to={link.to} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2">
        <Icon name={link.icon} className="h-4 w-4 shrink-0 text-smoke transition-colors group-hover:text-brand" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{link.label}</span>
          <span className="block truncate text-[11px] text-smoke">{link.hint}</span>
        </span>
        {count > 0 && (
          <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
        {isNew && (
          <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase text-white">New</span>
        )}
      </Link>
      <span {...handleProps} title="Drag to reorder" className={GRIP_CLASS}>
        <Icon name="grip" className="h-4 w-4" />
      </span>
    </div>
  )
}

export default function GlobalHome() {
  const { profile, session } = useAuth()
  const { network, chapters, myChapters, myCommunities, isGlobalAdmin, error } = useCommunity()
  const [d, setD] = useState(null)
  const [order, setOrder] = useState(loadOrder)
  const [marketOrder, setMarketOrder] = useState(loadMarketOrder)
  const links = useMemo(() => orderLinks(order), [order])
  const networkId = network?.id ?? null

  function saveOrder(next) {
    const keys = next.map((l) => l.to)
    setOrder(keys)
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(keys)) } catch { /* private mode */ }
  }

  function saveMarketOrder(next) {
    const ids = next.map((m) => m.id)
    setMarketOrder(ids)
    try { localStorage.setItem(MARKET_ORDER_KEY, JSON.stringify(ids)) } catch { /* private mode */ }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      const today = new Date().toISOString().slice(0, 10)
      const [
        { data: mems }, { count: creators }, { data: challenges },
        { data: ann }, { data: trips }, { data: fresh }, { data: visited },
        { data: netStandings }, { count: connCount }, { data: latestRes },
        { data: mapPeople }, { data: mapTrips },
      ] = await Promise.all([
        supabase.from('community_members')
          .select('community_id, profiles!inner(is_admin, is_test, status)')
          .eq('status', 'active')
          .eq('profiles.is_admin', false).eq('profiles.is_test', false).eq('profiles.status', 'active'),
        supabase.from('profiles').select('id', { count: 'exact', head: true })
          .eq('status', 'active').eq('is_admin', false).eq('is_test', false),
        supabase.from('challenges').select('id, title, community_id, status, end_date, scoring').eq('status', 'active'),
        // The worldwide announcement thread. Chapter announcements live in the
        // market's own room and are shown there, not mixed in here.
        supabase.from('messages')
          .select('*, profiles:sender_id(name, photo_url)')
          .eq('channel', 'announcements').eq('deleted', false)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('collab_posts')
          .select('id, city, country, start_date, end_date, profiles:creator_id(name, photo_url)')
          .gte('end_date', today).order('start_date', { ascending: true }).limit(6),
        // Six, not four. Four left a hole at the end of a three-across grid and
        // read as "we only have four", which is the opposite of the point.
        supabase.from('profiles').select('id, name, photo_url, bio, country_code')
          .eq('status', 'active').eq('is_admin', false).eq('is_test', false)
          .is('deletion_requested_at', null).order('created_at', { ascending: false }).limit(6),
        supabase.from('profiles').select('countries_visited'),
        supabase.from('network_standings')
          .select('creator_id, points, markets, profiles!inner(id, name, photo_url, is_test)')
          .order('points', { ascending: false }).limit(8),
        // Badge counts for the rail. They were in the avatar menu; the menu no
        // longer holds these links, so the signal has to move with them or a
        // pending connection request becomes invisible.
        supabase.from('connections').select('id', { count: 'exact', head: true })
          .eq('connected_creator_id', session?.user?.id ?? '00000000-0000-0000-0000-000000000000')
          .eq('status', 'pending'),
        supabase.from('resources').select('created_at').order('created_at', { ascending: false }).limit(1),
        // The map's own data. CreatorMap takes creators and trips as props
        // rather than fetching for itself, because the directory page needs the
        // same rows for its card grid and filters and two components loading
        // the roster twice on one page is how a fast page becomes a slow one.
        // Here there is no grid, so this is the only reader.
        supabase.from('profiles')
          .select('id, name, photo_url, city, country, country_code, city_lat, city_lng, show_on_map')
          .eq('status', 'active').eq('is_test', false).is('deletion_requested_at', null),
        supabase.from('collab_posts').select('creator_id, city, country, start_date, end_date')
          .gte('end_date', today).order('start_date'),
      ])
      if (cancelled) return
      const tally = {}
      for (const m of mems || []) tally[m.community_id] = (tally[m.community_id] || 0) + 1
      const live = {}
      for (const c of challenges || []) live[c.community_id] = c

      // Entries and pace for a global challenge, if one is running. The
      // denominator is the network roster, which is every creator, so this is
      // the one participation bar where "of 43" is the honest number.
      let globalEntries = null
      let globalParticipation = null
      const globalChallenge = networkId ? live[networkId] : null
      if (globalChallenge) {
        const [{ data: entrants }, { count: netMembers }] = await Promise.all([
          supabase.from('submissions').select('creator_id').eq('challenge_id', globalChallenge.id),
          supabase.from('community_members')
            .select('profile_id, profiles!inner(is_admin, is_test, status)', { count: 'exact', head: true })
            .eq('community_id', networkId).eq('status', 'active')
            .eq('profiles.is_admin', false).eq('profiles.is_test', false).eq('profiles.status', 'active'),
        ])
        if (cancelled) return
        globalEntries = (entrants || []).length
        globalParticipation = {
          posted: new Set((entrants || []).map((e) => e.creator_id)).size,
          total: netMembers ?? 0,
        }
      }
      const latestResource = latestRes?.[0]?.created_at ? new Date(latestRes[0].created_at).getTime() : 0
      const seenResources = profile?.resources_seen_at ? new Date(profile.resources_seen_at).getTime() : 0
      setD({
        counts: tally, creators, live, ann, trips: trips || [], fresh: fresh || [],
        visited: [...new Set((visited || []).flatMap((p) => p.countries_visited || []))],
        network: (netStandings || []).filter((s) => !s.profiles.is_test),
        connReqs: connCount ?? 0,
        newResources: latestResource > seenResources,
        mapPeople: mapPeople || [],
        // Every upcoming trip per creator, soonest first. CreatorMap picks the
        // one it can actually draw an arc for and decides how far ahead is
        // worth showing.
        mapTrips: (mapTrips || []).reduce((acc, t) => {
          (acc[t.creator_id] ||= []).push({ ...t, current: t.start_date <= today })
          return acc
        }, {}),
        globalEntries,
        globalParticipation,
      })
    }
    load()
    return () => { cancelled = true }
  }, [session?.user?.id, profile?.resources_seen_at, networkId])

  if (error) {
    return (
      <NetworkLayout>
        <EmptyState icon={<Icon name="alert" className="h-6 w-6" />}
          title="The network tables are not readable yet" hint={error} />
      </NetworkLayout>
    )
  }

  const home = myChapters.find((c) => c.membership?.is_home)
  const openMarkets = chapters
    .filter((c) => c.is_active)
    .sort((a, b) => (b.id === home?.id) - (a.id === home?.id) || a.name.localeCompare(b.name))
  const myMarkets = myChapters
    .slice()
    .sort((a, b) => (b.id === home?.id) - (a.id === home?.id) || a.name.localeCompare(b.name))
  const orderedMarkets = orderMarkets(myMarkets, marketOrder, home?.id)

  // Live challenges in markets the viewer is actually in. A market they can
  // read but have not joined is not "their" live challenge. The network's own
  // challenge is everybody's, so it leads.
  const globalLive = network ? d?.live?.[network.id] : null
  const myLive = [
    ...(globalLive ? [{ market: network, challenge: globalLive, global: true }] : []),
    ...myMarkets.map((m) => (d?.live?.[m.id] ? { market: m, challenge: d.live[m.id] } : null)).filter(Boolean),
  ]

  const rail = (
    <>
      {/* ---------- Live now ---------- */}
      {/* DESKTOP ONLY, all four of these.
          On a phone the rail renders BELOW the article, and every card in it
          repeats something the page has already said: the live challenge now
          leads the page, the quick-action grid near the top IS "Across the
          network", "Your places" is the Your markets section, and the rooms are
          a tab in the nav. Rendering them anyway added roughly 1,200px of
          duplicate navigation to the bottom of an already long page - which is
          most of what "there is too much scrolling" was. */}
      <RailCard className="hidden lg:block" icon={<Icon name="flag" className="h-3.5 w-3.5 text-brand" />} title="Live now">
        {myLive.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-brand-tint/30 px-3 py-3">
            <TrypPlane variant="badge" />
            <p className="text-xs text-smoke">
              Nothing running in your markets right now. The next brief lands here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {myLive.map(({ market, challenge, global: isGlobal }) => (
              <Link key={challenge.id} to={`/challenges/${challenge.id}`}
                className="block rounded-xl border border-brand/25 bg-brand-tint/25 px-3 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
                  </span>
                  {isGlobal
                    ? 'Global · everyone'
                    : market.name}
                </p>
                <p className="mt-1 line-clamp-2 text-sm font-medium">{challenge.title}</p>
              </Link>
            ))}
          </div>
        )}
      </RailCard>

      {/* ---------- Your places ---------- */}
      <RailCard
        className="hidden lg:block"
        icon={<Icon name="globe" className="h-3.5 w-3.5 text-brand" />}
        title="Your places"
        action={
          <Link to="/global/markets" className="text-[11px] font-medium text-brand transition-transform duration-200 hover:scale-105">
            Explore
          </Link>
        }
      >
        {/* Worldwide is pinned and NOT reorderable: it is the one place
            everybody is in and the parent of all the others, so letting it be
            dragged below Spain would be letting somebody file the building
            under one of its rooms. Only the markets move. */}
        <Link to="/global" className="mb-1 flex items-center gap-2.5 rounded-xl bg-brand-tint px-3 py-2 text-sm font-medium text-brand">
          <Icon name="globe" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{network?.name || 'Worldwide'}</span>
        </Link>
        <Reorderable
          items={orderedMarkets}
          onReorder={saveMarketOrder}
          handleLabel="Reorder this market"
          renderItem={(c, { handleProps, dragging }) => (
            <MarketLinkRow market={c} live={!!d?.live?.[c.id]} handleProps={handleProps} dragging={dragging} />
          )}
        />
        {myMarkets.length === 0 && (
          <Link to="/global/markets" className="block rounded-xl border border-dashed border-gray-200 px-3 py-3 text-xs text-smoke transition-colors hover:border-brand hover:text-brand">
            You have not joined a market yet. Find yours →
          </Link>
        )}
      </RailCard>

      {/* ---------- The people layer, in your order ---------- */}
      <RailCard
        className="hidden lg:block"
        icon={<Icon name="users" className="h-3.5 w-3.5 text-brand" />}
        title="Across the network"
      >
        <Reorderable
          items={links}
          getId={(l) => l.to}
          onReorder={saveOrder}
          handleLabel="Reorder this link"
          renderItem={(l, { handleProps, dragging }) => (
            <NetworkLinkRow
              link={l}
              dragging={dragging}
              handleProps={handleProps}
              count={l.badge === 'connections' ? (d?.connReqs ?? 0) : 0}
              isNew={l.badge === 'resources' && d?.newResources}
            />
          )}
        />
      </RailCard>

      {isGlobalAdmin && (
        <RailCard icon={<Icon name="shield" className="h-3.5 w-3.5 text-brand" />} title="Running the platform">
          <div className="space-y-0.5">
            <Link to="/global/settings" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-cloud">
              <Icon name="globe" className="h-4 w-4 shrink-0 text-smoke" /> Network settings
            </Link>
            <Link to="/global/markets" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-cloud">
              <Icon name="flag" className="h-4 w-4 shrink-0 text-smoke" /> All markets
            </Link>
            <Link to="/admin" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-cloud">
              <Icon name="shield" className="h-4 w-4 shrink-0 text-smoke" /> Admin panel
            </Link>
          </div>
        </RailCard>
      )}

      {/* ---------- Worldwide rooms ---------- */}
      <RailCard className="hidden lg:block" icon={<Icon name="chat" className="h-3.5 w-3.5 text-brand" />} title="Worldwide rooms">
        <div className="space-y-0.5">
          <Link to="/global/chat/general" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-cloud">
            <Icon name="chat" className="h-4 w-4 shrink-0 text-smoke" /> General
          </Link>
          <Link to="/global/chat/announcements" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-cloud">
            <Icon name="megaphone" className="h-4 w-4 shrink-0 text-smoke" /> Announcements
          </Link>
        </div>
      </RailCard>
    </>
  )

  return (
    <NetworkMotion>
      <NetworkLayout rail={rail}>
        {/* EVERY SECTION WATCHES ITSELF INTO VIEW.
            This was ONE <Reveal> wrapped round the whole article, and that is
            why the page "just appeared": a single IntersectionObserver on a
            container that starts at the top of the viewport fires on the first
            frame, so all eleven sections ran their stagger immediately and the
            entire hub - including the six screens of it nobody had scrolled to
            yet - had finished animating before the reader looked at it.
            Now each section carries its own observer and arrives as YOU reach
            it, dropping down into place, while the rail slides in from the
            right (NetworkLayout). The grids inside stagger their cards the same
            way the creator directory does, because that is the motion Ethan
            picked and there should only be one. */}
        <div className="space-y-9">

          {/* ---------- Greeting ----------
              `-mb-3` against the page's own `space-y-9`. A greeting is a label
              for the thing under it, not a section in its own right, and eleven
              units of air between "here is what is happening right now" and the
              first thing that is happening read as a missing card. */}
          {/* On a phone the greeting is 2xl, not 3xl. At 375px "Here is what is
              happening across the network right now" already wraps to two lines
              under a 3xl name, and the pair was eating 140px of an 812px screen
              before a single piece of content. */}
          <Reveal from="down" className="-mb-3">
            <section>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                Hey {profile?.name?.split(' ')[0]}
              </h1>
              <p className="mt-1.5 text-sm text-smoke sm:text-base">
                Here is what is happening across the network right now.
              </p>
            </section>
          </Reveal>

          {/* ---------- Live now (phones only) ----------
              On desktop this is the top card of the rail, which is always in
              view. On a phone the rail is at the BOTTOM of a very long page, so
              the one thing on the whole hub a creator can act on today - the
              brief that is running and closing - was six screens below the fold
              and under a map. It leads on mobile instead. */}
          {myLive.length > 0 && (
            <Reveal from="down" className="lg:hidden">
              <section>
                <div className="space-y-2">
                  {myLive.map(({ market, challenge, global: isGlobal }) => (
                    <Link key={challenge.id} to={`/challenges/${challenge.id}`}
                      className="block rounded-card border border-brand/30 bg-brand-tint/30 p-4 transition-transform duration-200 active:scale-[0.99]">
                      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
                        </span>
                        {isGlobal ? 'Live · everyone' : `Live in ${market.name}`}
                      </p>
                      <p className="mt-1.5 font-semibold leading-snug">{challenge.title}</p>
                      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
                        Submit your video
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            </Reveal>
          )}

          {/* ---------- Quick actions (phones and tablets only) ----------
              On desktop these live in the rail, which is always in view. On a
              phone the rail is at the BOTTOM of a long page, so the ten most
              useful destinations in the product were a full scroll away from
              the page that is supposed to be the way in. A grid up here is one
              thumb-reach instead.
              ALL TEN, in the creator's own order. It used to show the first
              eight of a fixed list, so Roles and Refer existed on desktop and
              simply did not on a phone, and reordering the rail changed nothing
              for the people who only ever see this grid. */}
          <Reveal from="down" className="lg:hidden">
            <section>
            <div className="grid grid-cols-4 gap-2">
              {links.map((l) => {
                const count = l.badge === 'connections' ? d?.connReqs : 0
                const isNew = l.badge === 'resources' && d?.newResources
                return (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="relative flex flex-col items-center gap-1.5 rounded-2xl border border-gray-100 bg-white px-1 py-3 text-center transition-transform duration-200 active:scale-95"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-tint">
                      <Icon name={l.icon} className="h-4 w-4 text-brand" />
                    </span>
                    <span className="w-full truncate px-0.5 text-[11px] font-medium leading-tight">
                      {l.short || l.label}
                    </span>
                    {count > 0 && (
                      <span className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[9px] font-semibold text-white">
                        {count > 9 ? '9+' : count}
                      </span>
                    )}
                    {isNew && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand" />}
                  </Link>
                )
              })}
            </div>
            <Link
              to="/global/markets"
              className="mt-2 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 py-2.5 text-sm font-medium text-smoke transition-colors active:border-brand active:text-brand"
            >
              <Icon name="magnifier" className="h-4 w-4" /> Explore markets
            </Link>
            </section>
          </Reveal>

          {/* ---------- Finish your profile ---------- */}
          {/* Removes itself at 100%. A checklist that survives completion is
              nagging, and this is a nudge. */}
          <Reveal from="down"><ProfileProgress /></Reveal>

          {/* ---------- Welcome ---------- */}
          {/* No `initial/animate` of its own any more. It had a mount tween
              while everything around it had a scroll trigger, so the one card
              that is always above the fold was also the one card that animated
              on a different clock. The Reveal owns it now, like every other
              section. */}
          <Reveal from="down">
          <section
            className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:p-10"
          >
            <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-black/5 blur-2xl" />
            <TrypPlane variant="hero" id="welcome" />
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider">
                <Icon name="globe" className="h-3.5 w-3.5" />
                {network?.name || 'Worldwide'}
              </span>
              <h2 className="mt-5 max-w-2xl text-xl font-bold leading-tight sm:text-3xl lg:text-4xl">
                Welcome to the Tryp.com content creator community
              </h2>
              {/* The explanation is for somebody's first week. On a phone it is
                  three lines of text a returning creator scrolls past every
                  single day, so it earns its place only where the space is
                  free. */}
              <p className="mt-3 hidden max-w-xl text-white/85 sm:block">
                One community across every market. Your connections, messages, the map and the daily game live here and are never split by country.
              </p>
              {/* Counting up, once, when the card is first seen. A number that
                  moves reads as a quantity that grows, which is the one thing
                  this card is trying to say. */}
              <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4 sm:mt-8 sm:gap-x-10">
                {/* TWO NUMBERS, NOT THREE. "Nations" was a count of distinct
                    `country_code` values on active profiles, and that column is
                    only ever filled in by onboarding - so for most of the
                    roster it is null and the card said "0 Nations" underneath
                    two real numbers. A stat that is wrong is worse than a stat
                    that is missing, and the card reads cleaner with two. */}
                {[
                  { n: d?.creators, label: 'Creators worldwide' },
                  { n: openMarkets.length, label: 'Markets open' },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-2xl font-bold sm:text-3xl">
                      {s.n == null ? '—' : <CountUp value={s.n} />}
                    </p>
                    <p className="text-xs font-medium uppercase tracking-widest text-white/70">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
          </Reveal>

          {/* ---------- Global challenge ---------- */}
          {/* Above the markets on purpose. A global challenge is the one thing
              on this page that everybody reading it can act on right now, and
              burying it under a list of places would be exactly backwards. */}
          {globalLive && (
            <Reveal from="down">
              <section>
                <SectionHead icon="globe" title="Open to everyone"
                  hint="A global brief. Enter from any market, anywhere in the world." />
                <LiveChallengeCard
                  challenge={globalLive}
                  market={network?.name}
                  entries={d?.globalEntries ?? null}
                  participation={d?.globalParticipation ?? null}
                  global
                />
              </section>
            </Reveal>
          )}

          {/* ---------- Markets ---------- */}
          <Reveal from="down">
            <section>
              <SectionHead
                icon="flag"
                title={myMarkets.length ? 'Your markets' : 'Markets'}
                to="/global/markets"
                toLabel={isGlobalAdmin ? 'All markets' : 'Explore'}
              />
              <Reveal className="grid gap-3 sm:grid-cols-2" stagger={0.07}>
                {(myMarkets.length ? myMarkets : openMarkets).map((c) => (
                  <MarketCard key={c.id} chapter={c}
                    mine={myCommunities.some((m) => m.id === c.id)}
                    isHome={c.id === home?.id}
                    memberCount={d ? (d.counts[c.id] ?? 0) : null}
                    hasLive={!!d?.live?.[c.id]} />
                ))}
              </Reveal>
            </section>
          </Reveal>

          {/* ---------- Network standings ---------- */}
          {/* Reveal, not a stagger: these sections are below the fold, and a
              list that already animated in before you scrolled to it has spent
              its motion on nobody. */}
          {/* Points are earned inside a market but they add up across the whole
              network, so this is the one leaderboard that belongs at network
              level. A creator who moves from Spain to the UK keeps their
              standing here. */}
          {d?.network?.length > 0 && (
            <Reveal from="down">
              <section>
                <SectionHead icon="trophy" title="Across the network"
                  hint="Points earned in any market, added up. Your standing follows you if you move." />
                <Reveal className="space-y-2" stagger={0.05}>
                  {d.network.map((s, i) => (
                    <div key={s.creator_id}
                      className={cx('flex items-center gap-3 rounded-card border bg-white px-5 py-3.5',
                        i === 0 ? 'border-brand/30 bg-brand-tint/20' : 'border-gray-100')}>
                      <span className={cx('w-5 shrink-0 text-sm font-bold', i === 0 ? 'text-brand' : 'text-smoke')}>{i + 1}</span>
                      <Avatar src={s.profiles.photo_url} name={s.profiles.name} size="sm" />
                      <Link to={`/profile/${s.creator_id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-brand">
                        {s.profiles.name}
                      </Link>
                      {s.markets > 1 && (
                        <span className="hidden shrink-0 rounded-full bg-cloud px-2 py-0.5 text-[10px] font-medium text-smoke sm:inline">
                          {s.markets} markets
                        </span>
                      )}
                      <span className="shrink-0 text-sm font-bold text-brand">{Number(s.points)} pts</span>
                    </div>
                  ))}
                </Reveal>
              </section>
            </Reveal>
          )}

          {/* ---------- Latest announcement ---------- */}
          {d?.ann && (
            <Reveal from="down">
              <section>
                <SectionHead icon="megaphone" title="Latest announcement" to="/global/chat/announcements" toLabel="All announcements" />
                <Link to="/global/chat/announcements"
                  className="card block border-l-4 !border-l-brand transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="flex items-center gap-3">
                    <Avatar src={d.ann.profiles?.photo_url} name={d.ann.profiles?.name} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{d.ann.profiles?.name}</p>
                      <p className="text-xs text-smoke">{timeAgo(d.ann.created_at)}</p>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm text-ink">{stripMarkup(d.ann.body)}</p>
                </Link>
              </section>
            </Reveal>
          )}

          {/* ---------- The map ----------
              THE PEOPLE MAP, NOT THE COUNTRY MAP.
              This slot used to hold "Where we have been, together": every
              country anybody in the network had ever visited, shaded in. It is a
              nice picture and it is the wrong one for a hub, because it answers
              a question about the past and shows you nobody. The network hub is
              where you find PEOPLE, so it now carries the creator map - every
              creator in every market, in the town they are actually in, with the
              planes joining them up.
              The countries-visited map moved to the creator directory, where a
              page already about the community is the right place for a picture
              of where that community has been. */}
          <Reveal from="down">
            <section>
              <SectionHead icon="globe" title="Everyone, right now"
                hint="Every creator in the network on one map, wherever they are based. Tap a pin to see who is there."
                to="/creators" toLabel="Creator directory" />
              {d
                ? <CreatorMap creators={d.mapPeople} trips={d.mapTrips} myId={session?.user?.id} />
                : <Skeleton className="h-72" />}
            </section>
          </Reveal>

          {/* ---------- Creators on the move ---------- */}
          {d?.trips?.length > 0 && (
            <Reveal from="down">
              <section>
                <SectionHead icon="pin" title="Creators on the move" to="/collab" toLabel="Collab board" />
                <Reveal className="trim-4 grid grid-cols-1 gap-3 sm:grid-cols-2" stagger={0.07}>
                  {d.trips.map((t) => (
                    <MotionLink key={t.id} to="/collab" {...cardHover}
                      className="card flex items-center gap-3 !p-4 hover:shadow-lift">
                      <Avatar src={t.profiles?.photo_url} name={t.profiles?.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {t.profiles?.name?.split(' ')[0]} → {flagForCountry(t.country)} {t.city}
                        </p>
                        <p className="truncate text-xs text-smoke">
                          {format(new Date(t.start_date), 'd MMM')} – {format(new Date(t.end_date), 'd MMM')}
                        </p>
                      </div>
                    </MotionLink>
                  ))}
                </Reveal>
              </section>
            </Reveal>
          )}

          {/* ---------- Spotlight ---------- */}
          <Reveal from="down"><CreatorSpotlight /></Reveal>

          {/* ---------- New creators ---------- */}
          {d?.fresh?.length > 0 && (
            <Reveal from="down">
              <section>
                <SectionHead icon="users" title="New in the community" to="/creators" toLabel="All creators" />
                <Reveal className="trim-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" stagger={0.07}>
                  {d.fresh.map((c) => (
                    <MotionLink key={c.id} to={`/profile/${c.id}`} {...cardHover}
                      className="card flex min-w-0 items-center gap-3 !p-4 hover:shadow-lift">
                      <Avatar src={c.photo_url} name={c.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate font-semibold">
                          <span className="truncate">{c.name}</span>
                          {c.country_code && <span className="shrink-0 text-xs" aria-hidden>{flagFromIso(c.country_code)}</span>}
                        </p>
                        {c.bio && <p className="truncate text-xs text-smoke">{c.bio}</p>}
                      </div>
                    </MotionLink>
                  ))}
                </Reveal>
              </section>
            </Reveal>
          )}
        </div>
      </NetworkLayout>
    </NetworkMotion>
  )
}
