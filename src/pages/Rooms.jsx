import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useCommunity } from '../context/CommunityContext'
import { useAuth } from '../context/AuthContext'
import { useUnread, scopedChannel } from '../context/UnreadContext'
import NetworkLayout from '../components/network/NetworkLayout'
import NetworkMotion from '../components/NetworkMotion'
import Reveal from '../components/network/Reveal'
import Reorderable from '../components/network/Reorderable'
import FlagTile from '../components/network/FlagTile'
import FlagStack from '../components/network/FlagStack'
import Icon from '../components/Icon'
import UnreadDot, { UnreadCount } from '../components/UnreadDot'
import { EmptyState } from '../components/ui'
import PageSkeleton from '../components/PageSkeleton'
import { stripMarkup } from '../lib/richText'
import { cx, shortAgo } from '../lib/utils'
import { useIsMobile } from '../lib/useKeyboardInset'
import { pageFade } from '../lib/motion'
import { useT } from '../lib/i18n'
import { useCachedPage, writePageCache } from '../lib/pageCache'

// See lib/pageCache.
const ROOMS_CACHE_KEY = 'rooms'

// Shared with the chat page's sidebar, so an order dragged in either place is
// the order in both.
const ROOM_ORDER_KEY = 'rooms-market-order'
const loadRoomOrder = () => {
  try { return JSON.parse(localStorage.getItem(ROOM_ORDER_KEY)) || [] } catch { return [] }
}

// Every room you can post in, grouped by the place it belongs to.
//
// WHY THIS PAGE EXISTS
//
// The Rooms tab used to drop you straight into a conversation - whichever one
// the router picked - with the other rooms reachable from a 200px rail. That is
// the right shape once you are IN a room and the wrong one for the tab that is
// supposed to answer "where is everyone talking". A creator in Worldwide and
// Spain had two Generals, two Announcements and no page that showed them as two
// distinct places.
//
// So: Worldwide in its own card, then one card per market. The grouping IS the
// information. The whole point of the network design is that a Spanish General
// and the worldwide General are different rooms, and a flat list of eight rows
// called General, Announcements, General, Announcements says the opposite.
//
// Each row carries its last message, because "which of these is alive" is the
// second question everybody asks and it was previously unanswerable without
// opening all of them.

// The namespaced channel string, imported rather than redefined: the watermark
// is written under this string and the dot is read under it, so three files
// having their own copy of the rule is three chances for them to disagree.
const scopedKey = scopedChannel

// ONE ROOM, LAID OUT LIKE A CHAT LIST AND NOT LIKE A TABLE.
//
// THE TWO THINGS THAT WERE WRONG.
//
// 1. GENERAL WAS PAINTED AS IF IT WERE SELECTED. Its icon tile was
//    `bg-brand text-white` while every other room's was a pale tint - not
//    because you were in it, but because its key is the string 'general'. On a
//    page listing eight rooms across two markets that is two solid orange
//    badges saying "you are here" about rooms you are not in. Ethan: "for some
//    reason it always shows like you're clicked in in General even if you're
//    not, that one's orange and all the rest are a lighter colour." Nothing on
//    this page is ever the current room - it is an index, and you are on it
//    precisely because you are not in a room yet.
//
// 2. FIVE THINGS COMPETED FOR ONE LINE. Name, preview, "about 2 hours ago", a
//    face and a chevron, on a 375px screen. The name is the only one of those
//    you navigate by and it was the one that lost: "Announce…", "Gener…".
//
// So it is the layout every chat list has settled on, for the reason they all
// settled on it: the name and the time share the top line, because the time is
// short and the name needs the rest; the preview gets a whole line to itself.
// The face and the chevron are gone - the preview already names the speaker,
// and a full-width row in a list of links does not need to be told it is
// tappable.
function RoomRow({ to, room, last, unread, dark = false, place = null }) {
  const tr = useT()
  return (
    <Link
      to={to}
      className={cx('group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors', dark ? 'hover:bg-white/10 active:bg-white/10' : 'hover:bg-cloud active:bg-cloud')}
    >
      {/* THE GLYPH IS ORANGE. THERE IS NO TILE BEHIND IT.
          It was a solid 40px brand square with a white icon in it, and eight of
          those down a page is eight blocks of the loudest colour on the
          platform doing the work of a bullet point. Ethan: "rather than having
          an orange square with the white icon, I was thinking of just having
          the orange icon instead of the big orange square, because a big orange
          square seems to be taking away my eyes too much."
          The column keeps its 40px, so every name still starts on the same
          vertical line and nothing else in the row moved.

          THE STAFF ROOM IS THE ONE THAT LOOKS DIFFERENT. Only admins can open
          it, and in a list of otherwise identical rows there was nothing but a
          small grey chip to say so. It is drawn in ink rather than brand -
          quieter than everything around it, which is the right weight for a
          back office room. NOT a new hue: the palette is white, ink and the two
          oranges, and a blue or a purple here would be the first thing on the
          platform that is none of them. */}
      <span
        className={cx(
          'flex h-10 w-10 shrink-0 items-center justify-center',
          room.visibility === 'staff' ? 'text-ink/70' : dark ? 'text-brand-light' : 'text-brand',
        )}
      >
        <Icon name={room.icon || 'chat'} className="h-[22px] w-[22px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          {/* UNREAD IS BOLDER TEXT AND ONE ORANGE DOT (8 Sep 2026).
              Ethan: "we want to make sure a little orange dot icon shows up on
              the right of the chat if there's new messages... and maybe on
              mobile it would just be highlighted or something, because there's
              not much space for a dot."

              It is both, because they do different jobs. The DOT is the thing
              you find when you are looking for it - one saturated pixel-cluster
              on an otherwise quiet page. The WEIGHT is the thing you notice
              when you are not: scanning a list of eight rooms, the two that
              have something new are simply darker, with no icon to decode. That
              is the pattern every mail and chat client converged on and it is
              not a coincidence.

              This is also the honest answer to why the UK has not seen the
              general chat. Their rooms are there and readable - checked
              directly against production, a UK creator can see all four UK
              channels and every message in them - but nothing on this page said
              a word had been posted, so nobody opened it. */}
          <span className={cx('min-w-0 flex-1 truncate text-[15px] leading-tight',
            dark ? (unread ? 'font-bold text-white' : 'font-semibold text-white/90') : unread ? 'font-bold text-ink' : 'font-semibold')}>{tr(room.label)}</span>
          {room.visibility === 'vip' && !dark && (
            <span className="shrink-0 rounded-full bg-ink px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">VIP</span>
          )}
          {room.visibility === 'staff' && (
            <span className="shrink-0 rounded-full bg-ink/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-ink/70">{tr("Staff")}</span>
          )}
          {last && (
            <span className={cx('shrink-0 text-[11px] tabular-nums', unread ? 'font-semibold text-brand' : 'text-gray-400')}>
              {shortAgo(last.created_at)}
            </span>
          )}
          {/* AND IT PULSES. A still dot is a bullet point; this one is the only
              moving thing on a page of static rows, which is what makes it the
              thing you find without looking for it. See components/UnreadDot -
              the solid centre never fades, so it is still countable. */}
          {unread && <UnreadDot className="self-center" />}
        </span>
        {/* The last thing said, or what the room is for if nothing has been.
            An empty room that explains itself is an invitation; an empty room
            that says nothing is a dead end. */}
        <span className={cx('mt-1 block truncate text-[13px] leading-snug', dark ? 'text-white/60' : unread ? 'font-medium text-ink/80' : 'text-smoke')}>
          {place && <span className="font-semibold text-ink/70">{place} · </span>}
          {last
            ? `${last.profiles?.name?.split(' ')[0] || 'Someone'}: ${stripMarkup(last.body || '')}`
            : (room.hint ? tr(room.hint) : tr('Nothing posted yet'))}
        </span>
      </span>
    </Link>
  )
}

function PlaceCard({ place, rooms, lastByChannel, unreadKeys, isNetwork, handleProps, dragging, vip = false }) {
  const tr = useT()
  const base = isNetwork ? '/global/chat' : `/c/${place.slug}/chat`
  const unreadCount = rooms.filter((r) => unreadKeys.has(scopedKey(place, r.key))).length
  return (
    /* THE PLACE IS A HEADING WITH A FLAG ON IT. NO TINTED BAND (12 Sep 2026).
       Ethan: "I don't like the current way it looks on mobile with the light
       orange background behind the country names, improve it too."

       The band was the previous answer to a real problem - the market name used
       to be the same 14px semibold ink as the room names under it, so five
       stacked cards read as one long list of Generals and Announcements - and
       it solved that by painting `bg-brand-tint` across the card's top edge.
       Five of those down a phone screen is five orange stripes, which is the
       same mistake the orange icon tiles made on this very page: the loudest
       colour on the platform used as a divider rather than as an accent.

       What separates the places now is TYPE and a FLAG, not a fill. The name
       steps up to 17px bold ink - bigger than anything under it by a clear
       margin - and the flag gets a real 34px tile instead of being an emoji
       floating at 14px beside it, so a glance down the page reads as flag,
       flag, flag rather than as a wall of text. The card's own edge is the
       only rule; the hairline under the header is a hairline, not a band.
       That is the platform rule about orange applied honestly: it is spent on
       the unread dot, which is information, and on nothing decorative. */
    <section data-place={vip ? `vip-${isNetwork ? 'network' : place.slug}` : isNetwork ? 'network' : place.slug} className={cx(
      'overflow-hidden rounded-card p-4 transition-all duration-200',
      // THE VIP ROOMS ARE THEIR OWN MATERIAL (2 Oct 2026): the dark `.vip-surface`, not the pale orange wash Ethan
      // did not like ("I want it to be more different").
      vip ? 'vip-surface' : cx('border bg-white', unreadCount > 0 ? 'border-brand/30' : 'border-gray-100'),
      dragging ? 'shadow-lift' : 'shadow-card',
    )}>
      <div className={cx('-mx-4 -mt-4 mb-3 flex items-center gap-3 border-b px-4 py-3', vip ? 'border-white/10' : 'border-gray-100')}>
        {/* The flag, at a size you can actually see. A 34px-high rounded tile
            with the flags at 19px in it - the same object the sidebar and the
            notification settings use, so all three surfaces agree about what a
            place looks like.

            IT GROWS SIDEWAYS FOR A MARKET WITH MORE THAN ONE COUNTRY and keeps
            its height, which is the fix for Ethan's 15 Sep report: this slot
            used to be a hard 34px SQUARE with `FlagStack` inside it, so UK &
            Ireland put two double-width emoji in a box that fits one and the
            Nordics put two plus a "+2" chip in it. See FlagTile - the arithmetic
            never worked and the square was never the thing that mattered. */}
        <FlagTile
          codes={place.country_codes}
          kind={isNetwork ? 'network' : 'chapter'}
          size="h-[34px] w-[34px]"
          glyph="text-[19px]"
          title={place.name}
        />
        <Link to={isNetwork ? '/global' : `/c/${place.slug}`}
          className={cx('min-w-0 flex-1 truncate text-[17px] font-bold leading-tight tracking-[-0.015em] transition-colors', vip ? 'text-white' : 'text-ink hover:text-brand')}>
          {vip ? tr('VIP {m}', { m: place.name }) : place.name}
        </Link>
        {/* A MARKET WITH SOMETHING NEW IN IT SAYS SO ON ITS OWN HEADER, so a
            card three screens down is still findable without opening it. */}
        {unreadCount > 0 ? (
          <UnreadCount n={unreadCount} />
        ) : (
          <span className={cx('shrink-0 text-[11px] font-semibold', vip ? 'text-white/50' : 'text-gray-400')}>
            {rooms.length} {rooms.length === 1 ? tr('room') : tr('rooms')}
          </span>
        )}
        {/* The grip. A real affordance rather than a hidden long-press: on a
            phone a hold gesture is indistinguishable from a slow tap until it
            is too late, and this card is a stack of links. */}
        {handleProps && (
          <button
            type="button"
            {...handleProps}
            className="-mr-1 flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-cloud hover:text-smoke active:cursor-grabbing"
          >
            <Icon name="grip" className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="space-y-0.5">
        {rooms.map((r) => (
          <RoomRow
            key={r.id}
            to={`${base}/${r.key}`}
            room={r}
            last={lastByChannel.get(scopedKey(place, r.key))}
            unread={unreadKeys.has(scopedKey(place, r.key))}
            dark={vip}
          />
        ))}
      </div>
    </section>
  )
}

export default function Rooms() {
  const tr = useT()
  const { myCommunities, loading: ctxLoading } = useCommunity()
  const { profile, isAdmin } = useAuth()
  const vipFirst = !!profile?.is_vip && !isAdmin
  const isMobile = useIsMobile()
  // SECOND AND LATER VISITS DRAW THE ROOMS, NOT A PLACEHOLDER. Both queries
  // below still run every time; the cache only decides what is on screen while
  // they do. See lib/pageCache.
  const cached = useCachedPage(ROOMS_CACHE_KEY)
  const [rooms, setRooms] = useState(cached?.rooms ?? null)
  // WHAT IS UNREAD, AND WHAT WAS SAID LAST, COME FROM THE SHARED STORE.
  //
  // This page used to own both: a 300-row message query and a `channel_reads`
  // read of its own, with the diff in a `useMemo` right here. Three other
  // surfaces needed the same answer (the desktop sidebar, the mobile tab strip
  // over a conversation, the bottom nav), and on a desktop this page REDIRECTS,
  // so the one screen that could see it was the one desktop users never open.
  // One fetch, one subscription, one definition of "read" - see
  // context/UnreadContext. `markRead` there is what puts the dot out on the
  // frame a room opens rather than a round trip later.
  const { unread: unreadKeys, lastByChannel } = useUnread()

  const placeIds = useMemo(() => myCommunities.map((c) => c.id), [myCommunities])

  useEffect(() => {
    // WAIT FOR THE CONTEXT BEFORE CONCLUDING THERE ARE NO ROOMS.
    // `myCommunities` is empty for the first render or two while
    // CommunityContext loads, and writing `[]` into `rooms` on that frame is
    // what put "No rooms yet" on the screen for a moment - see the note on the
    // skeleton below.
    if (ctxLoading) return undefined
    if (!placeIds.length) { setRooms([]); return undefined }
    let alive = true
    supabase.from('channels')
      .select('id, key, label, hint, icon, visibility, position, community_id')
      .in('community_id', placeIds)
      .order('position')
      .then(({ data }) => { if (alive) setRooms(data || []) })
    return () => { alive = false }
  }, [placeIds, ctxLoading])

  // Remember the room list for the next visit, so a second arrival draws the
  // cards rather than a placeholder. The last message and the watermarks are
  // deliberately NOT cached: a stale watermark puts an orange dot on the room
  // you are looking at, and one wrong dot is all it takes for the signal to
  // stop being believed. See lib/pageCache.
  useEffect(() => {
    if (!rooms) return
    writePageCache(ROOMS_CACHE_KEY, { rooms })
  }, [rooms])

  // The VIP rooms are kept out of the market cards and drawn as cards of their own, after the markets.
  const vipPlaces = useMemo(() => {
    if (!rooms) return []
    return myCommunities
      .filter((c) => c.kind !== 'network')
      .map((c) => ({ place: c, rooms: rooms.filter((r) => r.community_id === c.id && r.visibility === 'vip') }))
      .filter((g) => g.rooms.length > 0)
      .sort((a, b) => a.place.name.localeCompare(b.place.name))
  }, [rooms, myCommunities])

  const places = useMemo(() => {
    if (!rooms) return []
    return myCommunities
      // The VIP lounge is one of Worldwide's rooms, last (2 Oct 2026); market VIP rooms stay apart.
      .map((c) => ({
        place: c,
        rooms: rooms
          .filter((r) => r.community_id === c.id && (r.visibility !== 'vip' || c.kind === 'network'))
          .sort((a, b) => (a.visibility === 'vip') - (b.visibility === 'vip')),
      }))
      .filter((g) => g.rooms.length > 0)
      // Worldwide first, then markets alphabetically. Worldwide is where
      // everybody already is, so it is the room you most likely came for.
      .sort((a, b) => (b.place.kind === 'network') - (a.place.kind === 'network')
        || a.place.name.localeCompare(b.place.name))
  }, [rooms, myCommunities])

  // The reader's own order, shared with the chat page's sidebar. Per device on
  // purpose: it is a preference about a layout, not a fact about the person.
  const [roomOrder, setRoomOrder] = useState(loadRoomOrder)
  function saveRoomOrder(next) {
    const ids = next.map((p) => p.place.id)
    setRoomOrder(ids)
    try { localStorage.setItem(ROOM_ORDER_KEY, JSON.stringify(ids)) } catch { /* private mode */ }
  }
  // Anything never dragged falls in behind at its natural place rather than
  // disappearing, so a market added next month simply appears at the end.
  const rank = new Map(roomOrder.map((id, i) => [id, i]))
  const orderedPlaces = [...places].sort(
    (a, b) => (rank.has(a.place.id) ? rank.get(a.place.id) : 1e9) - (rank.has(b.place.id) ? rank.get(b.place.id) : 1e9),
  )

  // THE FILTERS ACROSS THE TOP (2 Oct 2026). Ethan asked for the phone's rooms to be rebuilt after looking at how
  // the popular chats do it. WhatsApp's answer to "too many conversations" is a row of filters over the list (All,
  // Unread, Groups); Slack's is to bubble what needs you to the top. Both are here: the chips filter to Unread, to one
  // place, or to the VIP rooms, and "All" leads with the rooms that have something new before the places.
  const [filter, setFilter] = useState('all')
  const unreadRooms = useMemo(() => {
    const out = []
    for (const g of [...orderedPlaces, ...vipPlaces]) {
      for (const r of g.rooms) {
        const k = scopedKey(g.place, r.key)
        if (unreadKeys.has(k)) out.push({ g, r, last: lastByChannel.get(k) })
      }
    }
    return out.sort((a, b) => String(b.last?.created_at || '').localeCompare(String(a.last?.created_at || '')))
  }, [orderedPlaces, vipPlaces, unreadKeys, lastByChannel])
  const chips = [
    { key: 'all', label: tr('All') },
    { key: 'unread', label: tr('Unread'), n: unreadRooms.length },
    ...orderedPlaces.map((g) => ({ key: g.place.id, label: g.place.kind === 'network' ? tr('Worldwide') : g.place.name, codes: g.place.country_codes, network: g.place.kind === 'network' })),
    ...(vipPlaces.length ? [{ key: 'vip', label: tr('VIP') }] : []),
  ]
  const shownPlaces = filter === 'all' ? orderedPlaces : orderedPlaces.filter((g) => g.place.id === filter)
  const showVip = filter === 'all' || filter === 'vip'

  // THE MARKET YOU WERE JUST IN IS WHERE THIS PAGE OPENS (1 Oct 2026). Ethan: "I go to Worldwide, click on a market
  // (Spain), and then click on Rooms. I'm on the Spain one, but it's still scrolled up at the top. It should be
  // scrolled down to wherever the Spain one actually is." AppLayout notes the last /c/<slug> page in
  // sessionStorage; the first time the cards are on screen the page moves that market's card to the top, once.
  useEffect(() => {
    if (!isMobile || ctxLoading || rooms === null || places.length === 0) return undefined
    let slug = null
    try { slug = sessionStorage.getItem('tryp_last_market') } catch { /* private mode */ }
    if (!slug) return undefined
    const id = requestAnimationFrame(() => {
      try { sessionStorage.removeItem('tryp_last_market') } catch { /* private mode */ }
      const el = document.querySelector(`[data-place="${CSS.escape(slug)}"]`)
      if (!el) return
      const header = document.querySelector('header')?.getBoundingClientRect().height || 0
      window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - header - 12), behavior: 'instant' })
    })
    return () => cancelAnimationFrame(id)
  }, [isMobile, ctxLoading, rooms, places.length])

  // ON A DESKTOP, ROOMS IS A CONVERSATION.
  //
  // Pressing Rooms used to land on this index and nothing else: a page listing
  // rooms, with no room open. That is a table of contents where a chat was
  // expected, and the reported symptom was exactly that - "it doesn't show up
  // any chat at all". On a wide screen there is no reason to choose: the chat
  // page already carries the whole index in its left sidebar, so Rooms goes
  // straight to Worldwide's General with every other room one click away.
  //
  // On a phone there IS a reason to choose - 375px cannot hold a sidebar and a
  // conversation - so the index stays, and it is the page the chat's own "all
  // your rooms" link points at.
  if (!isMobile) return <Navigate to="/global/chat/general" replace />

  return (
    <NetworkMotion>
      <NetworkLayout width="narrow" switcher={false}>
        <motion.div {...pageFade} className="flex flex-col">
          {/* The heading arrives with the page rather than sitting there while
              the cards under it animate in - a title that is already still
              while everything below it moves reads as two pages, not one. */}
          <Reveal from="down" className="-order-2 mb-6">
            {/* NO STRAPLINE. It read "Worldwide is shared by everybody. Each
                market has its own rooms, and nothing posted in one reaches
                another" - a description of how the product is built, told to
                somebody who came here to open a room, on the screen with the
                least room to spare. The cards underneath say all of it by being
                grouped the way they are. */}
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{tr("Rooms")}</h1>
          </Reveal>

          {/* THE SKELETON HOLDS UNTIL THE ROOMS THEMSELVES HAVE ARRIVED.
              THE BUG: "whenever I click on rooms, for the first split second I
              can see it says I'm not in any rooms yet, and then it flashes up
              all the rooms."
              It was `ctxLoading && !rooms`. The context finishes first and the
              CHANNELS query is a second round trip behind it, so for that gap
              the condition was false, `rooms` was still null, `places` was
              therefore `[]`, and the empty state - a headline, an icon and a
              button telling you to go and join a market - was drawn over the
              rooms you are in. `rooms === null` means "not answered yet" and is
              exactly the thing to wait for; `[]` means "answered, and there are
              none". */}
          {ctxLoading || rooms === null ? (
            /* TWO GREY SLABS IS NOT A SKELETON OF ANYTHING (4 Sep 2026).
               Measured on production, tapping this tab on a phone: the page
               drew TWO placeholder elements on an otherwise empty screen. That
               is a blank page with a couple of bars on it, and it is what
               Ethan has been calling "the loading screen" for four rounds.
               The shape now matches what lands - a market switcher and a list
               of rooms. See components/PageSkeleton. */
            <PageSkeleton shape="rooms" />
          ) : places.length === 0 ? (
            <EmptyState
              icon={<Icon name="chat" className="h-7 w-7" />}
              title={tr("No rooms yet")}
              hint={tr("Join a market and its rooms appear here.")}
              action={<Link to="/global/markets" className="btn-primary">{tr("Explore markets")}</Link>}
            />
          ) : (
            <>
              {/* THE FILTER ROW. Scrolls sideways; the picked chip is the brand gradient. */}
              <div className="-order-1 -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {chips.map((c) => {
                  const on = filter === c.key
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setFilter(c.key)}
                      aria-pressed={on}
                      className={cx(
                        'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-all duration-200 active:scale-95',
                        on ? 'bg-gradient-to-r from-brand to-brand-light text-white shadow-card' : 'border border-gray-200 bg-white text-ink/80',
                      )}
                    >
                      {(c.codes || c.network) && <FlagStack codes={c.network ? [] : c.codes} className="text-[13px]" />}
                      {c.key === 'vip' && <Icon name="sparkles" className={cx('h-3.5 w-3.5', on ? 'text-white' : 'text-brand')} />}
                      {c.label}
                      {c.n > 0 && <span className={cx('rounded-full px-1.5 text-[10px] font-bold tabular-nums', on ? 'bg-white/25 text-white' : 'bg-brand text-white')}>{c.n}</span>}
                    </button>
                  )
                })}
              </div>

              <div key={filter} className="flex flex-col gap-4 animate-tab-in">
                {/* NEW SINCE YOU LOOKED - what needs you, across every place, newest first (Slack's "bubble it up"). */}
                {(filter === 'all' || filter === 'unread') && unreadRooms.length > 0 && (
                  <section className="rounded-card border border-brand/25 bg-white p-3 shadow-card">
                    <p className="flex items-center gap-2 px-2 pb-1.5 pt-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
                      <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand" /></span>
                      {tr('New since you looked')}
                    </p>
                    <div className="space-y-0.5">
                      {(filter === 'all' ? unreadRooms.slice(0, 4) : unreadRooms).map(({ g, r, last }) => (
                        <RoomRow
                          key={`${g.place.id}-${r.id}`}
                          to={`${g.place.kind === 'network' ? '/global/chat' : `/c/${g.place.slug}/chat`}/${r.key}`}
                          room={r}
                          last={last}
                          unread
                          place={g.place.kind === 'network' ? tr('Worldwide') : r.visibility === 'vip' ? tr('VIP {m}', { m: g.place.name }) : g.place.name}
                        />
                      ))}
                    </div>
                    {filter === 'all' && unreadRooms.length > 4 && (
                      <button type="button" onClick={() => setFilter('unread')} className="mt-1 w-full rounded-xl py-2 text-center text-xs font-semibold text-brand transition-colors active:bg-cloud">
                        {tr('See all {n} with something new', { n: unreadRooms.length })}
                      </button>
                    )}
                  </section>
                )}
                {filter === 'unread' && unreadRooms.length === 0 && (
                  <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-gray-200 px-6 py-10 text-center">
                    <Icon name="check" className="h-7 w-7 text-brand" />
                    <p className="text-sm font-semibold">{tr("You're all caught up")}</p>
                    <p className="text-xs text-smoke">{tr('Nothing new in any of your rooms.')}</p>
                  </div>
                )}

                {filter !== 'unread' && filter !== 'vip' && (
                  /* DRAGGABLE ON A PHONE TOO, in the same order as the desktop sidebar (both read
                     `rooms-market-order`). Reorderable drags from the GRIP only, because every card is also a stack
                     of links. Dragging is only offered on "All": reordering one card on its own means nothing. */
                  <Reveal dense>
                    <Reorderable
                      items={shownPlaces}
                      getId={(p) => p.place.id}
                      onReorder={filter === 'all' ? saveRoomOrder : () => {}}
                      handleLabel="Reorder this market"
                      className="flex flex-col gap-4"
                      renderItem={({ place, rooms: rs }, { handleProps, dragging }) => (
                        <PlaceCard
                          unreadKeys={unreadKeys}
                          place={place}
                          rooms={rs}
                          lastByChannel={lastByChannel}
                          isNetwork={place.kind === 'network'}
                          handleProps={filter === 'all' ? handleProps : null}
                          dragging={dragging}
                        />
                      )}
                    />
                  </Reveal>
                )}

                {showVip && vipPlaces.length > 0 && (
                  <div className={cx('flex flex-col gap-4', vipFirst && filter === 'all' && '-order-1')}>
                    <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-ink/70">
                      <Icon name="sparkles" className="h-3.5 w-3.5 text-brand" />{tr('VIP rooms')}
                    </h2>
                    {vipPlaces.map(({ place, rooms: rs }) => (
                      <PlaceCard key={place.id} vip unreadKeys={unreadKeys} place={place} rooms={rs} lastByChannel={lastByChannel} isNetwork={false} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      </NetworkLayout>
    </NetworkMotion>
  )
}
