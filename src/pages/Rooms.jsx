import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useCommunity } from '../context/CommunityContext'
import NetworkLayout from '../components/network/NetworkLayout'
import NetworkMotion from '../components/NetworkMotion'
import Reveal from '../components/network/Reveal'
import Reorderable from '../components/network/Reorderable'
import FlagStack from '../components/network/FlagStack'
import Icon from '../components/Icon'
import { EmptyState, Skeleton } from '../components/ui'
import { stripMarkup } from '../lib/richText'
import { cx, shortAgo } from '../lib/utils'
import { useIsMobile } from '../lib/useKeyboardInset'
import { pageFade } from '../lib/motion'

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

const scopedKey = (place, key) => (place.kind === 'network' ? key : `${place.slug}:${key}`)

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
function RoomRow({ to, room, last }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-cloud active:bg-cloud"
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
          room.visibility === 'staff' ? 'text-ink/70' : 'text-brand',
        )}
      >
        <Icon name={room.icon || 'chat'} className="h-[22px] w-[22px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight">{room.label}</span>
          {room.visibility === 'staff' && (
            <span className="shrink-0 rounded-full bg-ink/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-ink/70">Staff</span>
          )}
          {last && (
            <span className="shrink-0 text-[11px] tabular-nums text-gray-400">{shortAgo(last.created_at)}</span>
          )}
        </span>
        {/* The last thing said, or what the room is for if nothing has been.
            An empty room that explains itself is an invitation; an empty room
            that says nothing is a dead end. */}
        <span className="mt-1 block truncate text-[13px] leading-snug text-smoke">
          {last
            ? `${last.profiles?.name?.split(' ')[0] || 'Someone'}: ${stripMarkup(last.body || '')}`
            : room.hint || 'Nothing posted yet'}
        </span>
      </span>
    </Link>
  )
}

function PlaceCard({ place, rooms, lastByChannel, isNetwork, handleProps, dragging }) {
  const base = isNetwork ? '/global/chat' : `/c/${place.slug}/chat`
  return (
    <section className={cx(
      'rounded-card border bg-white p-4 transition-shadow duration-150',
      isNetwork ? 'border-brand/25' : 'border-gray-100',
      dragging ? 'shadow-lift' : 'shadow-card',
    )}>
      <div className="mb-2 flex items-center gap-2.5 px-1">
        {isNetwork
          ? <Icon name="globe" className="h-4 w-4 shrink-0 text-brand" />
          : <FlagStack codes={place.country_codes} className="text-sm" />}
        <Link to={isNetwork ? '/global' : `/c/${place.slug}`}
          className="min-w-0 flex-1 truncate text-sm font-semibold transition-colors hover:text-brand">
          {place.name}
        </Link>
        <span className="shrink-0 text-[11px] text-smoke">
          {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}
        </span>
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
          <RoomRow key={r.id} to={`${base}/${r.key}`} room={r} last={lastByChannel.get(scopedKey(place, r.key))} />
        ))}
      </div>
    </section>
  )
}

export default function Rooms() {
  const { myCommunities, loading: ctxLoading } = useCommunity()
  const isMobile = useIsMobile()
  const [rooms, setRooms] = useState(null)
  const [lastByChannel, setLastByChannel] = useState(new Map())

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

  // The most recent message in each room, in ONE query rather than one per room.
  // Ordering by created_at and keeping the first per channel is cheaper than a
  // lateral join and, at this table size, indistinguishable in wall clock.
  useEffect(() => {
    if (!rooms?.length) return undefined
    const keys = rooms.map((r) => {
      const place = myCommunities.find((c) => c.id === r.community_id)
      return place ? scopedKey(place, r.key) : null
    }).filter(Boolean)
    if (!keys.length) return undefined
    let alive = true
    supabase.from('messages')
      .select('channel, body, created_at, profiles:sender_id(name, photo_url)')
      .in('channel', keys)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data }) => {
        if (!alive) return
        const map = new Map()
        for (const m of data || []) if (!map.has(m.channel)) map.set(m.channel, m)
        setLastByChannel(map)
      })
    return () => { alive = false }
  }, [rooms, myCommunities])

  const places = useMemo(() => {
    if (!rooms) return []
    return myCommunities
      .map((c) => ({ place: c, rooms: rooms.filter((r) => r.community_id === c.id) }))
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
        <motion.div {...pageFade}>
          {/* The heading arrives with the page rather than sitting there while
              the cards under it animate in - a title that is already still
              while everything below it moves reads as two pages, not one. */}
          <Reveal from="down" className="mb-6">
            {/* NO STRAPLINE. It read "Worldwide is shared by everybody. Each
                market has its own rooms, and nothing posted in one reaches
                another" - a description of how the product is built, told to
                somebody who came here to open a room, on the screen with the
                least room to spare. The cards underneath say all of it by being
                grouped the way they are. */}
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Rooms</h1>
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
            <div className="space-y-4"><Skeleton className="h-44" /><Skeleton className="h-32" /></div>
          ) : places.length === 0 ? (
            <EmptyState
              icon={<Icon name="chat" className="h-7 w-7" />}
              title="No rooms yet"
              hint="Join a market and its rooms appear here."
              action={<Link to="/global/markets" className="btn-primary">Explore markets</Link>}
            />
          ) : (
            /* DRAGGABLE ON A PHONE TOO, and in the SAME order as the desktop
               sidebar - both read `rooms-market-order` from localStorage, so
               dragging UK under Worldwide here is dragging it there. Ethan: "I
               want to be able to drag and reorder cards on mobile too, for
               example for the rooms page, I should be able to drag the UK page
               to the top, below worldwide."
               Reorderable drags from the GRIP only. That is not a limitation
               here, it is the point: every card is also a stack of links, and a
               whole-card drag has to guess between "open this room" and "move
               this market" on every single press. */
            <Reorderable
              items={orderedPlaces}
              getId={(p) => p.place.id}
              onReorder={saveRoomOrder}
              handleLabel="Reorder this market"
              className="flex flex-col gap-4"
              renderItem={({ place, rooms: rs }, { handleProps, dragging }) => (
                <PlaceCard
                  place={place}
                  rooms={rs}
                  lastByChannel={lastByChannel}
                  isNetwork={place.kind === 'network'}
                  handleProps={handleProps}
                  dragging={dragging}
                />
              )}
            />
          )}
        </motion.div>
      </NetworkLayout>
    </NetworkMotion>
  )
}
