import { useEffect, useMemo, useState } from 'react'
import NewInRooms from '../components/network/NewInRooms'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { motion } from 'motion/react'
import { useAuth } from '../context/AuthContext'
import { useCommunity } from '../context/CommunityContext'
import NetworkLayout, { RailCard, flagFromIso } from '../components/network/NetworkLayout'
import { IdeasTeaser } from '../components/VideoIdeas'
import VipHomeCard, { VipRailCard } from '../components/vip/VipHomeCard'
import { useVipOverview } from '../lib/vip'
import MarketsRailCard from '../components/network/MarketsRailCard'
import { JoinMarketCard } from '../components/network/JoinMarket'
import LiveNowRow from '../components/network/LiveNowRow'
import NetworkMotion from '../components/NetworkMotion'
import TrypPlane from '../components/network/TrypPlane'
import GlobalChallengeStrip, { prefetchTopThree } from '../components/network/GlobalChallengeStrip'
import SectionTitle from '../components/network/SectionTitle'
import { CountUp } from '../components/network/Motion'
import Reorderable from '../components/network/Reorderable'
import CreatorMap from '../components/CreatorMap'
import WhenVisible from '../components/WhenVisible'
import MapSkeleton from '../components/network/MapSkeleton'
import CreatorSpotlight from '../components/CreatorSpotlight'
import WhoToMeet from '../components/WhoToMeet'
import DailyPuzzleCallout from '../components/games/DailyPuzzleCallout'
import BoardCard from '../components/network/BoardCard'
import Icon from '../components/Icon'
import { Avatar, EmptyState, Skeleton } from '../components/ui'
import PageSkeleton from '../components/PageSkeleton'
import { flagForCountry } from '../lib/flags'
import { stripMarkup } from '../lib/richText'
import { ANNOUNCEMENT_LIMIT, ANNOUNCEMENT_MAX_AGE_DAYS, recentAnnouncements } from '../lib/announcements'
import { cx, timeAgo } from '../lib/utils'
import { useIsMobile } from '../lib/useKeyboardInset'
import { cardHover } from '../lib/motion'
import { NETWORK_LINKS, loadLinkOrder as loadOrder, ORDER_KEY } from '../lib/networkLinks'
import { marketName } from '../lib/markets'
import Reveal from '../components/network/Reveal'
import GlowRing from '../components/network/GlowRing'
import { useT, usePlural } from '../lib/i18n'
import { testFlags } from '../lib/testData'
import { loadRoster } from '../lib/roster'
import { useCachedPage, writePageCache } from '../lib/pageCache'
import { challengesApi } from '../api/challenges'
import { moneyApi } from '../api/money'
import { convert } from '../lib/programme'
import { formatMoney, formatViews } from '../lib/utils'
import { submissionsApi } from '../api/submissions'
import { profilesApi } from '../api/profiles'
import { chatApi } from '../api/chat'
import { marketsApi } from '../api/markets'
import { flightsApi } from '../api/flights'

// See lib/pageCache: the hub is the tab a creator lands on and comes back to
// more than any other, and it was rebuilding itself from nothing every time.
const HUB_CACHE_KEY = 'global-hub'

// The Worldwide hub: a greeting, then what is happening, then where everyone is.
// Worldwide owns the PEOPLE (connections, DMs, map, collab board, directory, daily game, combined standings), never
// split by country. A market owns the WORK (challenges, briefs, rooms, its standings, its team).

const MotionLink = motion.create(Link)

// The section title is the link (components/network/SectionTitle).
function SectionHead({ icon, title, hint, to, toLabel }) {
  return (
    <div className="mb-4">
      <SectionTitle icon={icon} to={to} label={toLabel}>{title}</SectionTitle>
      {hint && <p className="mt-1 text-sm text-smoke">{hint}</p>}
    </div>
  )
}


// The people layer, as one block: the rail's own list, shared with the avatar
// menu via lib/networkLinks so the two can never drift apart.
function orderLinks(order) {
  if (!order.length) return NETWORK_LINKS
  const rank = new Map(order.map((to, i) => [to, i]))
  return [...NETWORK_LINKS].sort(
    (a, b) => (rank.has(a.to) ? rank.get(a.to) : 1e9) - (rank.has(b.to) ? rank.get(b.to) : 1e9),
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
          {/* THROUGH `tr`, BECAUSE THE LIST IS A TABLE. Every one of these sentences IS in the Spanish dictionary - they
              were being printed straight off `NETWORK_LINKS` instead of being looked up, which is the one thing the i18n
              report cannot see (it scans for `tr('literal')`, and `tr(link.label)` is a variable). */}
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

// One of your own numbers on the welcome card, as a link. Module scope (a component declared during render remounts
// every time). A null value shows a dash, not a zero.
function MineChip({ to, icon, value, label }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/25"
    >
      <Icon name={icon} className="h-3 w-3 shrink-0 text-white/80" />
      <span>
        <span className="font-bold tabular-nums">{(value ?? 0).toLocaleString('en-GB')}</span>
        {' '}<span className="text-white/80">{label}</span>
      </span>
    </Link>
  )
}

// YOUR HIGHLIGHTS, ON THE COMMUNITY CARD (19 Oct 2026). It carried two chips, "68 connections" and "0 videos posted",
// and the team wanted "something more useful" there between challenges. Three figures that are yours and that you can
// move: the views your challenge entries have earned, what you have won, and your best finish (which opens that
// challenge). A creator with nothing yet gets one door instead of three zeros. Frosted tiles on the orange card, kept
// clear of the plane's corner like the chips were.
function Highlights({ me, live = [] }) {
  const tr = useT()
  if (!me) return <div className="h-[4.25rem] lg:max-w-[calc(100%-21.5rem)] xl:max-w-[calc(100%-23.5rem)]" />
  const fresh = !me.viewsEarned && !me.wonEur && !me.best
  // NOTHING OF YOUR OWN YET (a new creator, or the team): what is worth having, not the community's week. Ethan: videos
  // posted this week, new creators this week and challenges running "are not that valuable to the creators", and not
  // every creator can enter every challenge. So: the biggest prize in a challenge YOU can enter, the Video of the Week
  // when one is running, and the hooks to start from.
  const week = fresh ? (() => {
    const money = (n, cur) => formatMoney(Math.round(n), cur || 'EUR')
    const firstPrize = (c) => Number(String(c.prize_structure?.[0]?.amount ?? '').replace(/[^\d.]/g, '')) || 0
    const best = [...live].sort((a, b) => firstPrize(b.challenge) - firstPrize(a.challenge))[0]?.challenge
    const weekly = live.find((x) => x.challenge.weekly_prize?.amount)?.challenge
    return [
      best && firstPrize(best) > 0
        ? { key: 'top', icon: 'trophy', to: `/challenges/${best.id}`, value: money(firstPrize(best), best.prize_currency), label: tr('first prize you can win'), sub: best.title }
        : { key: 'top', icon: 'trophy', to: '/challenges', value: tr('Challenges'), label: tr('see what you can win') },
      weekly
        ? { key: 'wk', icon: 'fire', to: `/challenges/${weekly.id}`, value: money(weekly.weekly_prize.amount, weekly.weekly_prize.currency), label: tr('Video of the Week, every week'), sub: weekly.title }
        : { key: 'wk', icon: 'joystick', to: '/game', value: tr('Play'), label: tr("today's travel puzzles") },
      { key: 'ideas', icon: 'bulb', to: '/ideas', value: tr('Ideas'), label: tr('hooks that worked for other creators') },
    ]
  })() : null
  if (fresh) return <HighlightTiles tiles={week} />
  const tiles = [
    { key: 'views', icon: 'eye', to: '/challenges', value: formatViews(me.viewsEarned), label: tr('views your videos earned') },
    { key: 'won', icon: 'trophy', to: '/rewards', value: formatMoney(me.wonEur, 'EUR'), label: tr('won in prizes') },
    me.best && {
      key: 'best',
      icon: 'flag',
      to: `/challenges/${me.best.id}?tab=leaderboard`,
      value: tr('#{n}', { n: me.best.rank }),
      label: tr('best finish'),
      sub: me.best.title,
    },
  ].filter(Boolean)
  return <HighlightTiles tiles={tiles} />
}

function HighlightTiles({ tiles }) {
  return (
    <div className="grid grid-cols-3 gap-2 lg:max-w-[calc(100%-21.5rem)] xl:max-w-[calc(100%-23.5rem)]">
      {tiles.map((t, i) => (
        <Link
          key={t.key}
          to={t.to}
          className="wipe-item group min-w-0 rounded-2xl bg-white/15 px-3.5 py-3 transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:bg-white/20"
          style={{ animationDelay: `${0.6 + i * 0.07}s` }}
          title={t.sub || undefined}
        >
          <span className="flex items-center gap-1.5">
            <Icon name={t.icon} className="h-4 w-4 shrink-0 text-white/80" />
            <span className="truncate text-xl font-bold tabular-nums text-white">{t.value}</span>
          </span>
          <span className="mt-0.5 block text-xs font-medium leading-snug text-white/80 line-clamp-2">{t.label}</span>
          {t.sub && <span className="mt-0.5 block truncate text-xs text-white/65">{t.sub}</span>}
        </Link>
      ))}
    </div>
  )
}

// The welcome card's last figures, kept for the next visit to the hub.
let lastFlights = null
let lastMe = null

export default function GlobalHome() {
  const tr = useT()
  const pl = usePlural()
  const { profile, session, isAdmin } = useAuth()
  // A VIP's own month (shared cache with the VIP page). The team is never a VIP here.
  const vipBand = !!profile?.is_vip && !isAdmin
  const { overview: vipOverview } = useVipOverview({ enabled: vipBand })
  const { network, chapters, myChapters, error } = useCommunity()
  // SECOND AND LATER VISITS TO THIS TAB DRAW THE HUB, NOT A SCREEN OF GREY.
  // The load below still runs on every visit; this only decides what is on
  // screen while it does. See lib/pageCache.
  const cachedHub = useCachedPage(HUB_CACHE_KEY)
  const [d, setD] = useState(cachedHub ?? null)
  const [order, setOrder] = useState(loadOrder)
  const isMobile = useIsMobile()
  // ONE CLOCK READING PER MOUNT, for the live challenge card's countdown.
  // `react-hooks/purity` bans a clock read during render, and rightly: a
  // countdown that recomputes on every unrelated re-render is a component that
  // cannot be reasoned about. A day boundary crossed while somebody stares at
  // the hub is not worth a timer.
  const [nowMs] = useState(() => Date.now())
  const links = useMemo(() => orderLinks(order), [order])

  function saveOrder(next) {
    const keys = next.map((l) => l.to)
    setOrder(keys)
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(keys)) } catch { /* private mode */ }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      const today = new Date().toISOString().slice(0, 10)
      const [
        { data: mems }, { count: creators }, { data: challenges },
        { data: ann }, { data: trips }, { data: fresh },
        { count: connCount },
        { data: mapPeople }, { data: mapTrips },
      ] = await Promise.all([
        marketsApi.communityMembers()
          .select('community_id, profiles!inner(is_admin, is_test, status)')
          .eq('status', 'active')
          .eq('profiles.is_admin', false).in('profiles.is_test', testFlags()).eq('profiles.status', 'active'),
        profilesApi.profiles().select('id', { count: 'exact', head: true })
          .eq('status', 'active').eq('is_admin', false).in('is_test', testFlags()).is('deletion_requested_at', null),
        challengesApi.challenges().select('id, title, community_id, status, end_date, closes_at, timezone, scoring, prize_structure, prize_currency, weekly_prize').eq('status', 'active'),
        // Announcements from every announcement room this creator can read (RLS decides which, migration 149). Market rooms are
        // namespaced (`germany:announcements`), so the filter matches the suffix, not an exact key. recentAnnouncements() trims.
        chatApi.messages()
          .select('*, profiles:sender_id(name, photo_url)')
          .or('channel.eq.announcements,channel.like.*:announcements')
          .eq('deleted', false)
          .gte('created_at', new Date(Date.now() - ANNOUNCEMENT_MAX_AGE_DAYS * 86400000).toISOString())
          .order('created_at', { ascending: false }).limit(40),
        flightsApi.collabPosts()
          .select('id, city, country, start_date, end_date, profiles:creator_id(name, photo_url)')
          .gte('end_date', today).order('start_date', { ascending: true }).limit(6),
        // Six, not four. Four left a hole at the end of a three-across grid and
        // read as "we only have four", which is the opposite of the point.
        profilesApi.profiles().select('id, name, photo_url, bio, country_code')
          .eq('status', 'active').eq('is_admin', false).in('is_test', testFlags())
          .is('deletion_requested_at', null).order('created_at', { ascending: false }).limit(6),
        // Badge counts for the rail. They were in the avatar menu; the menu no
        // longer holds these links, so the signal has to move with them or a
        // pending connection request becomes invisible.
        profilesApi.connections().select('id', { count: 'exact', head: true })
          .eq('connected_creator_id', session?.user?.id ?? '00000000-0000-0000-0000-000000000000')
          .eq('status', 'pending'),
        // The map's data, passed into CreatorMap as props: the shared roster (lib/roster) carries countries_visited,
        // last_seen_at and bio for the pins, and the cards below read the same copy.
        loadRoster(),
        flightsApi.collabPosts().select('creator_id, city, country, city_lat, city_lng, start_date, end_date')
          .gte('end_date', today).order('start_date'),
      ])

      if (cancelled) return
      const tally = {}
      for (const m of mems || []) tally[m.community_id] = (tally[m.community_id] || 0) + 1
      const live = {}
      for (const c of challenges || []) live[c.community_id] = c

      // THE GLOBAL CHALLENGE'S ENTRIES AND PACE ARE NO LONGER READ HERE. They fed the participation bar the "Open to
      // everyone" section drew, which went on 21 Sep (see below); two queries kept running for nothing, and needing the
      // network's id made this whole load run TWICE on every visit - once before CommunityContext answered and again
      // after. That double load was a third of the requests an app open made. The live boards' top three, before the
      // page draws (see prefetchTopThree).
      await prefetchTopThree((challenges || []).map((c) => c.id)).catch(() => {})
      if (cancelled) return
      setD({
        counts: tally, creators, live, anns: recentAnnouncements(ann, { now: Date.now(), limit: ANNOUNCEMENT_LIMIT }), trips: trips || [], fresh: fresh || [],
        // From the map's own roster: a second whole-table read of profiles for one column was the same people, plus
        // pending and deleted ones who should not shade a country anyway.
        visited: [...new Set((mapPeople || []).flatMap((p) => p.countries_visited || []))],
        connReqs: connCount ?? 0,
        mapPeople: mapPeople || [],
        // Every upcoming trip per creator, soonest first. CreatorMap picks the
        // one it can actually draw an arc for and decides how far ahead is
        // worth showing.
        mapTrips: (mapTrips || []).reduce((acc, t) => {
          (acc[t.creator_id] ||= []).push({ ...t, current: t.start_date <= today })
          return acc
        }, {}),
      })
    }
    load()
    return () => { cancelled = true }
  }, [session?.user?.id])

  // Remember it for the next visit. See lib/pageCache.
  useEffect(() => { if (d) writePageCache(HUB_CACHE_KEY, d) }, [d])

  // The numbers on the welcome card load in their own effects (the page does not wait for them); the card shows dashes
  // until they land. Distance flown is seeded from the last visit so a return shows figures on the first frame.
  const [flights, setFlights] = useState(() => lastFlights)
  useEffect(() => {
    let cancelled = false
    flightsApi.communityFlightTotals().then(({ data }) => {
      if (cancelled) return
      const row = Array.isArray(data) ? data[0] : data
      if (row) setFlights((lastFlights = { km: Number(row.total_km) || 0, n: Number(row.total_flights) || 0 }))
    })
    return () => { cancelled = true }
  }, [])

  const [me, setMe] = useState(() => lastMe)
  useEffect(() => {
    const uid = session?.user?.id
    if (!uid) return undefined
    let cancelled = false
    Promise.all([
      submissionsApi.submissions().select('id', { count: 'exact', head: true }),
      submissionsApi.submissions().select('id', { count: 'exact', head: true }).eq('creator_id', uid),
      // Connections are DIRECTIONAL rows, so being connected to somebody is a
      // row in one direction or the other. Counting only `creator_id = me`
      // would show roughly half of anybody's real network.
      profilesApi.connections().select('id', { count: 'exact', head: true })
        .eq('status', 'accepted').or(`creator_id.eq.${uid},connected_creator_id.eq.${uid}`),
      // YOUR HIGHLIGHTS (19 Oct 2026): the views your entries earned, what you have won, your best finish. See
      // `Highlights` for why these replaced the connections and videos chips.
      submissionsApi.submissions().select('logged_views').eq('creator_id', uid).limit(1000),
      moneyApi.rewards().select('amount, currency, status').eq('creator_id', uid).neq('status', 'cancelled'),
      challengesApi.results().select('rank, challenge_id, challenges!inner(title, winners_published_at)')
        .eq('creator_id', uid).not('rank', 'is', null).not('challenges.winners_published_at', 'is', null)
        .order('rank', { ascending: true }).limit(1),
    ]).then(([{ count: videos }, { count: myVideos }, { count: myConns }, { data: myViews }, { data: myRewards }, { data: best }]) => {
      if (cancelled) return
      // POINTS AND RANK ARE NO LONGER READ HERE. Nothing on this page renders
      // them - the chips were cut to connections and videos a while back - and
      // the board they came from was retired with the points leaderboard. See
      // the note where that section used to be.
      setMe(lastMe = {
        videos: videos ?? 0,
        myVideos: myVideos ?? 0,
        connections: myConns ?? 0,
        viewsEarned: (myViews || []).reduce((sum, r) => sum + (Number(r.logged_views) || 0), 0),
        wonEur: Math.round((myRewards || []).reduce((sum, r) => sum + (convert(Number(r.amount) || 0, r.currency || 'EUR', 'EUR') || 0), 0)),
        best: best?.[0] ? { rank: best[0].rank, id: best[0].challenge_id, title: best[0].challenges?.title } : null,
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

  // Live challenges in markets the viewer is actually in. A market they can
  // read but have not joined is not "their" live challenge. The network's own
  // challenge is everybody's, so it leads.
  const globalLive = network ? d?.live?.[network.id] : null

  const myLive = [
    ...(globalLive ? [{ market: network, challenge: globalLive, global: true }] : []),
    ...myMarkets.map((m) => (d?.live?.[m.id] ? { market: m, challenge: d.live[m.id] } : null)).filter(Boolean),
  ]

  // The arrival ladder: `stepDelay()` is a counter read in JSX order, so the nth section that actually renders gets the
  // nth step on any device (`cond && <Reveal delay={stepDelay()}>` short-circuits). Reset every render. Only the first
  // few sections get a head start; everything after is zero, so scrolled-to sections start at once.
  const LADDER_STEPS = 4
  let step = 0
  // A PHONE GETS A LONGER, SLOWER LADDER. One column means the first screen is four or five sections stacked, and 50ms
  // apart they land as one block. 110ms apart they visibly arrive one after another.
  const stepDelay = () => {
    const i = step++
    if (isMobile) return i < 6 ? i * 0.11 : 0
    return i < LADDER_STEPS ? i * 0.05 : 0
  }

  const rail = (
    <>
      {/* ---------- Live now ---------- */}
      {/* Desktop only: on a phone these rail cards repeat what the page already shows. */}
      {/* A VIP HAS NO CHALLENGES, SO NOT "NOTHING RUNNING". Their month: the VIP challenge, how they are tracking and a
          way to add a video. */}
      {vipBand ? (
        <RailCard className="hidden lg:block" icon={<Icon name="star" className="h-3.5 w-3.5 text-brand" />} title={tr('Your month')}>
          <VipRailCard overview={vipOverview} />
        </RailCard>
      ) : (
      <RailCard className="hidden lg:block" icon={<Icon name="flag" className="h-3.5 w-3.5 text-brand" />} title={tr("Live now")}>
        {/* A SKELETON WHILE WE DO NOT KNOW, NOT AN ANSWER.
            THE BUG THIS FIXES: `myLive` is derived from data that arrives after the first paint, so this card
            confidently drew "nothing running in your markets right now" - plane and all - and then, mid-animation,
            replaced it with two live challenges. Everything below it moved. That is the jitter the team saw after the
            page had settled, and it was not the animation at all: it was the page changing its mind in public. An empty
            state is a claim, and a claim needs the data first. */}
        {!d ? (
          <div className="space-y-2"><Skeleton className="h-16 w-full" /></div>
        ) : myLive.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-cloud/70 px-3 py-3">
            <TrypPlane variant="badge" />
            <p className="text-xs text-smoke">
              {tr("Nothing running in your markets right now. The next brief lands here.")}
            </p>
          </div>
        ) : (
          // THE PHONE'S CARD, ON THE DESKTOP, FROM ONE FILE. This rail IS the top right, and it was drawing its own
          // flatter version of the same row. See components/network/LiveNowRow.
          //
          // THE GLOW IS BACK ON THIS CARD, IN ORANGE.
          <div className="space-y-2">
            {myLive.map(({ market, challenge, global: isGlobal }) => (isGlobal ? (
              <div key={challenge.id} className="global-glow-mobile">
                <GlowRing tone="onLight" />
                <LiveNowRow challenge={challenge} market={market} global={isGlobal} now={nowMs} />
              </div>
            ) : (
              <LiveNowRow key={challenge.id} challenge={challenge} market={market} global={isGlobal} now={nowMs} />
            )))}
          </div>
        )}
      </RailCard>
      )}

      {/* ---------- Your markets (shared with every market page) ---------- */}
      <MarketsRailCard current="worldwide" live={d?.live} />
      {/* ---------- Creating for another market: straight under the markets you are in ---------- */}
      <JoinMarketCard />

      {/* ---------- Video Ideas, BELOW Your markets (9 Oct 2026: "moved below the Your Map section") ---------- */}
      <IdeasTeaser className="hidden lg:block" />


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
        {/* Every section has its own Reveal, so it animates as you reach it. Delays are 50 ms per section at most. */}
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
          {/* The greeting waits for the data too, so it arrives with the first sections rather than a round trip earlier. */}
          {/* RISES, NEVER DROPS: it sits right under the market switcher, and a drop-in started it on top of the
              switcher. */}
          {d && (
          <Reveal delay={stepDelay()} className="-mb-3">
            <section>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                {tr('Hey {name}', { name: profile?.name?.split(' ')[0] || '' })}
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
              <NewInRooms className="mt-4 lg:hidden" />
            </section>
          </Reveal>
          )}

          {/* Nothing below the greeting renders until the data is in (and `network` from useCommunity, a separate fetch), so
             conditional sections are never inserted into a page already on screen. */}
          {!d || !network ? (
            /* THE BUSIEST FIRST SCREEN IN THE PRODUCT, and it was drawing four
               grey bars. The hub has a market switcher, a greeting, the live
               challenge banner, the latest announcement and the puzzles - so
               that is what the placeholder is now, at those heights, so nothing
               reflows when the real thing lands. */
            <PageSkeleton shape="hub" inLayout />
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
                {/* SOLID, AND SHORTER BY A THIRD. It was a pale tint panel with a hairline orange border, a title, and a
                    full-size pill button on a line of its own - about 190px of the first screen for two facts. The one
                    card on this page you can act on today should not be the faintest thing on it, so it is the brand
                    colour outright. The button becomes a chevron - the whole card is the link and always was - and the
                    space that buys goes to the fact the old card was missing entirely: WHEN IT CLOSES. */}
                <div className="space-y-2">
                  {myLive.map(({ market, challenge, global: isGlobal }, i) => (
                    <div key={challenge.id} className="animate-card-wipe" style={{ animationDelay: `${i * 0.12}s` }}>
                      {/* The worldwide brief carries the running light round its border on a phone too. */}
                      {isGlobal ? (
                        <div className="global-glow-mobile">
                          <GlowRing tone="onLight" />
                          <LiveNowRow challenge={challenge} market={market} global={isGlobal} now={nowMs} expanded />
                        </div>
                      ) : (
                        <LiveNowRow challenge={challenge} market={market} global={isGlobal} now={nowMs} />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </Reveal>
          )}

          {/* A VIP'S MONTH, ON A PHONE, where everybody else sees the live challenge. */}
          {isMobile && vipBand && (
            <Reveal from="down" delay={stepDelay()}>
              <section><VipRailCard overview={vipOverview} /></section>
            </Reveal>
          )}

          {/* THE QUICK-ACTION GRID MOVED INTO THE AVATAR MENU.
              It existed because the rail is at the bottom of a long page on a
              phone, so the ten network destinations were a full scroll away. A
              grid here fixed that and created a smaller problem: a block of
              navigation sitting in the middle of a content page, on the hub
              only. The same ten links now live behind your own avatar, one
              thumb-reach from EVERY page. See AppLayout. */}

          {/* THE PROFILE PROGRESS CARD IS GONE. "Your profile is 33% there" is a nag that only makes sense when a
              creator arrived with an empty profile, and the onboarding flow being built now collects all of it up front
              - so by the time anybody reaches this hub the bar would read 100% and the card would never render. It was
              removed rather than left to rot, and the component itself was deleted once onboarding had shipped. */}

          {/* ---------- Welcome ---------- */}
          {/* No `initial/animate` of its own any more. It had a mount tween
              while everything around it had a scroll trigger, so the one card
              that is always above the fold was also the one card that animated
              on a different clock. The Reveal owns it now, like every other
              section. */}
          {/* Desktop only (`!isMobile`, not CSS hidden, which would still render and take a step off the ladder). */}
          {!isMobile && (
          <Reveal from="down" delay={stepDelay()}>
          <section
            className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift animate-card-wipe sm:p-10"
          >
            {/* THE WIPE: see `.animate-card-wipe` in index.css. */}
            <div aria-hidden className="challenge-sheen pointer-events-none absolute inset-0" />
            <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-black/5 blur-2xl" />
            {/* A FEW PIXELS LOWER. The plane's box is `bottom-0` and the stats row runs under it, so the trail was
                landing on the caption. Nudged here rather than in TrypPlane: every other card that draws it has
                different content beneath. */}
            {/* The plane and the figures share a box of their own now, so the
                plane stays parked beside the figures when the global challenge
                band is added under them rather than dropping onto the band. */}
            {/* NO BAND, MORE ROOM. A VIP sees no challenges, so the global challenge band is not drawn - and the plane,
                parked a rem below a box that ends at the chips, rose into the kilometres figure. Without the band the
                box keeps 3.5rem of air at its foot for the plane to fly in. */}
            <div className={cx('relative', !globalLive && !vipBand && 'pb-1')}>
            {/* With the challenge band under it the figures' box is the plane's
                anchor, and that box is shorter than the plane - so it drops
                further to fly between the figures and the band, not over the
                kilometres. */}
            {/* NUDGED UP 2px AND LEVELLED WITH THE STAT HINTS' BASELINE. 4.25rem (68px) sat the plane fractionally below
                the hint row's own baseline; 4.125rem (66px) brings it level with it while staying clear of the global
                challenge band underneath. */}
            <TrypPlane variant="hero" id="welcome" className={globalLive || vipBand ? 'translate-y-[4.125rem]' : 'translate-y-4'} />
            <div className="relative">
              {/* NO "WORLDWIDE" PILL. The tab you are on says it, the place switcher directly above says it, and the
                  heading under this said it a third time. */}
              {/* A title, not "Welcome to...", and no explanatory paragraph: this is the page a creator opens every day. */}
              {/* `sm:whitespace-nowrap`, not `whitespace-nowrap`. Thirty-four
                  characters cannot hold one line inside a 375px card at any
                  size a heading is allowed to be, and forcing it there would
                  push the text out of the card rather than wrap it. From `sm`
                  up there is room, so that is where the promise is made. */}
              <h2 className="wipe-item text-lg font-bold leading-tight sm:text-2xl lg:text-[26px] xl:whitespace-nowrap xl:text-3xl" style={{ animationDelay: '0.18s' }}>
                {tr("Tryp.com Content Creator Community")}
              </h2>

              {/* What the community has done, counting up once when first seen. Countries = every country anybody has been to
                 (countries_visited, the same set the creator map colours). */}
              {/* The four counters start and finish together: CountUp runs on a fixed duration (Motion.jsx), and the row waits for
                 all four values before mounting any counter. Dashes until then. */}
              <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:mt-7 sm:flex sm:flex-wrap sm:items-start sm:gap-x-10">
                {[
                  // One or many are two labels (`plural`), not one with an s; Spanish agrees the noun too.
                  { key: 'creators', n: d?.creators, label: pl(d?.creators, 'Creator worldwide', 'Creators worldwide'), hint: tr('across every market') },
                  { key: 'markets', n: openMarkets.length, label: pl(openMarkets.length, 'Market open', 'Markets open'), hint: tr('and more on the way') },
                  { key: 'videos', n: me?.videos, label: pl(me?.videos, 'Video posted', 'Videos posted'), hint: tr('to challenges so far') },
                  // Kilometres flown (community_flight_totals(), migration 100): a number everybody's trips move.
                  { key: 'km', n: flights?.km ?? null, label: pl(flights?.km, 'Kilometre flown', 'Kilometres flown'), hint: tr('logged by all of us') },
                ].map((s, i, all) => (
                  // KEYED ON THE STAT, NOT ON ITS LABEL. The label now changes
                  // when a count crosses one, and a changing key would unmount
                  // the CountUp and replay the whole animation underneath it.
                  <div key={s.key} className="wipe-item" style={{ animationDelay: `${0.28 + i * 0.07}s` }}>
                    <p className="text-2xl font-bold sm:text-3xl">
                      {/* ZERO, NEVER A DASH. The counter is mounted from the card's first frame holding 0 and is handed
                          the real figures together once all four are in, so the row still lands on one frame - it just
                          waits at 0, which is where a count starts, instead of at a dash that then swaps for a 0. */}
                      <CountUp
                        value={all.every((x) => x.n != null) ? s.n : 0}
                        format={(v) => Math.round(v).toLocaleString('en-GB')}
                      />
                    </p>
                    {/* THE LABEL SHRINKS, THE CARD DOES NOT. "Kilometres flown" is "Kilómetros recorridos" and "Creators
                        worldwide" is "Creadores en todo el mundo", so at the English type size the four statistics
                        wrapped into a second line and the card grew to hold it. The type steps down instead, and
                        `tracking-wide` rather than `tracking-widest` gives back another few characters - which is the
                        trade they asked for: same layout, smaller words. */}
                    <p className="text-[10px] font-medium uppercase tracking-wide text-white/70 sm:text-[11px] lg:text-xs lg:tracking-widest">{s.label}</p>
                    <p className="mt-0.5 hidden text-[11px] text-white/55 lg:block">{s.hint}</p>
                  </div>
                ))}
              </div>

              {/* The same question about you; each figure links to where you would change it. Points appear only once you are on
                 the board. */}
              {/* THE CHIPS RESERVE THE PLANE'S CORNER.
                  `TrypPlane variant="hero"` is absolutely positioned in the
                  bottom-right of this card, so a wrapping row of chips runs
                  underneath it - the same trap LiveChallengeCard hit, where the
                  fix was to reserve the space on the ONE element that needs it
                  rather than padding the whole column. The divider still spans
                  the full width; only the chips stop short. */}
              {/* Two chips, no heading: your connections and your videos. Facts about you, not prompts. */}
              {/* NO RULE ACROSS THIS CARD. There was a `border-t` here, spanning the full width of the card - and the
                  plane is parked in the bottom-right corner, so the line ran straight through the aircraft and out the
                  other side. Shortening the rule to the width of the chips would only have made it a line that stops for
                  no visible reason. The chips are a row of pills on a coloured card; they do not need a rule to be
                  separated from the figures above, only air. */}
              {/* AND THE CHIPS KEEP WELL CLEAR OF THE PLANE. The hero plane's
                  box is 23rem (25rem at xl) and its nose reaches about a tenth
                  of the way in from the left of that box, so the row stops
                  ~21.5rem short of the right edge and nothing can wrap under a
                  wing. They are a size down from the figures above too, which
                  is what they are: doors, not statistics. */}
              <div className="mt-6 sm:mt-7">
                {vipBand ? (
                  <div className="wipe-item flex flex-wrap gap-2 lg:max-w-[calc(100%-21.5rem)] xl:max-w-[calc(100%-23.5rem)]" style={{ animationDelay: '0.6s' }}>
                    <MineChip to="/connections" icon="users"
                      value={me ? me.connections : null}
                      label={me?.connections === 1 ? tr('connection') : tr('connections')} />
                    {/* A VIP's videos are their VIP videos (3 Oct 2026: "it shows zero connections, but I think here you can
                        also show the amount of videos they posted in a little card"). */}
                    <MineChip to="/vip?tab=videos" icon="video"
                      value={vipOverview ? Number(vipOverview.lifetime?.videos ?? vipOverview.stats?.videos ?? 0) : null}
                      label={Number(vipOverview?.lifetime?.videos) === 1 ? tr('video posted') : tr('videos posted')} />
                  </div>
                ) : (
                  <Highlights me={me} live={myLive} />
                )}
              </div>
            </div>
            </div>
            {globalLive && <GlobalChallengeStrip challenge={globalLive} className="!mt-14" arriveDelay={0.08} />}
            {!globalLive && vipBand && <VipHomeCard inCard className="!mt-14" />}
          </section>
          </Reveal>
          )}

          {/* ---------- Global challenge ---------- */}
          {/* Above the markets on purpose. A global challenge is the one thing
              on this page that everybody reading it can act on right now, and
              burying it under a list of places would be exactly backwards. */}
          {/* THE "OPEN TO EVERYONE" SECTION IS GONE. It drew the whole live global challenge card - brief, board, clock
              and the participation bar - as a second copy under the community card. On a desktop the community card
              carries it as a band (GlobalChallengeStrip); on a phone the Live now row at the top of the page is the
              door. */}

          {/* ---------- Markets: NOT HERE ANY MORE ---------- It was a two-column grid of market cards, desktop only,
               saying exactly what the rail on the right of the same page already says. they are right that it was the
               same list twice. The rail is the better of the two: it is always in view, it reorders, and it shows which
               market has something running. On a PHONE the section was already suppressed (the switcher bar at the top
               is the market surface there), so this removes the last copy rather than the only one - `MarketCard` and
               `openMarkets` go with it. */}

          {/* ---------- Network standings ---------- */}
          {/* Reveal, not a stagger: these sections are below the fold, and a
              list that already animated in before you scrolled to it has spent
              its motion on nobody. */}
          {/* Points are earned inside a market but they add up across the whole
              network, so this is the one leaderboard that belongs at network
              level. A creator who moves from Spain to the UK keeps their
              standing here. */}
          {/* No points board here: points are one scoring mode among three. /leaderboard (views, everyone) is the standing. */}

          <div className="hidden lg:block"><NewInRooms /></div>

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
                {/* ONE ANNOUNCEMENT GETS THE WHOLE WIDTH. `sm:grid-cols-2` unconditionally meant a creator in a single
                    market - which is most creators - got one card sitting in the left-hand column with an empty column
                    beside it. The columns follow the count, and the count is capped at two. */}
                <Reveal
                  // `grid-cols-1`, NOT an implicit column: an implicit track is sized to its content, so an announcement
                  // holding a long link was as wide as the link and ran off the right of a phone ("the right side of the
                  // announcement cards are cut off").
                  className={cx('grid grid-cols-1 gap-3', d.anns.length > 1 && 'sm:grid-cols-2')}
                  stagger={0.07}
                >
                  {d.anns.map((a) => {
                    // The worldwide room has a real community_id, so it is recognised by id. `chapters`, not `openMarkets`, so a paused
                    // market's announcement is not labelled Worldwide.
                    const from = a.community_id && a.community_id !== network?.id
                      ? (chapters.find((m) => m.id === a.community_id) || null)
                      : null
                    return (
                      <Link
                        key={a.id}
                        to={from ? `/c/${from.slug}/chat/announcements` : '/global/chat/announcements'}
                        // `h-full` + a column, so two cards side by side are the same height whatever is in them. The
                        // grid already stretches its items; the card was `block`, so it ignored that and sized to its
                        // own text - one card three lines tall beside one card one line tall.
                        className="card flex h-full min-w-0 flex-col overflow-hidden border-l-4 !border-l-brand transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar src={a.profiles?.photo_url} name={a.profiles?.name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{a.profiles?.name}</p>
                            <p className="truncate text-xs text-smoke">
                              {marketName(from ? from.name : network?.name || 'Worldwide')} · {timeAgo(a.created_at)}
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 line-clamp-3 break-words text-sm text-ink [overflow-wrap:anywhere]">{stripMarkup(a.body)}</p>
                      </Link>
                    )
                  })}
                </Reveal>
              </section>
            </Reveal>
          )}

          {/* ---------- Video Ideas on a phone, just below the latest announcements. On a laptop it lives in the rail
               under Your markets; here the rail is at the bottom of a very long page, so it gets a small card of its
               own. */}
          {isMobile && (
            <Reveal from="down" delay={stepDelay()}>
              <IdeasTeaser />
            </Reveal>
          )}

          {/* ---------- Daily puzzles ---------- Between the announcement and the map, exactly where the team asked for
               it: after the thing the team wants you to read, before the thing you came to browse. All three, each
               ticking green on its own, each saying how many creators have played it today. It is the only habit loop on
               the whole hub. */}
          <Reveal from="down" delay={stepDelay()}>
            <DailyPuzzleCallout />
          </Reveal>

          {/* The map: the creator map (people, in their towns, with planes between them). The countries-visited map lives on
             the creator directory. */}
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
                  ? (
                    <CreatorMap
                      creators={d.mapPeople}
                      trips={d.mapTrips}
                      myId={session?.user?.id}
                      // The hub map is navigable (drag, double-click, wheel through the gate in CreatorMap's `filterZoomEvent`). The
                      // landing page's map stays non-navigable so it never captures a reader's scroll.
                      navigable
                    />
                  )
                  : <MapSkeleton />}
              </WhenVisible>
            </section>
          </Reveal>

          {/* ---------- Creators on the move ---------- */}
          {d?.trips?.length > 0 && (
            <Reveal from="down" delay={stepDelay()}>
              <section>
                <SectionHead icon="pin" title={tr("Creators travelling")} to="/collab" toLabel={tr('Collab board')} />
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
                {/* `grid-cols-1` is required: without an explicit base column count the cards land in an implicit `auto` track, which
                   cannot shrink below a `truncate`d bio's full width (cards ran off a 375px screen). Any grid holding `truncate` text
                   needs an explicit base column count. */}
                <Reveal className="trim-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" stagger={0.07}>
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
