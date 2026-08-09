import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useCommunity } from '../context/CommunityContext'
import NetworkLayout from '../components/network/NetworkLayout'
import NetworkMotion from '../components/NetworkMotion'
import Reveal from '../components/network/Reveal'
import FlagStack from '../components/network/FlagStack'
import Icon from '../components/Icon'
import { Avatar, EmptyState, Skeleton } from '../components/ui'
import { stripMarkup } from '../lib/richText'
import { cx, timeAgo } from '../lib/utils'
import { pageFade } from '../lib/motion'

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

function RoomRow({ to, room, last }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-cloud"
    >
      <span className={cx(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
        room.key === 'general' ? 'bg-brand text-white' : 'bg-brand-tint text-brand',
      )}>
        <Icon name={room.icon || 'chat'} className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{room.label}</span>
          {room.visibility === 'staff' && (
            <span className="shrink-0 rounded-full bg-cloud px-1.5 py-0.5 text-[10px] font-medium text-smoke">Staff</span>
          )}
        </span>
        {/* The last thing said, or what the room is for if nothing has been.
            An empty room that explains itself is an invitation; an empty room
            that says nothing is a dead end. */}
        <span className="mt-0.5 block truncate text-xs text-smoke">
          {last
            ? `${last.profiles?.name?.split(' ')[0] || 'Someone'}: ${stripMarkup(last.body || '')}`
            : room.hint || 'Nothing posted yet'}
        </span>
      </span>
      {last && (
        <span className="shrink-0 text-[11px] text-gray-400">{timeAgo(last.created_at)}</span>
      )}
      {last?.profiles && <Avatar src={last.profiles.photo_url} name={last.profiles.name} size="xs" className="shrink-0" />}
      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  )
}

function PlaceCard({ place, rooms, lastByChannel, isNetwork }) {
  const base = isNetwork ? '/global/chat' : `/c/${place.slug}/chat`
  return (
    <section className={cx(
      'rounded-card border bg-white p-4 shadow-card',
      isNetwork ? 'border-brand/25' : 'border-gray-100',
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
  const { myCommunities, network, loading: ctxLoading } = useCommunity()
  const [rooms, setRooms] = useState(null)
  const [lastByChannel, setLastByChannel] = useState(new Map())

  const placeIds = useMemo(() => myCommunities.map((c) => c.id), [myCommunities])

  useEffect(() => {
    if (!placeIds.length) { setRooms([]); return undefined }
    let alive = true
    supabase.from('channels')
      .select('id, key, label, hint, icon, visibility, position, community_id')
      .in('community_id', placeIds)
      .order('position')
      .then(({ data }) => { if (alive) setRooms(data || []) })
    return () => { alive = false }
  }, [placeIds])

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

  return (
    <NetworkMotion>
      <NetworkLayout width="narrow" switcher={false}>
        <motion.div {...pageFade}>
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Rooms</h1>
            <p className="mt-1.5 text-sm text-smoke">
              {network?.name || 'Worldwide'} is shared by everybody. Each market has its own rooms, and
              nothing posted in one reaches another.
            </p>
          </div>

          {ctxLoading && !rooms ? (
            <div className="space-y-4"><Skeleton className="h-44" /><Skeleton className="h-32" /></div>
          ) : places.length === 0 ? (
            <EmptyState
              icon={<Icon name="chat" className="h-7 w-7" />}
              title="No rooms yet"
              hint="Join a market and its rooms appear here."
              action={<Link to="/global/markets" className="btn-primary">Explore markets</Link>}
            />
          ) : (
            <Reveal className="space-y-4" stagger={0.06}>
              {places.map(({ place, rooms: rs }) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  rooms={rs}
                  lastByChannel={lastByChannel}
                  isNetwork={place.kind === 'network'}
                />
              ))}
            </Reveal>
          )}
        </motion.div>
      </NetworkLayout>
    </NetworkMotion>
  )
}
