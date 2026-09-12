import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useCommunity } from './CommunityContext'

// WHICH ROOMS HAVE SOMETHING NEW IN THEM, ANSWERED ONCE FOR THE WHOLE APP.
//
// Ethan: "for the rooms, when there's new chats, for example the romanian
// community, it didn't show up that there were new chats, no one can tell
// there's new messages unless they actually click into it. There should be an
// orange dot pulsing to show that there is new messages that I have not seen
// yet... this should go for every chat with new messages, when the messages are
// read the pulsing orange dot should go away."
//
// THE ANSWER EXISTED AND ONLY ONE SCREEN COULD SEE IT. `Rooms.jsx` already
// computed unread correctly - last message per channel, diffed against the
// `channel_reads` watermark - but it did it in a `useMemo` inside its own
// component, so the moment you were anywhere else (the chat page itself, the
// desktop sidebar, the tab strip over a conversation, the bottom nav) nothing
// on screen knew. And on a desktop `/rooms` REDIRECTS to a conversation, so the
// one surface that had the answer was the one desktop users never see.
//
// So it moves up here, is fetched once, is kept live by realtime, and every
// surface reads the same Set. Three consequences worth naming:
//
//   - ONE SUBSCRIPTION, NOT ONE PER COMPONENT. Four independent components each
//     opening a postgres_changes channel on `messages` is four websocket topics
//     for one question.
//   - READING A ROOM CLEARS IT EVERYWHERE, IMMEDIATELY. `markRead` moves the
//     local watermark before the round trip, so the dot in the sidebar goes out
//     on the same frame the room opens rather than a second later. The chat
//     page still writes the real watermark; this is the optimistic half.
//   - IT IS NEVER CACHED. A stale watermark puts a dot on the room you are
//     looking at, and one wrong dot is all it takes for the signal to stop
//     being believed.
const UnreadContext = createContext(null)

// Worldwide rooms carry the bare key; a market's carry `slug:key`. This is the
// same rule `scopedKey` applies in Rooms.jsx and NetworkChat.jsx, and the three
// must agree or the watermark is written under one string and read under
// another.
export const scopedChannel = (place, key) => (place.kind === 'network' ? key : `${place.slug}:${key}`)

// How long a fresh count is trusted before a burst of inserts is allowed to
// trigger another read. A busy room posts faster than a round trip.
const REFRESH_DEBOUNCE = 1200

export function UnreadProvider({ children }) {
  const { user } = useAuth()
  const { myCommunities, loading: ctxLoading } = useCommunity()
  const [channels, setChannels] = useState(null)
  const [lastByChannel, setLastByChannel] = useState(() => new Map())
  const [readAt, setReadAt] = useState(null)

  const placeIds = useMemo(() => myCommunities.map((c) => c.id), [myCommunities])
  const placeKey = placeIds.join(',')

  // Every room I can post in. Same query the rooms index runs; it is small and
  // it changes about once a quarter.
  useEffect(() => {
    if (ctxLoading || !user?.id) return undefined
    if (!placeIds.length) { setChannels([]); return undefined }
    let alive = true
    supabase.from('channels')
      .select('id, key, label, icon, visibility, position, community_id')
      .in('community_id', placeIds)
      .order('position')
      .then(({ data }) => { if (alive) setChannels(data || []) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey, ctxLoading, user?.id])

  // The namespaced channel string for every room, and the place it belongs to.
  const keyed = useMemo(() => {
    if (!channels) return []
    const byId = new Map(myCommunities.map((c) => [c.id, c]))
    return channels.map((c) => {
      const place = byId.get(c.community_id)
      return place ? { ...c, place, channel: scopedChannel(place, c.key) } : null
    }).filter(Boolean)
  }, [channels, myCommunities])

  const channelList = useMemo(() => keyed.map((r) => r.channel), [keyed])
  const channelSig = channelList.join(',')

  // The newest message in each room, in one query rather than one per room.
  const refresh = useCallback(async () => {
    if (!channelList.length) return
    const { data } = await supabase.from('messages')
      .select('channel, body, created_at, sender_id, image_url, video_url, profiles:sender_id(name, photo_url)')
      .in('channel', channelList)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
      .limit(400)
    const map = new Map()
    for (const m of data || []) if (!map.has(m.channel)) map.set(m.channel, m)
    setLastByChannel(map)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelSig])

  useEffect(() => { refresh() }, [refresh])

  // Where I had read up to, per room.
  useEffect(() => {
    if (!user?.id) return undefined
    let alive = true
    supabase.from('channel_reads')
      .select('channel, last_read_at')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (alive) setReadAt(new Map((data || []).map((r) => [r.channel, r.last_read_at])))
      })
    return () => { alive = false }
  }, [user?.id])

  // LIVE, AND DEBOUNCED. A new message anywhere I can see refreshes the map;
  // the debounce keeps a busy room from firing a query per message. The
  // subscription carries no filter because postgres_changes takes one `eq`
  // filter and the question is "any of these thirty channels".
  const timer = useRef(null)
  useEffect(() => {
    if (!user?.id || !channelList.length) return undefined
    const seen = new Set(channelList)
    const ch = supabase.channel(`unread-rooms-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new
        if (!m?.channel || !seen.has(m.channel)) return
        // Draw the new row straight away rather than waiting on the refetch -
        // the dot is the whole point and it should not take a round trip.
        setLastByChannel((prev) => {
          const next = new Map(prev)
          next.set(m.channel, { ...prev.get(m.channel), ...m })
          return next
        })
        clearTimeout(timer.current)
        timer.current = setTimeout(refresh, REFRESH_DEBOUNCE)
      })
      // Another device of mine reading a room clears it here too.
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'channel_reads', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new
          if (!row?.channel) return
          setReadAt((prev) => new Map(prev ?? []).set(row.channel, row.last_read_at))
        })
      .subscribe()
    return () => { clearTimeout(timer.current); supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, channelSig, refresh])

  // A ROOM IS UNREAD IF SOMEBODY ELSE SPOKE IN IT AFTER I LAST LOOKED.
  //
  // Three rules, each of them a state that would otherwise light a dot for
  // nothing: my own last message never counts (being told a room I just posted
  // in has something new is the fastest way to teach somebody to ignore the
  // dot); a room with no messages is empty, not unread; and never having opened
  // a room that HAS messages IS unread - which is most creators and most rooms,
  // and is exactly the case Ethan is reporting.
  //
  // Held back entirely until the watermarks land, so nothing ever flashes every
  // room as unread on the way in.
  const unread = useMemo(() => {
    const out = new Set()
    if (!readAt) return out
    for (const [channel, last] of lastByChannel) {
      if (!last || last.sender_id === user?.id) continue
      const seen = readAt.get(channel)
      if (!seen || new Date(last.created_at) > new Date(seen)) out.add(channel)
    }
    return out
  }, [lastByChannel, readAt, user?.id])

  // Reading a room, optimistically. The chat page writes the durable watermark
  // (it has to - it knows when the thread actually rendered); this is what puts
  // the dot out on the frame the room opens.
  const markRead = useCallback((channel) => {
    if (!channel) return
    setReadAt((prev) => new Map(prev ?? []).set(channel, new Date().toISOString()))
  }, [])

  // Unread grouped by the place it is in, so a market card can say "3 new"
  // without every caller re-deriving the grouping.
  const unreadByCommunity = useMemo(() => {
    const out = new Map()
    for (const r of keyed) {
      if (!unread.has(r.channel)) continue
      out.set(r.community_id, (out.get(r.community_id) || 0) + 1)
    }
    return out
  }, [keyed, unread])

  const value = useMemo(() => ({
    unread,
    unreadByCommunity,
    lastByChannel,
    rooms: keyed,
    ready: !!readAt && channels !== null,
    markRead,
    refresh,
  }), [unread, unreadByCommunity, lastByChannel, keyed, readAt, channels, markRead, refresh])

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>
}

// Safe outside the provider (the landing page, the auth screens): an empty
// answer rather than a throw, because a dot that cannot be drawn is not an
// error.
const EMPTY = {
  unread: new Set(),
  unreadByCommunity: new Map(),
  lastByChannel: new Map(),
  rooms: [],
  ready: false,
  markRead: () => {},
  refresh: () => {},
}

export function useUnread() {
  return useContext(UnreadContext) || EMPTY
}
