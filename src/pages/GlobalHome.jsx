import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCommunity } from '../context/CommunityContext'
import NetworkLayout, { RailCard, flagFromIso } from '../components/network/NetworkLayout'
import LiveNowRow from '../components/network/LiveNowRow'
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
import { ANNOUNCEMENT_LIMIT, ANNOUNCEMENT_MAX_AGE_DAYS, recentAnnouncements } from '../lib/announcements'
import { cx, timeAgo } from '../lib/utils'
import { useIsMobile } from '../lib/useKeyboardInset'
import { cardHover } from '../lib/motion'
import { NETWORK_LINKS, loadLinkOrder as loadOrder, ORDER_KEY } from '../lib/networkLinks'
import { marketName } from '../lib/markets'
import Reveal from '../components/network/Reveal'
import { useT } from '../lib/i18n'
import { testFlags } from '../lib/testData'

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
  const tr = useT()
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
        {live && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" title={tr("Challenge running")} />}
      </Link>
      <span {...handleProps} title={tr("Drag to reorder")} className={GRIP_CLASS}>
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
  const tr = useT()
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
          {/* THROUGH `tr`, BECAUSE THE LIST IS A TABLE. Ethan: "on the global
              page where it says Creator Network, Connections etc, it's all
              still in English, and the descriptions are in English." Every one
              of these sentences IS in the Spanish dictionary - they were being
              printed straight off `NETWORK_LINKS` instead of being looked up,
              which is the one thing the i18n report cannot see (it scans for
              `tr('literal')`, and `tr(link.label)` is a variable). */}
          <span className="block truncate text-sm font-medium">{tr(link.label)}</span>
          <span className="block truncate text-[11px] text-smoke">{tr(link.hint)}</span>
        </span>
        {count > 0 && (
          <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
        {isNew && (
          <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase text-white">{tr("New")}</span>
        )}
      </Link>
      <span {...handleProps} title={tr("Drag to reorder")} className={GRIP_CLASS}>
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
  const tr = useT()
  const { profile, session } = useAuth()
  const { network, chapters, myChapters, error } = useCommunity()
  const [d, setD] = useState(null)
  const [order, setOrder] = useState(loadOrder)
  const [marketOrder, setMarketOrder] = useState(loadMarketOrder)
  const isMobile = useIsMobile()
  // ONE CLOCK READING PER MOUNT, for the live challenge card's countdown.
  // `react-hooks/purity` bans a clock read during render, and rightly: a
  // countdown that recomputes on every unrelated re-render is a component that
  // cannot be reasoned about. A day boundary crossed while somebody stares at
  // the hub is not worth a timer.
  const [nowMs] = useState(() => Date.now())
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
        { count: connCount }, { data: latestRes },
        { data: mapPeople }, { data: mapTrips },
      ] = await Promise.all([
        supabase.from('community_members')
          .select('community_id, profiles!inner(is_admin, is_test, status)')
          .eq('status', 'active')
          .eq('profiles.is_admin', false).in('profiles.is_test', testFlags()).eq('profiles.status', 'active'),
        supabase.from('profiles').select('id', { count: 'exact', head: true })
          .eq('status', 'active').eq('is_admin', false).in('is_test', testFlags()),
        supabase.from('challenges').select('id, title, community_id, status, end_date, scoring').eq('status', 'active'),
        // ANNOUNCEMENTS FROM EVERY ROOM THIS CREATOR CAN READ, not just the
        // worldwide one. Somebody in the UK and Spain had no way to see either
        // market's announcements from the hub, which is what a hub is for.
        // No market filter is needed or wanted: migration 149's RLS already
        // decides which announcement rooms are readable, so asking for all of
        // them returns exactly the right set. Fetch a window wider than the
        // cutoff and let recentAnnouncements() do the trimming, so the rule
        // lives in one tested place.
        // A MARKET'S ANNOUNCEMENT ROOM IS NAMESPACED, AND THAT IS WHY THIS
        // ONLY EVER SHOWED WORLDWIDE.
        //
        // THE BUG THIS FIXES. The filter was `.eq('channel', 'announcements')`,
        // an exact match - but a market room's key carries its market:
        // `germany:announcements`, `nordics:announcements`. Only the worldwide
        // room uses the bare word. So the query that was written to gather
        // "every room this creator can read" could structurally never return a
        // market's announcement, and the hub showed the same worldwide post to
        // everybody. Ethan: "I posted a test announcement in [other markets]
        // but it's not showing up here." Both of those test posts are in the
        // table; nothing ever asked for them.
        supabase.from('messages')
          .select('*, profiles:sender_id(name, photo_url)')
          .or('channel.eq.announcements,channel.like.*:announcements')
          .eq('deleted', false)
          .gte('created_at', new Date(Date.now() - ANNOUNCEMENT_MAX_AGE_DAYS * 86400000).toISOString())
          .order('created_at', { ascending: false }).limit(40),
        supabase.from('collab_posts')
          .select('id, city, country, start_date, end_date, profiles:creator_id(name, photo_url)')
          .gte('end_date', today).order('start_date', { ascending: true }).limit(6),
        // Six, not four. Four left a hole at the end of a three-across grid and
        // read as "we only have four", which is the opposite of the point.
        supabase.from('profiles').select('id, name, photo_url, bio, country_code')
          .eq('status', 'active').eq('is_admin', false).in('is_test', testFlags())
          .is('deletion_requested_at', null).order('created_at', { ascending: false }).limit(6),
        supabase.from('profiles').select('countries_visited'),
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
          .eq('status', 'active').in('is_test', testFlags()).is('deletion_requested_at', null),
        supabase.from('collab_posts').select('creator_id, city, country, city_lat, city_lng, start_date, end_date')
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
            .eq('profiles.is_admin', false).in('profiles.is_test', testFlags()).eq('profiles.status', 'active'),
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
        counts: tally, creators, live, anns: recentAnnouncements(ann, { now: Date.now(), limit: ANNOUNCEMENT_LIMIT }), trips: trips || [], fresh: fresh || [],
        visited: [...new Set((visited || []).flatMap((p) => p.countries_visited || []))],
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
      // Connections are DIRECTIONAL rows, so being connected to somebody is a
      // row in one direction or the other. Counting only `creator_id = me`
      // would show roughly half of anybody's real network.
      supabase.from('connections').select('id', { count: 'exact', head: true })
        .eq('status', 'accepted').or(`creator_id.eq.${uid},connected_creator_id.eq.${uid}`),
    ]).then(([{ count: videos }, { count: myVideos }, { count: myConns }]) => {
      if (cancelled) return
      // POINTS AND RANK ARE NO LONGER READ HERE. Nothing on this page renders
      // them - the chips were cut to connections and videos a while back - and
      // the board they came from was retired with the points leaderboard. See
      // the note where that section used to be.
      setMe({
        videos: videos ?? 0,
        myVideos: myVideos ?? 0,
        connections: myConns ?? 0,
      })
    })
    return () => { cancelled = true }
  }, [session?.user?.id])

  if (error) {
    return (
      <NetworkLayout>
        <EmptyState icon={<Icon name="alert" className="h-6 w-6" />}
          title={tr("The network tables are not readable yet")} hint={error} />
      </NetworkLayout>
    )
  }

  // Ordering only: the first market you joined sorts first. There is no
  // "home market" setting any more - see MarketHeader.
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
          network", "Your markets" is the rail's own market list, and the rooms are
          a tab in the nav. Rendering them anyway added roughly 1,200px of
          duplicate navigation to the bottom of an already long page - which is
          most of what "there is too much scrolling" was. */}
      <RailCard className="hidden lg:block" icon={<Icon name="flag" className="h-3.5 w-3.5 text-brand" />} title={tr("Live now")}>
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
              {tr("Nothing running in your markets right now. The next brief lands here.")}
            </p>
          </div>
        ) : (
          // THE PHONE'S CARD, ON THE DESKTOP, FROM ONE FILE.
          // Ethan: "on mobile I really like how you made the live challenge
          // card - could you please use that same design for desktop, and the
          // live challenge card be like that in the top right." This rail IS
          // the top right, and it was drawing its own flatter version of the
          // same row. See components/network/LiveNowRow.
          <div className="space-y-2">
            {myLive.map(({ market, challenge, global: isGlobal }) => (
              <LiveNowRow key={challenge.id} challenge={challenge} market={market} global={isGlobal} now={nowMs} />
            ))}
          </div>
        )}
      </RailCard>

      {/* ---------- Your places ---------- */}
      <RailCard
        className="hidden lg:block"
        icon={<Icon name="globe" className="h-3.5 w-3.5 text-brand" />}
        // "Your places" was the name from before markets had a name. The
        // switcher, the command palette and the hub's own removed section all
        // said "markets"; only this one said "places".
        title={tr("Your markets")}
        action={
          <Link to="/global/markets" className="text-[11px] font-medium text-brand transition-transform duration-200 hover:scale-105">
            {tr("Explore")}
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
            {tr("You have not joined a market yet. Find yours →")}
          </Link>
        )}
      </RailCard>

      {/* ---------- The people layer, in your order ---------- */}
      <RailCard
        className="hidden lg:block"
        icon={<Icon name="users" className="h-3.5 w-3.5 text-brand" />}
        title={tr("Explore the community")}
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
          {/* IT WAITS FOR THE DATA TOO, and that is what finally fixed the
              timing. The greeting depends on nothing, so it used to render on
              the first paint and reveal itself about 80ms later - while every
              section under it was still behind `!d`, waiting on the network,
              and only started animating once the query landed. So the greeting
              was not arriving early by a frame or two; it was arriving a whole
              round trip before anything else, which is the "hey Ethan appears
              in immediately, whereas the other things smoothly animate in"
              report. Adding delay to the greeting alone could never close a gap
              whose size is the latency of a query.
              It joins the same gate as the rest, and the ladder then does what
              it was written to do: greeting, then the first sections, 50ms
              apart, all off one moment. */}
          {d && (
          <Reveal from="down" delay={stepDelay()} className="-mb-3">
            <section>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                Hey {profile?.name?.split(' ')[0]}
              </h1>
              {/* ONE LINE ON A PHONE.
                  "Here is what is happening across the network right now" is
                  53 characters; at 14px inside a 343px column it wraps to two
                  lines every time, which is a two-line subtitle under a name
                  before any content has been reached. There is no type size
                  that fixes that, so the phone gets the shorter sentence and
                  the full one returns at `sm`, where it fits. */}
              <p className="mt-1.5 text-sm text-smoke sm:text-base">
                <span className="sm:hidden">{tr("Here is what is happening right now.")}</span>
                <span className="hidden sm:inline">{tr("Here is what is happening across the network right now.")}</span>
              </p>
            </section>
          </Reveal>
          )}

          {/* NOTHING BELOW THE GREETING RENDERS UNTIL THE DATA IS IN.
              THE BUG THIS FIXES: five of the sections here are conditional on
              the load (`myLive`, `globalLive`, standings, the announcement, the
              trips), so the page first drew the ones that need nothing, and then
              the query landed and INSERTED four more into the middle of it.
              Everything below jumped down a screen and re-animated - the
              reported "the order isn't right, and then it corrects itself after
              a split second". You cannot stagger your way out of that; the only
              fix is to not draw a list you are about to reorder. The greeting
              is inside the gate too now - see the note above it. */}
          {!d ? (
            <div className="space-y-9" aria-hidden>
              {/* The first one is the greeting's own line, so the page does not
                  reflow when the name arrives. */}
              <Skeleton className="h-10 w-56" />
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
                {/* SOLID, AND SHORTER BY A THIRD.
                    It was a pale tint panel with a hairline orange border, a
                    title, and a full-size pill button on a line of its own -
                    about 190px of the first screen for two facts. Ethan: "I
                    don't like the current design of it, the light coloured
                    thing... improve the UI and even make it slightly smaller."
                    The one card on this page you can act on today should not be
                    the faintest thing on it, so it is the brand colour outright.
                    The button becomes a chevron - the whole card is the link and
                    always was - and the space that buys goes to the fact the old
                    card was missing entirely: WHEN IT CLOSES. */}
                <div className="space-y-2">
                  {myLive.map(({ market, challenge, global: isGlobal }) => (
                    <LiveNowRow key={challenge.id} challenge={challenge} market={market} global={isGlobal} now={nowMs} />
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
          {/* DESKTOP ONLY (31 Aug 2026).
              On a phone this card is the whole first screen - four counters,
              two chips and a hero plane - and every one of those figures is
              about the community rather than about today. A creator opening the
              hub on a phone wants the brief that is running, not the roster
              size, so the live challenge above leads and this drops out
              entirely. It keeps its place from `lg` up, where it sits beside a
              rail and costs nothing.

              `!isMobile`, not `hidden lg:block`, for the reason the live-now
              block gives above: a CSS-hidden section still renders and still
              takes its step off the `stepDelay()` ladder, which would leave a
              720ms hole in the phone's reveal sequence where this used to be. */}
          {!isMobile && (
          <Reveal from="down" delay={stepDelay()}>
          <section
            className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:p-10"
          >
            <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-black/5 blur-2xl" />
            {/* A FEW PIXELS LOWER (2 Sep 2026). Ethan: "the Tryp.com animation
                on the main card at the top - move it down ever so slightly, a
                few pixels, because it's a little bit too close to the
                kilometres flown and 'logged by all of us'." The plane's box is
                `bottom-0` and the stats row runs under it, so the trail was
                landing on the caption. Nudged here rather than in TrypPlane:
                every other card that draws it has different content beneath. */}
            <TrypPlane variant="hero" id="welcome" className="translate-y-4" />
            <div className="relative">
              {/* NO "WORLDWIDE" PILL. Ethan: "I think it says worldwide on the
                  top of that card - we can remove that, it doesn't necessarily
                  need to say worldwide there." The tab you are on says it, the
                  place switcher directly above says it, and the heading under
                  this said it a third time. */}
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
              <h2 className="text-lg font-bold leading-tight sm:whitespace-nowrap sm:text-2xl lg:text-3xl">
                {tr("Tryp.com Content Creator Community")}
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
                  { n: d?.creators, label: tr('Creators worldwide'), hint: tr('across every market') },
                  { n: openMarkets.length, label: tr('Markets open'), hint: tr('and more on the way') },
                  { n: me?.videos, label: tr('Videos posted'), hint: tr('to challenges so far') },
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
                  { n: flights?.km ?? null, label: tr('Kilometres flown'), hint: tr('logged by all of us') },
                ].map((s, _i, all) => (
                  <div key={s.label}>
                    <p className="text-2xl font-bold sm:text-3xl">
                      {all.some((x) => x.n == null)
                        ? '—'
                        : <CountUp value={s.n} format={(v) => Math.round(v).toLocaleString('en-GB')} />}
                    </p>
                    {/* THE LABEL SHRINKS, THE CARD DOES NOT (2 Sep 2026).
                        Ethan: "on the worldwide page you seem to have
                        rearranged the way that card looks, you made it bigger,
                        and I don't like that. Put everything back to the way it
                        looks on the English page, but make sure everything
                        still fits - you can make stuff slightly smaller if you
                        need, rather than bigger."
                        "Kilometres flown" is "Kilómetros recorridos" and
                        "Creators worldwide" is "Creadores en todo el mundo", so
                        at the English type size the four statistics wrapped
                        into a second line and the card grew to hold it. The
                        type steps down instead, and `tracking-wide` rather than
                        `tracking-widest` gives back another few characters -
                        which is the trade he asked for: same layout, smaller
                        words. */}
                    <p className="text-[10px] font-medium uppercase tracking-wide text-white/70 sm:text-[11px] lg:text-xs lg:tracking-widest">{s.label}</p>
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
                    label={me?.connections === 1 ? tr('connection') : tr('connections')} />
                  <MineChip to="/challenges" icon="video"
                    value={me ? me.myVideos : null}
                    label={me?.myVideos === 1 ? tr('video posted') : tr('videos posted')} />
                </div>
              </div>
            </div>
          </section>
          </Reveal>
          )}

          {/* ---------- Global challenge ---------- */}
          {/* Above the markets on purpose. A global challenge is the one thing
              on this page that everybody reading it can act on right now, and
              burying it under a list of places would be exactly backwards. */}
          {globalLive && (
            <Reveal from="down" delay={stepDelay()}>
              <section>
                <SectionHead icon="globe" title={tr("Open to everyone")}
                  hint={tr("A global brief. Enter from any market, anywhere in the world.")} />
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

          {/* ---------- Markets: NOT HERE ANY MORE ----------
              It was a two-column grid of market cards, desktop only, saying
              exactly what the rail on the right of the same page already says.
              Ethan: "for desktop, I noticed that we don't need the Your Market
              section on the Worldwide page any more, because we already have
              Your Places on the right sidebar - which I would rename as Your
              Markets. I would then get rid of the big section on the Worldwide
              page, because that gives more space for the other stuff."
              He is right that it was the same list twice. The rail is the
              better of the two: it is always in view, it reorders, and it
              shows which market has something running. On a PHONE the section
              was already suppressed (the switcher bar at the top is the market
              surface there), so this removes the last copy rather than the
              only one - `MarketCard` and `openMarkets` go with it. */}

          {/* ---------- Network standings ---------- */}
          {/* Reveal, not a stagger: these sections are below the fold, and a
              list that already animated in before you scrolled to it has spent
              its motion on nobody. */}
          {/* Points are earned inside a market but they add up across the whole
              network, so this is the one leaderboard that belongs at network
              level. A creator who moves from Spain to the UK keeps their
              standing here. */}
          {/* THE POINTS BOARD IS GONE FROM HERE.
              It said "Points earned in any market, added up" and ranked the
              whole network on them - but points are a per-CHALLENGE scoring
              mode. A brief can be scored by total views, by best video, or by
              points, and only the last writes any. So this was the running
              score of whichever challenges happened to use that mode,
              presented as a standing in the community: a creator who had never
              entered one was simply absent, through no fault of their own, and
              nothing on the page explained the number.
              Views is the thing every creator has under every scoring mode, so
              the board that survives is /leaderboard - worldwide, filterable by
              market, with everybody on it. */}

          {/* ---------- Latest announcements ---------- */}
          {/* One card per room the creator can read, newest first, nothing
              older than fifteen days - see lib/announcements. The card says
              WHICH market it came from, because "Latest announcements" over an
              unlabelled stack of three is three announcements from nowhere. */}
          {d?.anns?.length > 0 && (
            <Reveal from="down" delay={stepDelay()}>
              <section>
                <SectionHead
                  icon="megaphone"
                  title={d.anns.length === 1 ? tr('Latest announcement') : tr('Latest announcements')}
                  to="/global/chat/announcements"
                  toLabel={tr('All announcements')}
                />
                {/* ONE ANNOUNCEMENT GETS THE WHOLE WIDTH.
                    `sm:grid-cols-2` unconditionally meant a creator in a single
                    market - which is most creators - got one card sitting in
                    the left-hand column with an empty column beside it. Ethan:
                    "the current one is showing on the left hand side... if
                    they're in one market it should show up just the normal
                    announcement going the full way across." The columns follow
                    the count, and the count is capped at two. */}
                <Reveal
                  className={cx('grid gap-3', d.anns.length > 1 && 'sm:grid-cols-2')}
                  stagger={0.07}
                >
                  {d.anns.map((a) => {
                    // The worldwide room carries a real community_id (every
                    // announcement on the live site today is in it), so it has
                    // to be recognised by id rather than by a null - otherwise
                    // it gets hunted for in the market list, is not found, and
                    // falls through to the same label by luck rather than
                    // design. `chapters`, not `openMarkets`, for the rest: an
                    // announcement can come from a market that is paused, and
                    // calling that one "Worldwide" would be a lie.
                    const from = a.community_id && a.community_id !== network?.id
                      ? (chapters.find((m) => m.id === a.community_id) || null)
                      : null
                    return (
                      <Link
                        key={a.id}
                        to={from ? `/c/${from.slug}/chat/announcements` : '/global/chat/announcements'}
                        // `h-full` + a column, so two cards side by side are
                        // the same height whatever is in them. The grid already
                        // stretches its items; the card was `block`, so it
                        // ignored that and sized to its own text - one card
                        // three lines tall beside one card one line tall.
                        // Ethan: "on desktop those cards should be the same size
                        // even if just one message is bigger."
                        className="card flex h-full flex-col border-l-4 !border-l-brand transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar src={a.profiles?.photo_url} name={a.profiles?.name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{a.profiles?.name}</p>
                            <p className="text-xs text-smoke">
                              {marketName(from ? from.name : network?.name || 'Worldwide')} · {timeAgo(a.created_at)}
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 line-clamp-3 text-sm text-ink">{stripMarkup(a.body)}</p>
                      </Link>
                    )
                  })}
                </Reveal>
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
              {/* The hint is desktop-only. On a phone it is two lines of
                  instructions above a map whose pins and countries are
                  obviously tappable, on the page where vertical space is
                  scarcest. Full screen still carries its own affordances. */}
              <SectionHead icon="globe" title={tr("Everyone, right now")}
                to="/creators" toLabel={tr('Creator Network')} />
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
                <SectionHead icon="pin" title={tr("Creators on the move")} to="/collab" toLabel={tr('Collab board')} />
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
                <SectionHead icon="users" title={tr("New in the community")} to="/creators" toLabel={tr('All creators')} />
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
