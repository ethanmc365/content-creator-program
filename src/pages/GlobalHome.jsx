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
import Reorderable from '../components/network/Reorderable'
import FlagStack from '../components/network/FlagStack'
import CreatorMap from '../components/CreatorMap'
import WhenVisible from '../components/WhenVisible'
import MapSkeleton from '../components/network/MapSkeleton'
import CreatorSpotlight from '../components/CreatorSpotlight'
import WhoToMeet from '../components/WhoToMeet'
import DailyPuzzleCallout from '../components/games/DailyPuzzleCallout'
import BoardCard from '../components/network/BoardCard'
import Icon from '../components/Icon'
import { Avatar, EmptyState, Skeleton } from '../components/ui'
import { flagForCountry } from '../lib/flags'
import { stripMarkup } from '../lib/richText'
import { cx, timeAgo } from '../lib/utils'
import { useIsMobile } from '../lib/useKeyboardInset'
import { cardHover } from '../lib/motion'
import { NETWORK_LINKS, loadLinkOrder as loadOrder, ORDER_KEY } from '../lib/networkLinks'
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

// The people layer, as one block: the rail's own list, shared with the avatar
// menu via lib/networkLinks so the two can never drift apart.
// Your places gets the same treatment, keyed separately. Somebody in four
// markets has a favourite, and it is not always the one they call home.
const MARKET_ORDER_KEY = 'network-market-order'

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

// ONE OF YOUR OWN NUMBERS, ON THE WELCOME CARD, AS A DOOR.
//
// Module scope, not nested inside the page: a component declared during render
// is a new type every render, which unmounts and remounts every chip on any
// state change (the trap that made the collab board's maps reload - see
// Collab.jsx).
//
// ONE SHAPE ONLY: a figure and what it counts. There used to be a second shape
// - `text` alone, for a prompt like "Play today's puzzles" - and it is gone
// with the chip that used it. A row that mixes facts about you with things you
// have not done yet reads as a to-do list, and the numbers stop being the point.
//
// A null value renders a dash rather than a zero. Nothing has loaded yet is not
// the same claim as you have done none of these, and the second one is a
// discouraging thing to say to somebody by accident.
function MineChip({ to, icon, value, label }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/25"
    >
      <Icon name={icon} className="h-3 w-3 shrink-0 text-white/80" />
      <span>
        <span className="font-bold tabular-nums">{value == null ? '—' : value.toLocaleString('en-GB')}</span>
        {' '}<span className="text-white/80">{label}</span>
      </span>
    </Link>
  )
}

export default function GlobalHome() {
  const { profile, session } = useAuth()
  const { network, chapters, myChapters, myCommunities, isGlobalAdmin, error } = useCommunity()
  const [d, setD] = useState(null)
  const [order, setOrder] = useState(loadOrder)
  const [marketOrder, setMarketOrder] = useState(loadMarketOrder)
  const isMobile = useIsMobile()
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
          // countries_visited is what lets a tap on a country answer "who here
          // has been", so it travels with the map's own roster.
          // last_seen_at and bio are what let a city's pin show the creator most
          // worth seeing rather than whichever row came back first (see
          // `byPinPriority` in CreatorMap).
          .select('id, name, photo_url, bio, city, country, country_code, city_lat, city_lng, show_on_map, countries_visited, last_seen_at')
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

  // ---- The numbers on the welcome card ------------------------------------
  //
  // The card used to carry a paragraph explaining that the network is one
  // community, which is a thing you need told once and then scroll past every
  // day for six months. Ethan asked for it gone and for the space to hold
  // something a creator can actually use instead. So the card now answers two
  // questions: what has this community done, and where am I in it.
  //
  // ITS OWN EFFECT, NOT THE PAGE'S LOAD. Everything below the greeting is gated
  // on `d`, so folding four more counts into that Promise.all would hold the
  // whole article back for numbers that are decoration on one card. This runs
  // beside it and the card renders its em-dashes until it lands - which is safe
  // here, unlike the "Live now" empty state, because a dash becoming a number
  // changes nothing about the layout and makes no claim in the meantime.
  // THE COMMUNITY'S DISTANCE FLOWN. Its own tiny query for the same reason as
  // `me` below: it is one figure on one card and holding the whole article back
  // for it would be the wrong trade. The card draws an em-dash until it lands.
  const [flights, setFlights] = useState(null)
  useEffect(() => {
    let cancelled = false
    supabase.rpc('community_flight_totals').then(({ data }) => {
      if (cancelled) return
      const row = Array.isArray(data) ? data[0] : data
      if (row) setFlights({ km: Number(row.total_km) || 0, n: Number(row.total_flights) || 0 })
    })
    return () => { cancelled = true }
  }, [])

  const [me, setMe] = useState(null)
  useEffect(() => {
    const uid = session?.user?.id
    if (!uid) return undefined
    let cancelled = false
    Promise.all([
      supabase.from('submissions').select('id', { count: 'exact', head: true }),
      supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('creator_id', uid),
      // The whole board, which is one row per creator who has ever scored - a
      // few dozen. Asking the server for "my rank" would be a window function
      // in a new RPC to save downloading two kilobytes.
      supabase.from('network_standings').select('creator_id, points').order('points', { ascending: false }),
      // Connections are DIRECTIONAL rows, so being connected to somebody is a
      // row in one direction or the other. Counting only `creator_id = me`
      // would show roughly half of anybody's real network.
      supabase.from('connections').select('id', { count: 'exact', head: true })
        .eq('status', 'accepted').or(`creator_id.eq.${uid},connected_creator_id.eq.${uid}`),
    ]).then(([{ count: videos }, { count: myVideos }, { data: standings }, { count: myConns }]) => {
      if (cancelled) return
      const idx = (standings || []).findIndex((s) => s.creator_id === uid)
      setMe({
        videos: videos ?? 0,
        myVideos: myVideos ?? 0,
        connections: myConns ?? 0,
        points: idx >= 0 ? Math.round(Number(standings[idx].points) || 0) : 0,
        // Rank is only honest once you are ON the board. Somebody with no
        // points is not last, they have not started - so they get no rank.
        rank: idx >= 0 ? idx + 1 : null,
        ranked: (standings || []).length,
      })
    })
    return () => { cancelled = true }
  }, [session?.user?.id])

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

  // THE ARRIVAL LADDER, COUNTED WHERE IT IS SPENT.
  //
  // TWO GENERATIONS OF THIS WERE WRONG, IN THE SAME WAY TWICE.
  //
  // First it was hard-coded numbers in source order, which broke because two
  // sections are `lg:hidden` and a desktop therefore ran 0, gap, gap, 0.15 -
  // real time with nothing happening in it.
  //
  // Then it was a NAMED ladder, and the names drifted from the sections within
  // days: the "markets" step was on the welcome card, the "announcement" step
  // was on the global challenge, and the actual Latest-announcement section had
  // no delay at all - which is precisely why it arrived before the two cards
  // above it, Ethan's third report. Both bugs are the same bug: a
  // hand-maintained mapping between a list of names and a tree of JSX, with
  // nothing checking that the two agree.
  //
  // So the ladder does not have names. `stepDelay()` is a counter read in JSX
  // order, and JSX evaluates its children top to bottom - so the nth section
  // that ACTUALLY RENDERS gets the nth step, on any device, whatever is
  // conditional. `cond && <Reveal delay={stepDelay()}>` short-circuits, so a
  // section that is not there does not consume a step. Reset every render, so
  // it is a pure function of this pass.
  //
  // AND IT STOPS, RATHER THAN FLATTENING OUT.
  //
  // It was `Math.min(step++, 5) * 0.05`, which does not cap the ladder so much
  // as make every section past the fifth carry a permanent 250ms delay. That is
  // exactly backwards from what the comment above it promised ("sections
  // further down pass 0"): the sections a reader SCROLLS to are the ones that
  // must start the instant they are asked to, because scrolling has already
  // separated them in time and a quarter of a second of nothing on top of a
  // 720ms transition is the pause Ethan saw before Daily puzzles and the map.
  //
  // So the head start applies to the handful of sections that share the first
  // frame, and everything after it is zero.
  const LADDER_STEPS = 4
  let step = 0
  const stepDelay = () => {
    const i = step++
    return i < LADDER_STEPS ? i * 0.05 : 0
  }

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
        {/* A SKELETON WHILE WE DO NOT KNOW, NOT AN ANSWER.
            THE BUG THIS FIXES: `myLive` is derived from data that arrives after
            the first paint, so this card confidently drew "nothing running in
            your markets right now" - plane and all - and then, mid-animation,
            replaced it with two live challenges. Everything below it moved. That
            is the jitter Ethan saw after the page had settled, and it was not
            the animation at all: it was the page changing its mind in public.
            An empty state is a claim, and a claim needs the data first. */}
        {!d ? (
          <div className="space-y-2"><Skeleton className="h-16 w-full" /></div>
        ) : myLive.length === 0 ? (
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
        title="Explore the community"
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

      {/* WHAT IS NOT IN THIS RAIL ANY MORE, AND WHY.
          "Running the platform" and "Worldwide rooms" both lived here, and both
          were a second door to a place that already has one in the top nav:
          Admin is a button in the header, Rooms is a tab. A rail card that
          duplicates a tab is not a shortcut, it is a longer column with the same
          destinations in it twice - and the rail is the thing that has to stay
          short enough to read at a glance. */}
    </>
  )

  return (
    <NetworkMotion>
      {/* `ready` gates the RAIL on the same data the article waits for, so the
          two columns run their entrance on the same frame. Without it the rail
          animated on the first paint and the left-hand column only once the
          query landed - the reported "the bigger cards on the left are
          delayed". */}
      <NetworkLayout rail={rail} ready={!!d}>
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
            picked and there should only be one.

            THE LADDER OF `delay` VALUES IS DELIBERATELY SHALLOW NOW. It used to
            run 0.10, 0.16, 0.22, 0.28, 0.36, 0.44 - so the sixth card on the
            left did not begin to move until nearly half a second after the
            page arrived, by which time the whole right-hand rail had finished.
            That is the reported "the cards on the right appear nicely but the
            bigger ones on the left are delayed". A head start exists to stop
            everything above the fold firing on one frame; 50ms per section does
            that, and 440ms is not a head start, it is a wait. */}
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
          <Reveal from="down" delay={stepDelay()} className="-mb-3">
            <section>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                Hey {profile?.name?.split(' ')[0]}
              </h1>
              <p className="mt-1.5 text-sm text-smoke sm:text-base">
                Here is what is happening across the network right now.
              </p>
            </section>
          </Reveal>

          {/* NOTHING BELOW THE GREETING RENDERS UNTIL THE DATA IS IN.
              THE BUG THIS FIXES: five of the sections here are conditional on
              the load (`myLive`, `globalLive`, standings, the announcement, the
              trips), so the page first drew the ones that need nothing, and then
              the query landed and INSERTED four more into the middle of it.
              Everything below jumped down a screen and re-animated - the
              reported "the order isn't right, and then it corrects itself after
              a split second". You cannot stagger your way out of that; the only
              fix is to not draw a list you are about to reorder. The greeting
              stays instant because it depends on nothing. */}
          {!d ? (
            <div className="space-y-9" aria-hidden>
              <Skeleton className="h-32" />
              <Skeleton className="h-56" />
              <Skeleton className="h-40" />
            </div>
          ) : (
          <>

          {/* ---------- Live now (phones only) ----------
              On desktop this is the top card of the rail, which is always in
              view. On a phone the rail is at the BOTTOM of a very long page, so
              the one thing on the whole hub a creator can act on today - the
              brief that is running and closing - was six screens below the fold
              and under a map. It leads on mobile instead. */}
          {/* `isMobile` and not `lg:hidden`: a section hidden by CSS still
              renders, and a section that renders still takes its step off the
              ladder - which is how the desktop sequence grew the gaps it had
              before. Ask the breakpoint, do not paint over it. */}
          {isMobile && myLive.length > 0 && (
            <Reveal from="down" delay={stepDelay()}>
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

          {/* THE QUICK-ACTION GRID MOVED INTO THE AVATAR MENU.
              It existed because the rail is at the bottom of a long page on a
              phone, so the ten network destinations were a full scroll away. A
              grid here fixed that and created a smaller problem: a block of
              navigation sitting in the middle of a content page, on the hub
              only. The same ten links now live behind your own avatar, one
              thumb-reach from EVERY page. See AppLayout. */}

          {/* THE PROFILE PROGRESS CARD IS GONE (20 Aug 2026). "Your profile is
              33% there" is a nag that only makes sense when a creator arrived
              with an empty profile, and the onboarding flow being built now
              collects all of it up front - so by the time anybody reaches this
              hub the bar would read 100% and the card would never render. It
              was removed rather than left to rot. ProfileProgress.jsx is still
              in the tree unused; delete it once onboarding ships. */}

          {/* ---------- Welcome ---------- */}
          {/* No `initial/animate` of its own any more. It had a mount tween
              while everything around it had a scroll trigger, so the one card
              that is always above the fold was also the one card that animated
              on a different clock. The Reveal owns it now, like every other
              section. */}
          <Reveal from="down" delay={stepDelay()}>
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
              {/* ONE LINE, AND THEN STRAIGHT TO THE NUMBERS.
                  NOT "Welcome to…". This card is on the hub you land on every
                  day, and being welcomed to a place you have been a member of
                  for six months reads as the app not knowing who you are.
                  A title states what the place is.

                  The paragraph that used to sit under it - "One community
                  across every market. Your connections, messages, the map and
                  the daily game live here and are never split by country" - was
                  an explanation for somebody's first week, occupying prime
                  space on a page a returning creator opens daily. Ethan cut it,
                  and the type stepped down a size so the title itself holds one
                  line instead of two. What it bought is the row below. */}
              {/* `sm:whitespace-nowrap`, not `whitespace-nowrap`. Thirty-four
                  characters cannot hold one line inside a 375px card at any
                  size a heading is allowed to be, and forcing it there would
                  push the text out of the card rather than wrap it. From `sm`
                  up there is room, so that is where the promise is made. */}
              <h2 className="mt-4 text-lg font-bold leading-tight sm:whitespace-nowrap sm:text-2xl lg:text-3xl">
                Tryp.com Content Creator Community
              </h2>

              {/* WHAT THE COMMUNITY HAS DONE.
                  Counting up, once, when the card is first seen. A number that
                  moves reads as a quantity that grows, which is the one thing
                  this row is trying to say.

                  "Nations" used to be here and was removed: it counted distinct
                  `country_code` values on active profiles, a column only
                  onboarding ever fills, so for most of the roster it was null
                  and the card said "0 Nations" beside two real numbers. The
                  countries figure here is a different thing and an honest one -
                  every country anybody in the community has actually BEEN to,
                  off `countries_visited`, which is the same set the creator map
                  colours in. */}
              {/* THE FOUR COUNTERS START ON ONE FRAME AND FINISH ON ONE FRAME.
                  Two halves to that, and the row needs both.

                  CountUp now runs on a fixed clock rather than one derived from
                  the magnitude (see Motion.jsx), so the rate varies and the
                  duration does not: kilometres blur, creators tick, markets
                  climb one at a time, and all four land together.

                  But a shared duration only lands together if the counters also
                  BEGIN together, and these four numbers arrive from four
                  different places - `creators` with the page's own load,
                  `videos` with the "me" query, kilometres with
                  `community_flight_totals()`, and the market count from props
                  that are there immediately. Whichever landed first started
                  counting first and finished first, which is the same staggered
                  row by another route. So the row waits for all four and then
                  mounts every counter on the same frame. Until then it draws
                  em-dashes, which is what it drew before for each figure
                  individually and makes no claim in the meantime. */}
              <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:mt-7 sm:flex sm:flex-wrap sm:items-start sm:gap-x-10">
                {[
                  { n: d?.creators, label: 'Creators worldwide', hint: 'across every market' },
                  { n: openMarkets.length, label: 'Markets open', hint: 'and more on the way' },
                  { n: me?.videos, label: 'Videos posted', hint: 'to challenges so far' },
                  // KILOMETRES FLOWN, NOT COUNTRIES REACHED.
                  //
                  // "Countries reached" counted distinct entries in
                  // `countries_visited` across every profile, which made it a
                  // number that barely moves: it is capped at about 195, most of
                  // the interesting ones were reached years ago, and a creator
                  // coming back from Peru changed it by nothing. A statistic
                  // nobody's own effort can move is decoration.
                  //
                  // Distance flown is the opposite. It only goes up, everybody
                  // adds to it every time they log a trip, and it is the single
                  // most on-brand figure a travel creator community has. It
                  // comes from `community_flight_totals()` - see migration 100
                  // for why an aggregate over private rows is safe and how anon
                  // is kept off it.
                  { n: flights?.km ?? null, label: 'Kilometres flown', hint: 'logged by all of us' },
                ].map((s, _i, all) => (
                  <div key={s.label}>
                    <p className="text-2xl font-bold sm:text-3xl">
                      {all.some((x) => x.n == null)
                        ? '—'
                        : <CountUp value={s.n} format={(v) => Math.round(v).toLocaleString('en-GB')} />}
                    </p>
                    <p className="text-[11px] font-medium uppercase tracking-widest text-white/70 sm:text-xs">{s.label}</p>
                    <p className="mt-0.5 hidden text-[11px] text-white/55 lg:block">{s.hint}</p>
                  </div>
                ))}
              </div>

              {/* AND THEN THE SAME QUESTION ABOUT YOU.
                  A number about the community is social proof; a number about
                  your own week is the one that decides whether you open the app
                  tomorrow. Each is a LINK to the place you would go to change
                  it, because a statistic you cannot act on is a decoration.

                  Points only appear once you are on the board. "0 points, rank
                  —" tells a new creator they are losing a game they have not
                  been told the rules of; "Earn your first points" is the same
                  fact as an invitation. */}
              {/* THE CHIPS RESERVE THE PLANE'S CORNER.
                  `TrypPlane variant="hero"` is absolutely positioned in the
                  bottom-right of this card, so a wrapping row of chips runs
                  underneath it - the same trap LiveChallengeCard hit, where the
                  fix was to reserve the space on the ONE element that needs it
                  rather than padding the whole column. The divider still spans
                  the full width; only the chips stop short. */}
              {/* TWO CHIPS, AND NO HEADING OVER THEM.
                  There were five, under "Your year so far", then three, and now
                  two: your connections and your videos. Every cut has removed
                  the same kind of thing. "Earn your first points", "Post where
                  you are headed" and now "Play today's puzzles" were PROMPTS,
                  not facts about you, and a prompt sitting in a row of your own
                  numbers turns a summary into a to-do list. The puzzles have
                  their own section further down this very page, with all three
                  of them and today's counts on it, so the chip was also a
                  second door to something already on screen.
                  What is left is two figures about you, both of which are also
                  doors to the place you would go to change them. */}
              {/* NO RULE ACROSS THIS CARD.
                  There was a `border-t` here, spanning the full width of the
                  card - and the plane is parked in the bottom-right corner, so
                  the line ran straight through the aircraft and out the other
                  side. Ethan: "you added a line that is appearing over the
                  tryp.com plane, get rid of the line." Shortening the rule to
                  the width of the chips would only have made it a line that
                  stops for no visible reason. The chips are a row of pills on a
                  coloured card; they do not need a rule to be separated from
                  the figures above, only air. */}
              {/* AND THE CHIPS KEEP WELL CLEAR OF THE PLANE. The hero plane's
                  box is 23rem (25rem at xl) and its nose reaches about a tenth
                  of the way in from the left of that box, so the row stops
                  ~21.5rem short of the right edge and nothing can wrap under a
                  wing. They are a size down from the figures above too, which
                  is what they are: doors, not statistics. */}
              <div className="mt-6 sm:mt-7">
                <div className="flex flex-wrap gap-2 lg:max-w-[calc(100%-21.5rem)] xl:max-w-[calc(100%-23.5rem)]">
                  <MineChip to="/connections" icon="users"
                    value={me ? me.connections : null}
                    label={me?.connections === 1 ? 'connection' : 'connections'} />
                  <MineChip to="/challenges" icon="video"
                    value={me ? me.myVideos : null}
                    label={me?.myVideos === 1 ? 'video posted' : 'videos posted'} />
                </div>
              </div>
            </div>
          </section>
          </Reveal>

          {/* ---------- Global challenge ---------- */}
          {/* Above the markets on purpose. A global challenge is the one thing
              on this page that everybody reading it can act on right now, and
              burying it under a list of places would be exactly backwards. */}
          {globalLive && (
            <Reveal from="down" delay={stepDelay()}>
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
          <Reveal from="down" delay={stepDelay()}>
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
            <Reveal from="down" delay={stepDelay()}>
              <section>
                <SectionHead icon="trophy" title="Explore the community"
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
            <Reveal from="down" delay={stepDelay()}>
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

          {/* ---------- Daily puzzles ----------
              Between the announcement and the map, exactly where Ethan asked
              for it: after the thing the team wants you to read, before the
              thing you came to browse. All three, each ticking green on its
              own, each saying how many creators have played it today. It is the
              only habit loop on the whole hub. */}
          <Reveal from="down" delay={stepDelay()}>
            <DailyPuzzleCallout />
          </Reveal>

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
          <Reveal from="down" delay={stepDelay()}>
            <section>
              <SectionHead icon="globe" title="Everyone, right now"
                hint="Tap a pin for who is there, or tap a country to find who has been."
                to="/creators" toLabel="Creator Network" />
              {/* The map is the most expensive thing on this page - a megabyte
                  of TopoJSON, parsed, then a few hundred SVG paths - and doing
                  that work while the cards above are still sliding is what made
                  the page hitch a second after it appeared. It waits until it
                  is nearly on screen; the skeleton holds its height so nothing
                  jumps when it arrives. */}
              {/* A FULL SCREEN OF LEAD TIME, not 400px.
                  The default margin was close enough to Reveal's own trigger
                  that the atlas was being parsed on the same frames as this
                  section's entrance transition - so the section arrived, and
                  then stuttered. A thousand pixels puts the parse a whole
                  screen ahead of the reader, which is far enough that the work
                  is finished before the motion starts. */}
              <WhenVisible rootMargin="1000px" fallback={<MapSkeleton />}>
                {d
                  ? <CreatorMap creators={d.mapPeople} trips={d.mapTrips} myId={session?.user?.id} />
                  : <MapSkeleton />}
              </WhenVisible>
            </section>
          </Reveal>

          {/* ---------- Creators on the move ---------- */}
          {d?.trips?.length > 0 && (
            <Reveal from="down" delay={stepDelay()}>
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

          {/* ---------- Community board ----------
              Directly under "Creators on the move", which is the last place on
              the hub where the reader is still thinking about other people -
              and the board is entirely a thing other people do for you. */}
          <Reveal from="down" delay={stepDelay()}>
            <BoardCard />
          </Reveal>

          {/* ---------- Who to meet this week ----------
              Above the spotlight: one is three people picked for you, the other
              is one person the whole community sees today, and the personal one
              has to lead. */}
          <Reveal from="down" delay={stepDelay()}><WhoToMeet /></Reveal>

          {/* ---------- Spotlight ---------- */}
          <Reveal from="down" delay={stepDelay()}><CreatorSpotlight /></Reveal>

          {/* ---------- New creators ---------- */}
          {d?.fresh?.length > 0 && (
            <Reveal from="down" delay={stepDelay()}>
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
          </>
          )}
        </div>
      </NetworkLayout>
    </NetworkMotion>
  )
}
