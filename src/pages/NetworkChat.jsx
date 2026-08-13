import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCommunity } from '../context/CommunityContext'
import { flagFromIso } from '../components/network/PlaceSwitcher'
import NetworkMotion from '../components/NetworkMotion'
import { ReactionRow, useReactions, RoomSearch, Highlight, MentionMenu } from '../components/network/ChatExtras'
import { ChatSkeleton } from '../components/network/Skeletons'
import Icon from '../components/Icon'
import ChatMedia from '../components/ChatMedia'
import { uploadChatImage, uploadChatVideo } from '../lib/chatMedia'
import { renderMessageBody } from '../lib/richText'
import { broadcastNames } from '../lib/broadcastMentions'
import Reorderable from '../components/network/Reorderable'
import ChatAdminTools from '../components/ChatAdminTools'
import ChatComposer from '../components/ChatComposer'
import IntroInvite from '../components/network/IntroPrompt'
import { textBeforeCaret } from '../lib/richEditor'
import { loadDraft, saveDraft, clearDraft } from '../lib/drafts'
import SeenBy from '../components/SeenBy'
import { Avatar, EmptyState } from '../components/ui'
import { useVisualViewport, useIsMobile } from '../lib/useKeyboardInset'
import { cx, formatMessageTime, messageTimeTitle } from '../lib/utils'
import { SOFT_SPRING } from '../lib/motion'

// Per-market chat. Spain's General, the UK's General and the Worldwide General
// are three separate rooms that happen to share a layout.
//
// HOW THEY ARE KEPT APART, AND WHY IT MATTERS
//
// The live Chat.jsx that 43 creators use every day selects with
// `.eq('channel', 'general')` on a TEXT column. If a Spanish message were
// written with channel='general' it would appear in the UK creators' chat. So
// every chapter room writes a NAMESPACED key, `<slug>:<key>`, which that query
// can never match. Rooms cannot merge by construction, not by care.
//
// Worldwide is the exception and deliberately so: its General IS the existing
// conversation (111 of the platform's 128 messages), so it keeps the bare key
// and shows the real thread rather than an empty room pretending to be it.
//
// MOBILE
//
// This page used to be a plain card with `h-[min(70vh,640px)]`, which on a
// phone means: the room header floats somewhere in the middle of the screen,
// the software keyboard covers the last few messages, and the tab bar sits on
// top of the composer. Chat.jsx solved all of that a while ago with a fixed
// overlay pinned to the visual viewport, and the geometry there is hard-won
// (see the notes in useKeyboardInset). This uses the same geometry rather than
// inventing a second answer that will drift from it.

const scopedKey = (community, key) =>
  community?.kind === 'network' ? key : `${community.slug}:${key}`

// The reader's own order for the market cards in the sidebar. Per device, like
// every other reorderable list here: it is a preference about a layout, not a
// fact about the person, and a round trip to store it would be the tail wagging
// the dog.
const ROOM_ORDER_KEY = 'rooms-market-order'
const loadRoomOrder = () => {
  try { return JSON.parse(localStorage.getItem(ROOM_ORDER_KEY)) || [] } catch { return [] }
}

// MESSAGES THAT ARE A CARD AND NOT A SENTENCE.
//
// THE BUG THIS FIXES. The legacy chat can post a poll, a game event or a
// resource as a message with `body: ''` and an id in `poll_id` /
// `game_event_id` / `resource_id` - the card IS the message, so there is
// deliberately no text. This page only ever rendered body, image and video, so
// every one of those arrived as a row containing an avatar, a name, a timestamp
// and NOTHING: the reported "blank messages from me". And because a blank row
// still gets its reaction affordance, two of them in a row read as "double
// emoji reaction places below the last few messages" - the doubled circles were
// the blank messages, not a duplicated control.
//
// They are rendered as what they are now: a card that says which thing it is
// and goes there. The legacy chat owns voting and playing; this is a reference
// to something that lives somewhere else, and a reference should say so rather
// than pretend to be the thing.
const CARD_KINDS = [
  { idKey: 'poll_id', table: 'polls', select: 'id, question', label: (r) => r?.question, kind: 'Poll', icon: 'chart', to: () => '/chat' },
  { idKey: 'game_event_id', table: 'game_events', select: 'id, title', label: (r) => r?.title, kind: 'Game', icon: 'joystick', to: () => '/game' },
  { idKey: 'resource_id', table: 'resources', select: 'id, title', label: (r) => r?.title, kind: 'From the library', icon: 'book', to: () => '/resources' },
]

// Anything that would make a message worth drawing. A row with none of these is
// not a quiet message, it is a data artefact, and drawing it as an empty bubble
// with a reaction button under it helps nobody.
const hasContent = (m) =>
  !!(m.body?.trim() || m.image_url || m.video_url || m.poll_id || m.game_event_id || m.resource_id)

function AttachedCard({ message, titles }) {
  const spec = CARD_KINDS.find((c) => message[c.idKey])
  if (!spec) return null
  const title = titles.get(`${spec.table}:${message[spec.idKey]}`)
  return (
    <Link
      to={spec.to()}
      className="mt-1 flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2 transition-colors hover:border-brand/40 hover:bg-brand-tint/20"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
        <Icon name={spec.icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-smoke">{spec.kind}</span>
        <span className="block truncate text-sm font-medium">{title || 'Open it'}</span>
      </span>
      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
    </Link>
  )
}

export default function NetworkChat() {
  const { slug, channelKey } = useParams()
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const { bySlug, network, manages, myCommunities, loading: ctxLoading } = useCommunity()

  const community = slug ? bySlug(slug) : network
  const [channels, setChannels] = useState([])
  const [otherRooms, setOtherRooms] = useState([])
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [members, setMembers] = useState([])
  const [mention, setMention] = useState(null) // { query, start } while typing @…
  const [roomOrder, setRoomOrder] = useState(loadRoomOrder)
  const [attachError, setAttachError] = useState('')
  // Titles for poll / game / resource cards, keyed `table:id`.
  const [cardTitles, setCardTitles] = useState(new Map())
  // Which message has its actions revealed by a TAP. On a phone there is no
  // hover, so `group-hover` alone meant the reaction button was permanently
  // invisible and market rooms simply had no reactions on mobile.
  const [actionsFor, setActionsFor] = useState(null)
  // Who has read how far in this room: profile id -> last_read_at. Same
  // `channel_reads` table the legacy chat uses, keyed by the same namespaced
  // channel string these messages are written with, so a market room's receipts
  // can no more mix with another market's than its messages can.
  const [reads, setReads] = useState(new Map())
  // Which admin tool (poll / game / resource) is open, if any.
  const [adminTool, setAdminTool] = useState(null)
  const scrollerRef = useRef(null)
  const composerRef = useRef(null)
  // How many characters of the in-progress "@query" to replace with the chip.
  const mentionLenRef = useRef(0)
  const atBottomRef = useRef(true)

  const { height: vpHeight, offsetTop: vpOffset, keyboardOpen: kbOpen } = useVisualViewport()
  const isMobile = useIsMobile()

  // Same geometry as Chat.jsx, for the same reasons. Closed keyboard: leave the
  // header (4rem) and the tab bar (4.5rem + safe area) alone. Open: take the
  // whole visible viewport, because the header has scrolled away and the tab bar
  // has hidden itself. offsetTop is clamped to >= 0 because iOS reports a
  // negative one during a rubber-band pull, which would ride the overlay up over
  // the header.
  const mobileStyle = isMobile
    ? {
        top: kbOpen ? 0 : '4rem',
        height: kbOpen
          ? `${vpHeight}px`
          : `calc(${vpHeight}px - 4rem - 4.5rem - env(safe-area-inset-bottom))`,
        transform: `translateY(${Math.max(0, vpOffset)}px)`,
        paddingTop: kbOpen ? 'env(safe-area-inset-top)' : undefined,
      }
    : undefined

  useEffect(() => {
    if (!isMobile) return
    document.documentElement.classList.add('overlay-lock')
    return () => document.documentElement.classList.remove('overlay-lock')
  }, [isMobile])

  const active = useMemo(
    () => channels.find((c) => c.key === channelKey) || channels[0] || null,
    [channels, channelKey],
  )

  // Which Worldwide rooms are genuinely live to every creator on the platform.
  //
  // This used to be "all of them", which was right when the network was a week
  // old and wrong now. The live Chat.jsx has a HARD-CODED channel list of
  // general, announcements and content_tips; those three are what 43 creators
  // read every day, and a test message in one reaches all of them. Every other
  // worldwide room is invisible to that app, so posting in it can reach nobody
  // by accident.
  //
  // Keyed on the legacy list rather than on kind, because "is this room live"
  // is a fact about the room, not about the community.
  const LEGACY_LIVE_ROOMS = ['general', 'announcements', 'content_tips']
  const isNetwork = community?.kind === 'network'
  const isLiveWorldwide = isNetwork && active && LEGACY_LIVE_ROOMS.includes(active.key)
  const canPost =
    active && !isLiveWorldwide &&
    (active.post_policy === 'all' || manages(community.id))

  useEffect(() => {
    if (!community) return
    let cancelled = false
    supabase.from('channels')
      .select('id, key, label, hint, icon, visibility, post_policy, position')
      .eq('community_id', community.id).order('position')
      .then(({ data }) => { if (!cancelled) setChannels(data || []) })
    return () => { cancelled = true }
  }, [community])

  // Every room in every OTHER place the viewer belongs to.
  //
  // One query for all of them rather than one per market: the sidebar needs the
  // whole set before it can draw anything, and five sequential round trips to
  // build a nav that is 200px wide is the kind of thing that makes a page feel
  // slow for no reason a user could name.
  //
  // RLS already scopes `channels` to communities you can see, so this cannot
  // leak a market's room list to somebody outside it; the `in` filter is about
  // asking for less, not about permission.
  const otherIds = useMemo(
    () => myCommunities.map((c) => c.id).filter((id) => id !== community?.id),
    [myCommunities, community],
  )

  useEffect(() => {
    if (!otherIds.length) { setOtherRooms([]); return undefined }
    let cancelled = false
    supabase.from('channels')
      .select('id, key, label, icon, visibility, position, community_id')
      .in('community_id', otherIds).order('position')
      .then(({ data }) => { if (!cancelled) setOtherRooms(data || []) })
    return () => { cancelled = true }
  }, [otherIds])

  const load = useCallback(async () => {
    if (!community || !active) return
    setLoading(true)
    const { data } = await supabase
      .from('messages')
      .select('*, profiles:sender_id(id, name, photo_url, is_admin)')
      .eq('channel', scopedKey(community, active.key))
      .eq('deleted', false)
      .order('created_at', { ascending: true })
      .limit(200)
    setMessages(data || [])
    setLoading(false)
  }, [community, active])

  useEffect(() => { load() }, [load])

  // Room members, for @-autocomplete. Scoped to THIS community: @-ing somebody
  // who cannot read the room is a mention that goes nowhere.
  useEffect(() => {
    if (!community) return
    let alive = true
    supabase.from('community_members')
      .select('profile_id, profiles!inner(id, name, photo_url, status, is_test)')
      .eq('community_id', community.id).eq('status', 'active')
      .eq('profiles.status', 'active').eq('profiles.is_test', false)
      .then(({ data }) => {
        if (alive) setMembers((data || []).map((r) => r.profiles))
      })
    return () => { alive = false }
  }, [community])

  // Realtime, filtered on the same namespaced key the reads use so a Spanish
  // message can never arrive in a UK subscriber's stream.
  useEffect(() => {
    if (!community || !active) return
    const key = scopedKey(community, active.key)
    const ch = supabase
      .channel(`net-chat-${key}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel=eq.${key}` },
        async (payload) => {
          const { data } = await supabase
            .from('messages')
            .select('*, profiles:sender_id(id, name, photo_url, is_admin)')
            .eq('id', payload.new.id).single()
          if (data) setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]))
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [community, active])

  // Landing on the newest message, reliably.
  //
  // Setting scrollTop directly beats scrollIntoView on a sentinel inside a flex
  // column, and the re-pins across rAF and timers exist because a room's images
  // and link previews land after the first paint and each one changes the
  // scroll height. The capture-phase listener catches every descendant image,
  // including ones inserted seconds later.
  const pin = useCallback(() => {
    const el = scrollerRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [])

  useLayoutEffect(() => {
    atBottomRef.current = true
    pin()
    const raf = requestAnimationFrame(pin)
    const timers = [60, 200, 500, 1200].map((t) => setTimeout(pin, t))
    const el = scrollerRef.current
    el?.addEventListener('load', pin, true)
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
      el?.removeEventListener('load', pin, true)
    }
  }, [loading, active?.key, community?.id, pin])

  useEffect(() => { pin() }, [messages.length, pin])
  // Reflow when the keyboard opens: the scroller just got shorter, so the
  // message the user was reading has to stay at the bottom.
  useEffect(() => { pin() }, [kbOpen, vpHeight, pin])

  // The titles behind any poll / game / resource cards in this room. One query
  // per kind, only for the kinds actually present, and only when the set of ids
  // changes - a room with no cards in it issues nothing.
  const cardKey = useMemo(
    () => CARD_KINDS.map((c) => messages.map((m) => m[c.idKey]).filter(Boolean).join(',')).join('|'),
    [messages],
  )
  useEffect(() => {
    const groups = CARD_KINDS
      .map((c) => ({ spec: c, ids: [...new Set(messages.map((m) => m[c.idKey]).filter(Boolean))] }))
      .filter((g) => g.ids.length)
    if (!groups.length) return undefined
    let alive = true
    Promise.all(groups.map((g) =>
      supabase.from(g.spec.table).select(g.spec.select).in('id', g.ids)
        .then(({ data }) => (data || []).map((r) => [`${g.spec.table}:${r.id}`, g.spec.label(r)])),
    )).then((pairs) => {
      if (alive) setCardTitles(new Map(pairs.flat()))
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey])

  const messageIds = useMemo(() => messages.map((m) => m.id), [messages])
  const { byMessage: reactionsByMessage, toggle: toggleReaction } = useReactions(messageIds, user?.id)

  // ---- Read receipts ----------------------------------------------------
  //
  // Load the room's existing watermarks, keep them live, and write our own the
  // moment the room is on screen. The write is throttled: a room you scroll
  // through for a minute should not be a minute of upserts.
  const roomKey = community && active ? scopedKey(community, active.key) : null
  // Per-room draft, so a half-written message in Spain's General is still there
  // when you come back from the UK's.
  const draftKey = `net-chat-${roomKey || 'none'}`
  // Names the composer turns into @chips as you type. Admins also get the two
  // broadcast handles, @everyone and @here.
  const mentionNames = useMemo(() => {
    const names = members.map((m) => m.name).filter((n) => n && n.length > 1)
    names.push(...broadcastNames(isAdmin))
    return names.sort((a, b) => b.length - a.length)
  }, [members, isAdmin])

  useEffect(() => {
    if (!roomKey) return undefined
    let alive = true
    supabase.from('channel_reads').select('user_id, last_read_at').eq('channel', roomKey)
      .then(({ data }) => { if (alive) setReads(new Map((data || []).map((r) => [r.user_id, r.last_read_at]))) })
    const ch = supabase.channel(`net-reads-${roomKey}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'channel_reads', filter: `channel=eq.${roomKey}` },
        (payload) => {
          const row = payload.new
          if (row?.user_id) setReads((prev) => new Map(prev).set(row.user_id, row.last_read_at))
        })
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [roomKey])

  const lastReadRef = useRef(0)
  useEffect(() => {
    if (!roomKey || !user?.id || loading || messages.length === 0) return
    const now = Date.now()
    if (now - lastReadRef.current < 2500) return
    lastReadRef.current = now
    const iso = new Date(now).toISOString()
    setReads((prev) => new Map(prev).set(user.id, iso))
    supabase.from('channel_reads')
      .upsert({ channel: roomKey, user_id: user.id, last_read_at: iso }, { onConflict: 'channel,user_id' })
      .then(() => {}, () => {})
  }, [roomKey, user?.id, loading, messages.length])

  // Everyone whose watermark is at or past this message, minus me and the
  // sender. `members` is the room's own roster, so a reader who left the market
  // does not linger in the count.
  const seenBy = useCallback((msg) => {
    if (!msg) return []
    const t = new Date(msg.created_at).getTime()
    return members.filter((mem) => {
      if (mem.id === user?.id || mem.id === msg.sender_id) return false
      const r = reads.get(mem.id)
      return !!r && new Date(r).getTime() >= t
    })
  }, [members, reads, user?.id])

  // Search filters what is already in memory. A room holds 200 messages; a
  // server round trip for this would be slower and would not work offline.
  const visible = useMemo(() => {
    // Rows with nothing in them at all never reach the screen. See `hasContent`.
    const real = messages.filter(hasContent)
    const q = search.trim().toLowerCase()
    if (!q) return real
    return real.filter(
      (m) => m.body?.toLowerCase().includes(q) || m.profiles?.name?.toLowerCase().includes(q),
    )
  }, [messages, search])

  // Typing "@" opens the picker; a space or a match closes it.
  // The composer serialises to markdown on every keystroke, so `body` stays
  // exactly what it always was and send/drafts/search are untouched.
  function onComposerChange(md) {
    setBody(md)
    saveDraft(draftKey, md)
  }

  // An in-progress @mention, read from the caret's own text node rather than
  // from a selectionStart a contentEditable does not have.
  function onComposerInput() {
    const before = textBeforeCaret()
    const m = /(?:^|\s)@([^\s@]{0,30})$/.exec(before)
    if (m) { mentionLenRef.current = m[1].length; setMention({ query: m[1] }) }
    else setMention(null)
  }

  function pickMention(person) {
    composerRef.current?.insertMention(person.name, mentionLenRef.current + 1)
    setMention(null)
  }

  function onScroll(e) {
    const el = e.currentTarget
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function postMessage(fields) {
    const { data, error } = await supabase.from('messages').insert({
      channel: scopedKey(community, active.key),
      channel_id: active.id,
      community_id: community.id,
      sender_id: user.id,
      ...fields,
    }).select('*, profiles:sender_id(id, name, photo_url, is_admin)').single()
    if (!error && data) setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]))
    return { data, error }
  }

  async function send(e) {
    e?.preventDefault?.()
    const text = body.trim()
    if (!text || !canPost || sending) return
    setSending(true)
    setBody('')
    composerRef.current?.clear()
    clearDraft(draftKey)
    atBottomRef.current = true
    await postMessage({ body: text })
    setSending(false)
  }

  // PHOTOS AND VIDEO, IN EVERY ROOM.
  //
  // The market rooms had no attach control at all - the only place on the
  // platform you could send a picture was the legacy UK chat, which made the
  // rooms feel like a downgrade for everybody who moved into one. It reuses
  // `uploadChatImage` / `uploadChatVideo`, so the compression rules are the
  // same ones the live chat has used all along: images are re-encoded to
  // 1280px at quality 0.82 before they leave the device, and video is capped
  // rather than transcoded (there is no reliable in-browser transcoder, so a
  // clear limit beats a silent 200MB upload).
  async function attach(file) {
    if (!file || !canPost || sending) return
    setAttachError('')
    const isVideo = file.type.startsWith('video/')
    setSending(true)
    atBottomRef.current = true
    try {
      const url = isVideo ? await uploadChatVideo(file, user.id) : await uploadChatImage(file, user.id)
      await postMessage(isVideo ? { video_url: url } : { image_url: url })
    } catch (err) {
      setAttachError(err?.message || 'That file could not be sent.')
    }
    setSending(false)
  }

  if (ctxLoading && !community) {
    return <div className="mx-auto w-full max-w-7xl px-4 py-8"><ChatSkeleton /></div>
  }

  if (!community) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <EmptyState icon={<Icon name="pin" className="h-6 w-6" />} title="No such market"
          action={<Link to="/global" className="btn-secondary">Back to Worldwide</Link>} />
      </div>
    )
  }

  const base = slug ? `/c/${slug}/chat` : '/global/chat'
  const flags = (community.country_codes || []).map(flagFromIso).join('')

  // The other places, each with its rooms, Worldwide first and then markets
  // alphabetically. A place with no rooms is dropped rather than rendered as an
  // empty heading.
  const elsewhere = myCommunities
    .filter((c) => c.id !== community.id)
    .map((c) => ({
      ...c,
      flags: (c.country_codes || []).map(flagFromIso).join(''),
      rooms: otherRooms.filter((r) => r.community_id === c.id),
    }))
    .filter((c) => c.rooms.length > 0)
    .sort((a, b) => (b.kind === 'network') - (a.kind === 'network') || a.name.localeCompare(b.name))

  // The saved order, with anything it has not heard of (a market opened since
  // you last dragged) falling in behind at its alphabetical place rather than
  // disappearing.
  function saveRoomOrder(next) {
    const ids = next.map((c) => c.id)
    setRoomOrder(ids)
    try { localStorage.setItem(ROOM_ORDER_KEY, JSON.stringify(ids)) } catch { /* private mode */ }
  }

  const rank = new Map(roomOrder.map((id, i) => [id, i]))
  const orderedElsewhere = [...elsewhere].sort(
    (a, b) => (rank.has(a.id) ? rank.get(a.id) : 1e9) - (rank.has(b.id) ? rank.get(b.id) : 1e9),
  )

  // --------------------------------------------------------------- the room
  const room = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white lg:rounded-card lg:border lg:border-gray-100 lg:shadow-card">
      {/* Room tabs. On mobile these ARE the navigation: the sidebar is a
          desktop-only shape and a stack of full-width room buttons above a
          conversation pushes the conversation off the screen. */}
      <div
        className="flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-gray-100 px-2 pt-2 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={`${community.name} rooms`}
      >
        {channels.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={active?.key === c.key}
            onClick={() => navigate(`${base}/${c.key}`)}
            className={cx(
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-xl px-3.5 py-2 text-sm font-semibold transition-colors',
              active?.key === c.key ? 'bg-brand-tint text-brand' : 'text-smoke hover:bg-cloud hover:text-ink',
            )}
          >
            <Icon name={c.icon || 'chat'} className="h-4 w-4 shrink-0" />
            {c.label}
          </button>
        ))}

        {/* ALL YOUR ROOMS IS A DESTINATION, NOT MORE TABS.
            This strip briefly continued into every other market's rooms, which
            on a 375px screen turned the one piece of navigation above a
            conversation into a horizontal scroller of a dozen near-identical
            names - and the room you were IN scrolled off the left. The other
            markets live on /rooms, which is a page built to group them. One
            tap, and the tab strip stays about the place you are standing in. */}
        {elsewhere.length > 0 && (
          <Link
            to="/rooms"
            className="ml-auto flex shrink-0 items-center gap-1.5 self-center rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-smoke transition-colors active:bg-cloud"
          >
            <Icon name="globe" className="h-3.5 w-3.5" />
            All rooms
          </Link>
        )}
      </div>

      {/* The hint bar doubles as the room's identity on mobile, where the page
          heading is scrolled away.

          THE BAR HAS TO BE TALL ENOUGH FOR THE CONTROL IN IT. It was `py-1` at
          11px, which is a strip about eighteen pixels high, and the search field
          was then squeezed into that - the "very, very cramped" report. The DM
          thread header gives its search real height and reads properly, so this
          matches it: enough room for a 36px field with air round it, and the
          hint text steps up to the same size. */}
      {active && (
        <div className={cx(
          'flex shrink-0 items-center gap-2.5 px-3 py-1.5 text-xs sm:px-4 sm:py-2',
          active.key === 'announcements' ? 'bg-brand-tint font-medium text-brand' : 'bg-cloud/60 text-smoke',
        )}>
          <RoomSearch value={search} onChange={setSearch} count={visible.length} total={messages.length} />
          {!search && (
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{active.label}</span>
              {active.hint && <span className="hidden sm:inline"> · {active.hint}</span>}
            </span>
          )}
        </div>
      )}

      <div ref={scrollerRef} onScroll={onScroll} className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
        {loading ? (
          <ChatSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Icon name="chat" className="h-8 w-8 text-gray-200" />
            <p className="text-sm font-medium">Nothing here yet</p>
            <p className="max-w-xs text-xs text-smoke">
              This room is brand new. It is separate from every other market, so it starts empty.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Icon name="magnifier" className="h-8 w-8 text-gray-200" />
            <p className="text-sm font-medium">No messages match &ldquo;{search}&rdquo;</p>
          </div>
        ) : (
          visible.map((m, i) => {
            const prev = visible[i - 1]
            // Grouping is suppressed while searching: consecutive results are
            // not consecutive messages, so hiding the second author is a lie.
            const grouped = !search && prev && prev.sender_id === m.sender_id
            const reactions = reactionsByMessage.get(m.id) || []
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SOFT_SPRING}
                // Tap a message on a phone to reveal its reaction button, the
                // same bargain the DMs make. Taps on a link, a button or a video
                // are left alone so the tap-to-reveal never eats a real one.
                onClick={(e) => {
                  if (!isMobile) return
                  if (e.target.closest?.('a,button,video,input')) return
                  setActionsFor((cur) => (cur === m.id ? null : m.id))
                }}
                className={cx('group/msg flex gap-3', grouped && '!mt-1')}
              >
                <div className="w-9 shrink-0">
                  {!grouped && <Avatar src={m.profiles?.photo_url} name={m.profiles?.name} size="sm" />}
                </div>
                {/* `relative`: the add-reaction affordance floats over this
                    column's top-right corner rather than reserving a row of
                    empty space under every message. */}
                <div className="relative min-w-0 flex-1">
                  {!grouped && (
                    <p className="mb-0.5 flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold">{m.profiles?.name || 'Someone'}</span>
                      {m.profiles?.is_admin && (
                        <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold text-brand">Team</span>
                      )}
                      <span className="text-[11px] text-smoke" title={messageTimeTitle(m.created_at)}>{formatMessageTime(m.created_at)}</span>
                    </p>
                  )}
                  {/* MARKDOWN, LIKE EVERY OTHER ROOM.
                      This rendered the raw body with nothing but mention
                      highlighting, so a message written with the formatting
                      buttons arrived as literal asterisks and hashes. The
                      legacy chat has parsed this since it shipped; there was
                      never a reason for a market room to be the one place that
                      shows you your own markup. `rich` is unconditional -
                      formatting is open to every creator now, so gating the
                      RENDERER on is_admin would mean a creator's bold text
                      looked broken to everyone including themselves. */}
                  {m.image_url && <ChatMedia url={m.image_url} kind="image" alt={m.body || 'Shared image'} />}
                  {m.video_url && <ChatMedia url={m.video_url} kind="video" />}
                  {m.body && (
                    <p className="whitespace-pre-wrap break-words text-sm text-ink">
                      {search
                        ? <Highlight text={m.body} term={search} />
                        : renderMessageBody(m.body, { rich: true, members })}
                    </p>
                  )}
                  <AttachedCard message={m} titles={cardTitles} />
                  <ReactionRow
                    messageId={m.id}
                    reactions={reactions}
                    myId={user?.id}
                    onToggle={toggleReaction}
                    revealed={actionsFor === m.id}
                  />
                  {/* Read receipts, in the market rooms too. Own messages only
                      (plus the team's full view), exactly as the legacy chat
                      does it: knowing your question landed is the value, and a
                      room where everyone can audit everyone's reading is a room
                      people stop opening. */}
                  {(isAdmin || m.sender_id === user?.id) && (() => {
                    const seen = seenBy(m)
                    return seen.length ? (
                      <div className="mt-0.5 flex">
                        <SeenBy readers={seen} />
                      </div>
                    ) : null
                  })()}
                </div>
              </motion.div>
            )
          })
        )}
      </div>

      {isLiveWorldwide ? (
        <div className="shrink-0 border-t border-gray-100 p-3">
          <p className="rounded-xl bg-cloud px-4 py-3 text-center text-xs text-smoke">
            {active?.label} is a room every creator is already in today. It is read only here so a test
            message cannot reach all of them by accident. The other rooms are open.
          </p>
        </div>
      ) : !canPost ? (
        <div className="shrink-0 border-t border-gray-100 p-3">
          <p className="rounded-xl bg-cloud px-4 py-3 text-center text-xs text-smoke">
            Only the team posts in {active?.label}.
          </p>
        </div>
      ) : (
        <ChatComposer
          ref={composerRef}
          docId={`${community.id}:${active?.key}`}
          initialMd={loadDraft(draftKey)}
          // A one-row composer cannot show a placeholder that wraps, and at
          // 375px "Message Introductions" wrapped and had its second line sliced
          // off - which reads as broken before you have typed anything.
          placeholder={isMobile ? 'Message' : `Message ${active?.label}`}
          ariaLabel={`Message ${active?.label}`}
          mentionNames={mentionNames}
          onChangeMd={onComposerChange}
          onInput={onComposerInput}
          onSend={send}
          canSend={!!body.trim()}
          sending={sending}
          onAttach={attach}
          isAdmin={isAdmin}
          onGame={() => setAdminTool('game')}
          onResource={() => setAdminTool('resource')}
          onPoll={() => setAdminTool('poll')}
          isMobile={isMobile}
          kbOpen={kbOpen}
        >
          {/* THE INTRO INVITATION, IN THE ROOM ITS ANSWER GOES TO.
              It renders nothing anywhere else and nothing once the creator has
              posted an introduction. It opens itself once a session as a card
              over the room; dismiss it and this stays as the way back in. */}
          <IntroInvite community={community} channel={active} canPost={canPost} />

          {attachError && (
            <p role="alert" className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{attachError}</p>
          )}
          {/* @-autocomplete, anchored above the composer. */}
          <AnimatePresence>
            {mention && (
              <MentionMenu
                query={mention.query}
                members={members}
                isAdmin={isAdmin}
                onPick={pickMention}
                onClose={() => setMention(null)}
              />
            )}
          </AnimatePresence>
        </ChatComposer>
      )}
    </div>
  )

  return (
    <NetworkMotion>
      {/* Desktop heading. Hidden on mobile because the overlay covers the area
          it would occupy, and a heading nobody can see still costs layout. */}
      <div className="mx-auto hidden w-full max-w-7xl px-4 pt-8 sm:px-6 lg:block lg:px-8">
        <Link
          to={slug ? `/c/${slug}` : '/global'}
          className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-smoke transition-colors hover:text-brand"
        >
          <Icon name="chevronLeft" className="h-4 w-4" />
          {community.name}
        </Link>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-3xl">
          {flags && <span aria-hidden>{flags}</span>}
          {community.name}
        </h1>
        <p className="mt-1 text-sm text-smoke">
          {isLiveWorldwide
            ? 'The rooms every creator in every market shares.'
            : `Only ${community.name}. Nothing posted here reaches another market.`}
        </p>
      </div>

      <div
        style={mobileStyle}
        className={cx(
          // Mobile: a fixed overlay pinned to the visual viewport so the
          // document never scrolls and the composer hugs the keyboard. Desktop
          // keeps the normal centred card.
          'fixed inset-x-0 flex w-full flex-col',
          kbOpen ? 'z-50' : 'z-20',
          'lg:static lg:inset-auto lg:z-auto lg:mx-auto lg:h-[calc(100vh-11rem)] lg:max-w-7xl lg:translate-y-0 lg:px-8 lg:pb-8 lg:pt-4',
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:items-stretch lg:gap-6">
          {/* Rooms sidebar, desktop only. There is deliberately no market
              switcher on this page: a strip of other markets above a
              conversation makes the room feel like a tab in a directory rather
              than somewhere you are. Leaving is the back link, one target. */}
          {/* TWO CARDS, NOT ONE LIST.
              The top card is where you ARE: this place's rooms, General first.
              The card under it is every other room you belong to, grouped by
              market, so a creator in Worldwide and Spain reaches the Spanish
              General without going back to Spain first, and somebody in every
              market reaches all of them from wherever they happen to be
              standing. It is still not a market switcher: these are rooms you
              are already in, not places to browse. */}
          {/* `focus:outline-none` because Chrome makes any element with
              `overflow-y: auto` keyboard focusable and paints its own grey
              focus ring round the whole region the moment you click inside it -
              which on a column of white cards reads as a box drawn round the
              sidebar. The region stays wheel and keyboard scrollable; only the
              ring goes. */}
          <nav aria-label="Rooms" className="hidden focus:outline-none lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:gap-3 lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden">
            <div className="rounded-card border border-gray-100 bg-white p-2 shadow-card">
              <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-smoke">
                {community.name}
              </p>
              <div className="flex flex-col gap-0.5">
                {channels.map((c) => (
                  <button key={c.id} onClick={() => navigate(`${base}/${c.key}`)}
                    className={cx(
                      'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-200',
                      active?.key === c.key ? 'bg-brand-tint text-brand' : 'text-ink hover:bg-cloud',
                    )}>
                    <Icon name={c.icon || 'chat'}
                      className={cx('h-4 w-4 shrink-0', active?.key === c.key ? 'text-brand' : 'text-smoke')} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.label}</span>
                    {c.key === 'general' && (
                      <span className="shrink-0 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">Main</span>
                    )}
                    {c.visibility === 'staff' && (
                      <span className="shrink-0 rounded-full bg-cloud px-1.5 py-0.5 text-[10px] font-medium text-smoke">Staff</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ONE CARD PER MARKET, IN YOUR ORDER.
                These were sub-headings inside a single "Your other rooms" box,
                which made six markets read as one long undifferentiated list -
                exactly the flat-list problem the /rooms page exists to solve,
                reproduced in the sidebar. Germany is a place. It gets a card.

                And the order is the reader's. Somebody who lives in the
                Portuguese room should not have to scroll past Germany and the
                Nordics to reach it every time, and there is no ordering we
                could pick centrally that would be right for everybody. Drag
                the grip; it is remembered on this device. */}
            {orderedElsewhere.length > 0 && (
              <Reorderable
                items={orderedElsewhere}
                onReorder={saveRoomOrder}
                handleLabel="Reorder this market"
                className="flex flex-col gap-3"
                // The lift lives on the CARD, not on Reorderable's wrapper. A
                // shadow on the wrapper is a shadow at the wrong corner radius,
                // and its four grey arcs poking past the card are what read as
                // an outline down this column.
                renderItem={(place, { handleProps, dragging }) => (
                  <div className={cx(
                    'group rounded-card border bg-white p-2 transition-shadow',
                    dragging ? 'border-brand/40 shadow-lift' : 'border-gray-100 shadow-card',
                  )}>
                    <div className="flex items-center gap-1 px-1 pb-1.5 pt-1">
                      <Link
                        to={place.kind === 'network' ? '/global' : `/c/${place.slug}`}
                        className="flex min-w-0 flex-1 items-center gap-2 text-[11px] font-semibold text-smoke transition-colors hover:text-brand"
                      >
                        <span aria-hidden>{place.flags || '🌍'}</span>
                        <span className="min-w-0 truncate">{place.name}</span>
                      </Link>
                      <span
                        {...handleProps}
                        title="Drag to reorder"
                        className="flex h-6 w-5 shrink-0 items-center justify-center rounded-md text-gray-300 transition-opacity hover:text-smoke focus:opacity-100 focus:outline-none focus-visible:text-brand sm:opacity-40 sm:group-hover:opacity-100"
                      >
                        <Icon name="grip" className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {place.rooms.map((c) => (
                        <Link
                          key={c.id}
                          to={`${place.kind === 'network' ? '/global/chat' : `/c/${place.slug}/chat`}/${c.key}`}
                          className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-ink transition-colors hover:bg-cloud"
                        >
                          <Icon name={c.icon || 'chat'} className="h-3.5 w-3.5 shrink-0 text-smoke" />
                          <span className="min-w-0 flex-1 truncate text-[13px]">{c.label}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              />
            )}
          </nav>

          {room}
        </div>
      </div>

      {/* Poll / game / resource, for admins, in this room like any other. */}
      <ChatAdminTools
        tool={adminTool}
        onClose={() => setAdminTool(null)}
        postCard={(fields) => postMessage({ body: '', ...fields })}
        roomLabel={active?.label ? `#${active.label.toLowerCase()}` : 'this room'}
      />
    </NetworkMotion>
  )
}
