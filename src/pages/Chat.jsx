import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react'
import { confirm } from '../lib/confirm'
import { loadDraft, saveDraft, clearDraft } from '../lib/drafts'
import { uploadChatImage, uploadChatVideo } from '../lib/chatMedia'
import { Link, NavLink, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, Badge, Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import { jumpThreshold, distanceFromBottom } from '../lib/scrollJump'
import PollCard from '../components/PollCard'
import GameEventCard from '../components/GameEventCard'
import BirthdayCard from '../components/BirthdayCard'
import ResourceCard from '../components/ResourceCard'
import LeaderboardCard from '../components/LeaderboardCard'
import LinkPreview from '../components/LinkPreview'
import ReactionPill from '../components/ReactionPill'
import ReactionPicker from '../components/ReactionPicker'
import { RoomSearch } from '../components/ChatSearch'
import ChatMedia from '../components/ChatMedia'
import { formatMessageTime, messageTimeTitle, cx } from '../lib/utils'
import { renderMessageBody } from '../lib/richText'
import { broadcastNames, matchBroadcasts } from '../lib/broadcastMentions'
import ChatComposer from '../components/ChatComposer'
import SeenBy from '../components/SeenBy'
import ChatAdminTools from '../components/ChatAdminTools'
import { textBeforeCaret } from '../lib/richEditor'
import { firstUrl } from '../lib/linkPreview'
import { useVisualViewport, useIsMobile } from '../lib/useKeyboardInset'
import MessageEditor from '../components/MessageEditor'
import ReportMessage from '../components/ReportMessage'
import { useNowTick, withinEditWindow } from '../lib/messageActions'
import { playSend, playSendFail, playInbound, playReactionPop } from '../lib/appSounds'
import OutboxNotice from '../components/OutboxNotice'
import { enqueueMessage, queuedFor, subscribeOutbox, onOutboxSent, retryQueued, dropQueued } from '../lib/outbox'

// A short label for a message when it's quoted in a reply.
function messagePreview(m) {
  if (!m) return 'Message unavailable'
  if (m.body) return m.body
  if (m.image_url) return 'Photo'
  if (m.video_url) return 'Video'
  if (m.poll_id) return 'Poll'
  if (m.game_event_id) return 'Game challenge'
  if (m.resource_id) return 'Resource'
  return 'Message'
}

// Media "kind" of a message, used to pair an optimistic bubble with the real row
// once it comes back (its URL changes from a local blob to the storage URL).
function messageKind(m) {
  if (m.video_url) return 'video'
  if (m.image_url) return 'image'
  return 'text'
}

const newTempId = () => `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`

function typingLabel(names) {
  if (names.length === 1) return `${names[0]} is typing…`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
  return 'Several people are typing…'
}

// Real-time community chat - the WhatsApp replacement.
//  * Three channels: #general, #announcements (admin-post-only), #content-tips.
//  * Supabase realtime: new messages and reactions appear instantly.
//  * Emoji reactions, admin moderation (delete message, mute creator).
//  * Admin polls live inside announcement messages.
//  * Unread dots per channel (last-read time kept in localStorage).
const CHANNELS = [
  { key: 'general', label: 'General', icon: 'chat', hint: 'Open chat for everyone' },
  { key: 'announcements', label: 'Announcements', icon: 'megaphone', hint: 'Official channel. Only the Tryp.com Team posts here' },
  { key: 'content_tips', label: 'Content Tips', icon: 'bulb', hint: 'Tips and tricks. Share what works' },
]


const lastReadKey = (channel) => `tryp-chat-last-read-${channel}`

export default function Chat() {
  const { channel = 'general' } = useParams()
  const { user, profile, isAdmin } = useAuth()

  const [messages, setMessages] = useState([])
  const [reactions, setReactions] = useState([]) // all reactions for loaded messages
  const [reads, setReads] = useState(new Map()) // user_id -> last_read_at, for "seen by"
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  // In-channel search. Filters the messages already in memory rather than
  // querying: the channel holds its recent history right here, so a match is
  // instant, works with no connection, and a round trip would be both slower
  // and worse. Same component the network rooms use.
  const [search, setSearch] = useState('')
  const [pickerFor, setPickerFor] = useState(null)
  const [actionsFor, setActionsFor] = useState(null) // message id with its action row open (mobile tap)
  const [editingId, setEditingId] = useState(null)  // message being edited in place
  const [reporting, setReporting] = useState(null)  // message being reported, or null
  // A slow clock, so the Edit button leaves on its own when the five minutes
  // are up. See lib/messageActions for why this is state and not Date.now().
  const nowTick = useNowTick()
  const [unread, setUnread] = useState({}) // channel -> bool
  const [attachError, setAttachError] = useState('')
  const [replyTo, setReplyTo] = useState(null)      // message being replied to
  const [typers, setTypers] = useState([])          // others currently typing
  const [atBottom, setAtBottom] = useState(true)    // is the view scrolled to newest
  // FAR ENOUGH UP TO WANT A WAY BACK. Deliberately NOT `!atBottom`: following
  // new messages and offering the pill are two different questions and they
  // want two different distances. See lib/scrollJump.
  const [farUp, setFarUp] = useState(false)
  const [newBelow, setNewBelow] = useState(0)       // unseen messages while scrolled up
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  // Admins compose on a WYSIWYG contentEditable (RichEditable); creators keep the
  // plain textarea. `body` stays the markdown source of truth for both paths.
  const composerEditorRef = useRef(null)
  const mentionQueryLenRef = useRef(0)
  const composerRef = useRef(null)
  const scrollerRef = useRef(null)
  const prevLenRef = useRef(0)
  const atBottomRef = useRef(true)
  const typingChanRef = useRef(null)
  const typingSentRef = useRef(0)
  const typerTimersRef = useRef({})
  // WHICH MESSAGES IN THIS ROOM ARE YOURS. The reaction subscription is global
  // (see the note on it), so it needs to answer "is this about me?" from inside
  // a realtime callback, where `messages` would be a stale closure and a
  // setState updater would be the wrong place to make a noise.
  const myMessageIdsRef = useRef(new Set())

  // Visual-viewport tracking drives the WhatsApp-style mobile layout: the whole
  // chat is a fixed overlay pinned to the visible area so the composer hugs the
  // keyboard and page chrome collapses away. See useVisualViewport for the iOS
  // reasoning (translateY(offsetTop) + sizing to visualViewport.height).
  const { height: vpHeight, offsetTop: vpOffset, keyboardOpen: kbOpen } = useVisualViewport()
  const isMobile = useIsMobile()

  // Mobile overlay geometry. When the keyboard is closed we leave room for the
  // top header (4rem) and the bottom tab bar (4.5rem + safe area) so both stay
  // usable; when it opens, the overlay takes the full visible viewport (the
  // header scrolls away, the tab bar hides) for maximum typing/reading space.
  const mobileStyle = isMobile
    ? {
        top: kbOpen ? 0 : '4rem',
        height: kbOpen
          ? `${vpHeight}px`
          : `calc(${vpHeight}px - 4rem - 4.5rem - env(safe-area-inset-bottom))`,
        // Clamp to >= 0: on iOS a downward pull at the top makes visualViewport
        // offsetTop go negative, which would ride the overlay UP above the header
        // (the "chat tabs peek above the bar" glitch). Never let it go up.
        transform: `translateY(${Math.max(0, vpOffset)}px)`,
        // When the overlay covers the header (keyboard open) clear the status
        // bar / notch in a standalone PWA; harmless (0) in a browser tab.
        paddingTop: kbOpen ? 'env(safe-area-inset-top)' : undefined,
      }
    : undefined

  // Lock the document while the mobile chat overlay is up so iOS can't
  // rubber-band the page (which dragged the header down / exposed the tabs).
  useEffect(() => {
    if (!isMobile) return
    document.documentElement.classList.add('overlay-lock')
    return () => document.documentElement.classList.remove('overlay-lock')
  }, [isMobile])

  // Members (for @mention autocomplete + rendering mention links).
  const [members, setMembers] = useState([])
  const [mention, setMention] = useState(null) // { query, start } while typing @…
  useEffect(() => {
    supabase.from('profiles').select('id, name, photo_url')
      .in('status', ['active', 'muted']).eq('is_test', false)
      .then(({ data }) => setMembers(data ?? []))
  }, [])
  // Names for seeding @mention chips in the admin rich composer (longest first
  // so "@Anna Smith" wins over "@Anna"). Includes @everyone for admins.
  const memberNames = useMemo(() => {
    const names = members.map((m) => m.name).filter((n) => n && n.length > 1)
    names.push(...broadcastNames(isAdmin))
    return names.sort((a, b) => b.length - a.length)
  }, [members, isAdmin])
  // Reactor names can belong to profiles outside the members list (test
  // accounts, pending applicants, or filtered statuses), so any unknown
  // reactor id gets looked up directly — a reactor should never show as
  // "Someone" while their profile still exists.
  const [extraNames, setExtraNames] = useState(new Map())
  useEffect(() => {
    const known = new Set([...members.map((m) => m.id), ...extraNames.keys()])
    const missing = [...new Set(reactions.map((r) => r.creator_id))].filter((id) => id !== user.id && !known.has(id))
    if (!missing.length) return
    supabase.from('profiles').select('id, name').in('id', missing).then(({ data }) => {
      if (!data?.length) return
      setExtraNames((prev) => {
        const next = new Map(prev)
        for (const p of data) next.set(p.id, p.name)
        return next
      })
    })
  }, [reactions, members, extraNames, user.id])

  const mentionResults = mention
    ? (() => {
        const q = mention.query.toLowerCase()
        const people = members.filter((m) => m.id !== user.id && m.name?.toLowerCase().includes(q)).slice(0, 6)
        // Admins get the two broadcast handles first: they are the ones you go
        // looking for deliberately, and burying them under six near-matching
        // names is how a feature nobody can find gets built.
        const casts = matchBroadcasts(q, isAdmin)
        return [...casts, ...people].slice(0, 6)
      })()
    : []

  // Poll / game / resource composers (admins, EVERY channel). One piece of
  // state: which of the three is open, if any. The forms themselves live in
  // ChatAdminTools so the market rooms get exactly the same three.
  const [adminTool, setAdminTool] = useState(null) // null | 'poll' | 'game' | 'resource'

  const meta = CHANNELS.find((c) => c.key === channel) ?? CHANNELS[0]
  const canPost = channel !== 'announcements' || isAdmin
  const isMuted = profile?.status === 'muted'
  const pinnedMsg = messages.find((m) => m.pinned && !m.deleted) ?? null

  // ---------- The outbox ----------
  // Anything written without signal lives in `src/lib/outbox.js`, not in
  // `messages`, and is READ from there on every change. That is what makes a
  // reload in a tunnel show the message still waiting instead of quietly
  // dropping it: the queue is the record, this is only a view of it.
  const outboxScope = `chat:${channel}`
  const [queued, setQueued] = useState(() => queuedFor(outboxScope))
  // An in-flight UPLOAD, which is the one thing the outbox cannot hold: a File
  // is not something you can put in localStorage and still have tomorrow. So
  // the bubble for a photo lives here until its bytes are somewhere permanent,
  // and only then does the row join the queue.
  const [uploading, setUploading] = useState([])
  useEffect(() => {
    setQueued(queuedFor(outboxScope))
    setUploading([])
    return subscribeOutbox(() => setQueued(queuedFor(outboxScope)))
  }, [outboxScope])

  // What the message list actually renders. Without a search that is simply
  // every message; with one it is the matches, by body or by who wrote it -
  // "what did Jacob say about Lisbon" is one of the two ways anybody looks for
  // an old message, and the other is the words themselves.
  const visibleMessages = useMemo(() => {
    // Queued messages ride on the end, always last and never searchable: they
    // have no server time yet, so there is nowhere else in the order they could
    // honestly go. The filter is the belt to the outbox's braces - realtime can
    // deliver the real row a beat before the insert's own reply gets back here,
    // and for that beat the same message would otherwise be on screen twice.
    const pending = queued
      .filter((i) => !messages.some((m) => m.id === i.id
        || (m.sender_id === user.id && (m.body || '') === (i.display.body || '') && !!m.image_url === !!i.display.image_url)))
      .map((i) => ({ ...i.display, pending: !i.failed, failed: i.failed, queuedId: i.id, tries: i.tries }))
    const q = search.trim().toLowerCase()
    if (!q) return [...messages, ...uploading, ...pending]
    return messages.filter(
      (m) => !m.deleted && (
        (m.body || '').toLowerCase().includes(q) ||
        (m.profiles?.name || '').toLowerCase().includes(q)
      ),
    )
  }, [messages, search, queued, uploading, user.id])

  // ---------- Load history ----------
  const load = useCallback(async () => {
    setLoading(true)
    const { data: msgs } = await supabase
      .from('messages')
      .select('*, profiles:sender_id(id, name, photo_url, is_admin)')
      .eq('channel', channel)
      .order('created_at', { ascending: true })
      .limit(200)
    const ids = (msgs ?? []).map((m) => m.id)
    const [{ data: reacts }, { data: readRows }] = await Promise.all([
      ids.length ? supabase.from('reactions').select('*').in('message_id', ids) : Promise.resolve({ data: [] }),
      supabase.from('channel_reads').select('user_id, last_read_at').eq('channel', channel),
    ])
    setMessages(msgs ?? [])
    setReactions(reacts ?? [])
    setReads(new Map((readRows ?? []).map((r) => [r.user_id, r.last_read_at])))
    setLoading(false)
  }, [channel])

  useEffect(() => { load() }, [load])

  // Merge a real (server) message into state, reconciling it with any matching
  // optimistic bubble so a send never flickers or double-renders. A pending
  // bubble is paired to the real row by sender + media-kind (+ body for text),
  // since sends are awaited one at a time.
  const matchesPending = (t, row) =>
    t.pending && t.sender_id === row.sender_id && messageKind(t) === messageKind(row) &&
    (t.reply_to || null) === (row.reply_to || null) &&
    (messageKind(row) !== 'text' || t.body === row.body)

  const mergeIncoming = useCallback((row) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === row.id)) return prev.filter((m) => !matchesPending(m, row))
      const idx = prev.findIndex((m) => matchesPending(m, row))
      if (idx !== -1) { const copy = [...prev]; copy[idx] = row; return copy }
      return [...prev, row]
    })
  }, [])

  // A queued message that lands anywhere in the app tells everyone; this room
  // only cares about its own. The real row goes in exactly as the outbox drops
  // the item, so the pending bubble is replaced rather than joined.
  useEffect(() => onOutboxSent((item, row) => {
    if (item.scope !== outboxScope || !row) return
    mergeIncoming(row)
  }), [outboxScope, mergeIncoming])

  // THE FAIL SOUND MOVED. It used to fire on the first failed request, which is
  // now the most ordinary thing that can happen: you are in a tunnel and the
  // message is fine. It belongs on the one moment that is genuinely bad news -
  // the outbox has stopped trying - and that is worth interrupting somebody for
  // because by then they have certainly looked away.
  const failedRef = useRef(new Set())
  useEffect(() => {
    for (const item of queued) {
      if (item.failed && !failedRef.current.has(item.id)) { failedRef.current.add(item.id); playSendFail() }
      if (!item.failed) failedRef.current.delete(item.id)
    }
  }, [queued])

  useEffect(() => {
    myMessageIdsRef.current = new Set(messages.filter((m) => m.sender_id === user.id).map((m) => m.id))
  }, [messages, user.id])

  // ---------- Realtime: messages + reactions ----------
  useEffect(() => {
    const sub = supabase
      .channel(`chat-${channel}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel=eq.${channel}` },
        async (payload) => {
          // A TICK, BUT ONLY FOR SOMEBODY ELSE'S, AND ONLY IF YOU ARE HERE.
          //
          // Three conditions, and each one exists because breaking it is
          // annoying rather than merely wrong: your own message already made
          // the send whoosh, a tab in the background is a notification's job
          // and not a sound's, and this subscription is per channel so a
          // message in a room you are not reading never reaches it anyway.
          if (payload.new.sender_id !== user.id && !document.hidden) playInbound()
          // Fetch the sender's profile for the incoming message.
          const { data: sender } = await supabase
            .from('profiles').select('id, name, photo_url, is_admin').eq('id', payload.new.sender_id).single()
          mergeIncoming({ ...payload.new, profiles: sender })
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `channel=eq.${channel}` },
        (payload) => {
          // Moderation: a deleted message disappears for everyone instantly.
          setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m)))
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' },
        (payload) => {
          // A POP, BUT ONLY WHEN IT IS YOUR MESSAGE AND NOT YOUR REACTION.
          // Somebody reacting to somebody else's post is not an event about
          // you, and this table is subscribed globally rather than per channel,
          // so without both checks every reaction anywhere on the platform
          // would make a noise in every open tab.
          //
          // Read from a REF, never from inside a setState updater: an updater
          // has to be pure, and React is free to run it twice.
          if (myMessageIdsRef.current.has(payload.new.message_id)
            && payload.new.creator_id !== user.id && !document.hidden) playReactionPop()
          setReactions((prev) => prev.some((r) => r.id === payload.new.id) ? prev : [...prev, payload.new])
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions' },
        (payload) => setReactions((prev) => prev.filter((r) => r.id !== payload.old.id)))
      // Read receipts: someone's last-read time advanced in this channel.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_reads', filter: `channel=eq.${channel}` },
        (payload) => {
          const row = payload.new
          if (row?.user_id) setReads((prev) => new Map(prev).set(row.user_id, row.last_read_at))
        })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [channel, mergeIncoming, user.id])

  // Reset scroll bookkeeping whenever the channel changes (we always land at the
  // newest message in a freshly opened channel), and restore any saved draft for
  // this channel so a half-written post (e.g. an announcement) isn't lost when
  // you flick to another page and back.
  useEffect(() => {
    prevLenRef.current = 0
    setAtBottom(true)
    setNewBelow(0)
    setBody(loadDraft('chat-' + channel))
  }, [channel])

  // Publish my "last read" for this channel (throttled) so others get a read
  // receipt. RLS silently rejects muted/pending users, which is fine.
  const lastReadUpsertRef = useRef(0)
  const markChannelRead = useCallback(() => {
    const now = Date.now()
    if (now - lastReadUpsertRef.current < 2500) return
    lastReadUpsertRef.current = now
    const iso = new Date().toISOString()
    setReads((prev) => new Map(prev).set(user.id, iso))
    // Supabase query builders are lazy — the request only fires once `.then` is
    // called, so we must chain (not fire-and-forget). Errors (e.g. muted user
    // blocked by RLS) are swallowed on purpose.
    supabase.from('channel_reads')
      .upsert({ channel, user_id: user.id, last_read_at: iso }, { onConflict: 'channel,user_id' })
      .then(() => {}, () => {})
  }, [channel, user.id])

  // Jump the history to the newest message. Setting scrollTop directly is more
  // reliable than scrollIntoView on a sentinel inside this flex/overflow column.
  const scrollToBottom = useCallback((behavior = 'auto') => {
    const el = scrollerRef.current
    if (!el) return
    if (behavior === 'smooth') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    else el.scrollTop = el.scrollHeight
  }, [])

  // Keep a ref of "am I at the bottom" so the media-aware pin below can read it
  // without re-subscribing every scroll.
  useEffect(() => { atBottomRef.current = atBottom }, [atBottom])

  // Landing on a freshly opened channel, pin firmly to the newest message. Media
  // (avatars, message images, async link previews, embeds) can finish loading
  // AFTER the first scroll and push content down, stranding the view in the
  // middle. We re-pin across the next few frames AND whenever any image inside
  // the history loads - `load` doesn't bubble, so we listen in the capture phase,
  // which also catches images inserted later (e.g. link previews that fetch their
  // thumbnail a second or two after paint). Guarded by atBottomRef so it never
  // yanks a reader who has deliberately scrolled up.
  useLayoutEffect(() => {
    if (loading) return
    const el = scrollerRef.current
    if (!el) return
    const pin = () => { if (atBottomRef.current) el.scrollTop = el.scrollHeight }
    el.scrollTop = el.scrollHeight
    const raf = requestAnimationFrame(pin)
    const timers = [setTimeout(pin, 60), setTimeout(pin, 200), setTimeout(pin, 500), setTimeout(pin, 1200)]
    el.addEventListener('load', pin, true) // capture: fires for every descendant <img>, now and later
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
      el.removeEventListener('load', pin, true)
    }
  }, [loading, channel])

  // ---------- Smart auto-scroll + "jump to latest" bookkeeping ----------
  // Only follow new messages when the reader is already at the bottom (or the new
  // message is their own). If they've scrolled up to read history, we leave them
  // put and count the arrivals for the jump-to-latest pill instead.
  useEffect(() => {
    const last = messages[messages.length - 1]
    const grew = messages.length > prevLenRef.current
    const firstPaint = prevLenRef.current === 0
    const mineJustSent = grew && last && last.sender_id === user.id
    // Only auto-scroll when: the reader is already at the bottom, OR a brand-new
    // message just arrived that is THEIR OWN (jump to what they sent), OR it's the
    // first paint. Critically we gate the "mine" case on `grew` — otherwise, when
    // the newest message happens to be yours, EVERY re-run of this effect (e.g.
    // when scrolling up flips `atBottom`) would yank you back down. That was the
    // "can't scroll up, it pulls me to the bottom" bug.
    if (firstPaint || atBottom || mineJustSent) {
      // On first paint jump instantly; otherwise glide. A reader who scrolled up
      // never reaches this branch, so we never fight them.
      scrollToBottom(firstPaint ? 'auto' : 'smooth')
      setNewBelow(0)
      setFarUp(false)
    } else if (grew) {
      setNewBelow((n) => n + (messages.length - prevLenRef.current))
      // Messages arriving BELOW a scrolled-up reader grow `scrollHeight`
      // without firing a scroll event, so the pill would not appear until they
      // happened to move. Re-measure here as well as on scroll.
      setFarUp(distanceFromBottom(scrollerRef.current) > jumpThreshold(scrollerRef.current, 5))
    }
    prevLenRef.current = messages.length
    localStorage.setItem(lastReadKey(channel), new Date().toISOString())
    setUnread((u) => ({ ...u, [channel]: false }))
    // Only register a read receipt when they've actually seen the newest message.
    if (firstPaint || atBottom) markChannelRead()
  }, [messages, channel, atBottom, user.id, markChannelRead, scrollToBottom])

  // Keep the latest message in view when the keyboard opens/closes or the
  // visible viewport resizes (only if we were already following the newest).
  useEffect(() => {
    if (atBottom) scrollToBottom('smooth')
  }, [kbOpen, vpHeight, atBottom, scrollToBottom])

  // Track whether the reader is pinned to the bottom of the history.
  const onScrollMessages = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const gap = distanceFromBottom(el)
    const near = gap < 90
    atBottomRef.current = near
    setAtBottom(near)
    // Measured against the last five rows actually rendered, so "five messages"
    // means the same in a room of one-liners and a room of photos.
    setFarUp(gap > jumpThreshold(el, 5))
    if (near) setNewBelow(0)
  }, [])

  const jumpToLatest = useCallback(() => {
    setAtBottom(true)
    atBottomRef.current = true
    setFarUp(false)
    setNewBelow(0)
    scrollToBottom('smooth')
  }, [scrollToBottom])

  // Flash-highlight and scroll to a quoted original message when its reply is tapped.
  const scrollToMessage = useCallback((id) => {
    const el = document.getElementById(`msg-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-brand', 'ring-offset-2', 'rounded-2xl')
    setTimeout(() => el.classList.remove('ring-2', 'ring-brand', 'ring-offset-2', 'rounded-2xl'), 1300)
  }, [])

  // Auto-grow the composer like WhatsApp: expand with the text up to a few
  // lines, then let it scroll internally instead of pushing the layout.
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`
  }, [body])

  // Mobile composer gestures. The chat is a fixed overlay, so dragging on the
  // (non-scrollable) composer chrome used to make the page body rubber-band,
  // which fired visualViewport scroll events and jittered the overlay — that was
  // the glitch/lag. We swallow those drags so the body can't move, and a downward
  // swipe smoothly dismisses the keyboard (an upward swipe is a no-op).
  //
  // A touch that starts inside the textarea is only left alone when the textarea
  // is ACTUALLY scrollable (multi-line overflow); on a single-line box there's
  // nothing to scroll, so we still swallow the drag — otherwise swiping up on the
  // input bounced the page and shoved the composer up over the messages.
  useEffect(() => {
    const el = composerRef.current
    if (!el || !isMobile) return
    let startY = null
    let letScroll = false
    const onStart = (e) => {
      const inp = e.target.closest?.('textarea, .rt-editor')
      letScroll = !!inp && inp.scrollHeight > inp.clientHeight + 1
      startY = e.touches[0]?.clientY ?? null
    }
    const onMove = (e) => {
      if (letScroll || startY == null) return
      const dy = (e.touches[0]?.clientY ?? startY) - startY
      if (dy > 20) { (textareaRef.current || composerRef.current?.querySelector('.rt-editor'))?.blur(); startY = null }
      // Block the body from scrolling/bouncing under the overlay either way.
      if (e.cancelable) e.preventDefault()
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
    }
  }, [isMobile])

  // ---------- Typing indicators (realtime broadcast, no DB writes) ----------
  useEffect(() => {
    const ch = supabase.channel(`typing-${channel}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (!payload?.id || payload.id === user.id) return
      setTypers((prev) => {
        const rest = prev.filter((p) => p.id !== payload.id)
        return payload.typing ? [...rest, { id: payload.id, name: payload.name || 'Someone' }] : rest
      })
      clearTimeout(typerTimersRef.current[payload.id])
      if (payload.typing) {
        typerTimersRef.current[payload.id] = setTimeout(() => {
          setTypers((prev) => prev.filter((p) => p.id !== payload.id))
        }, 4500)
      }
    }).subscribe()
    typingChanRef.current = ch
    const timers = typerTimersRef.current
    return () => {
      Object.values(timers).forEach(clearTimeout)
      supabase.removeChannel(ch)
      typingChanRef.current = null
      setTypers([])
    }
  }, [channel, user.id])

  const pingTyping = useCallback(() => {
    const now = Date.now()
    if (now - typingSentRef.current < 1500) return
    typingSentRef.current = now
    typingChanRef.current?.send({ type: 'broadcast', event: 'typing', payload: { id: user.id, name: profile?.name, typing: true } })
  }, [user.id, profile?.name])

  const stopTyping = useCallback(() => {
    typingSentRef.current = 0
    typingChanRef.current?.send({ type: 'broadcast', event: 'typing', payload: { id: user.id, name: profile?.name, typing: false } })
  }, [user.id, profile?.name])

  // ---------- Unread dots for the other channels ----------
  useEffect(() => {
    async function checkUnread() {
      const result = {}
      for (const c of CHANNELS) {
        if (c.key === channel) continue
        const lastRead = localStorage.getItem(lastReadKey(c.key)) ?? new Date(0).toISOString()
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('channel', c.key)
          .eq('deleted', false)
          .gt('created_at', lastRead)
        result[c.key] = (count ?? 0) > 0
      }
      setUnread(result)
    }
    checkUnread()
  }, [channel, messages.length])

  // ---------- Actions ----------
  // The bubble the outbox will render on this message's behalf until the real
  // row exists. It carries the profile join by hand because nobody is going to
  // fetch it for us underground.
  const makeOptimistic = (fields) => ({
    channel,
    sender_id: user.id,
    body: '',
    image_url: null,
    video_url: null,
    reply_to: null,
    created_at: new Date().toISOString(),
    deleted: false,
    profiles: { id: user.id, name: profile?.name, photo_url: profile?.photo_url, is_admin: isAdmin },
    ...fields,
  })

  const markUploadFailed = (tempId) => {
    playSendFail()
    setUploading((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)))
  }

  function queueMessage(row, display) {
    return enqueueMessage({
      scope: outboxScope,
      table: 'messages',
      row,
      select: '*, profiles:sender_id(id, name, photo_url, is_admin)',
      display,
    })
  }

  async function send(e) {
    e?.preventDefault?.()
    const text = body.trim()
    if (!text) return
    const replyId = replyTo?.id ?? null
    // On the PRESS, not on the server's answer: the whoosh is the feedback for
    // the press, and a whoosh that arrives 400ms later is a different sound
    // about a different thing. With a queue behind it there may be no answer
    // for an hour, which makes waiting for one even less defensible.
    playSend()
    queueMessage(
      { channel, sender_id: user.id, body: text, reply_to: replyId },
      makeOptimistic({ body: text, reply_to: replyId }),
    )
    // Clear the composer immediately; keep focus so the mobile keyboard stays up
    // (it only closes when the user taps the chat or swipes the composer down).
    setBody(''); clearDraft('chat-' + channel); setMention(null); setReplyTo(null); stopTyping()
    composerEditorRef.current?.clear()
    setAtBottom(true)
    composerEditorRef.current?.focus()
  }

  // Retry is now only ever an upload that died, since a row that will not
  // insert is the outbox's problem and it offers its own retry above the
  // composer. The media is already up, so this is just the row again.
  function retrySend(m) {
    setUploading((prev) => prev.filter((x) => x.id !== m.id))
    queueMessage(
      { channel, sender_id: user.id, body: m.body, image_url: m.image_url, video_url: m.video_url, reply_to: m.reply_to },
      makeOptimistic({ body: m.body, image_url: m.image_url, video_url: m.video_url, reply_to: m.reply_to }),
    )
  }

  // Attach an image OR a video (same button). Shows it instantly from a local
  // URL, uploads in the background (image → compressed via the upload proxy;
  // video → straight to storage), then sends it as a message with any typed text
  // as the caption.
  // The composer owns the file input and hands us the File itself.
  async function sendAttachment(file) {
    if (!file) return
    setAttachError('')
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)
    const caption = body.trim()
    const replyId = replyTo?.id ?? null
    const localUrl = URL.createObjectURL(file)
    // A VIDEO TAKES ITS CAPTION TOO. It used to send `body: ''` and leave what
    // you had typed in the composer, so a clip posted with a line of context
    // arrived without the context. Photos have always carried it; there was
    // never a reason for video to be the exception.
    const temp = {
      ...makeOptimistic(
        isVideo
          ? { body: caption, video_url: localUrl, reply_to: replyId }
          : { body: caption, image_url: localUrl, reply_to: replyId }
      ),
      id: newTempId(),
      pending: true,
    }
    playSend()
    setUploading((prev) => [...prev, temp])
    setBody(''); clearDraft('chat-' + channel); composerEditorRef.current?.clear()
    setReplyTo(null); setAtBottom(true)
    try {
      const url = isVideo ? await uploadChatVideo(file, user.id) : await uploadChatImage(file, user.id)
      const media = isVideo ? { video_url: url } : { image_url: url }
      // The bytes are somewhere permanent now, so the row can be queued and
      // this bubble handed over. The queued display points at the STORAGE url
      // rather than the local blob: a blob URL does not survive the reload the
      // queue exists to survive.
      setUploading((prev) => prev.filter((x) => x.id !== temp.id))
      queueMessage(
        { channel, sender_id: user.id, body: caption, ...media, reply_to: replyId },
        makeOptimistic({ body: caption, ...media, reply_to: replyId }),
      )
    } catch (err) {
      setAttachError(err.message)
      markUploadFailed(temp.id)
    }
  }

  // Pin / unpin (admins only). One pinned message per channel: pinning clears any
  // existing pin first. RLS gates the UPDATE to admins.
  async function togglePin(m) {
    setActionsFor(null)
    if (m.pinned) {
      await supabase.from('messages').update({ pinned: false }).eq('id', m.id)
      return
    }
    await supabase.from('messages').update({ pinned: false }).eq('channel', channel).eq('pinned', true)
    await supabase.from('messages').update({ pinned: true }).eq('id', m.id)
  }

  // `onBodyChange` and `selectMention` lived here to drive the plain textarea
  // composer. That composer is gone - everybody gets the WYSIWYG one now - and
  // the editor has its own caret handling (`onRichChange` / `chooseMention`
  // below), so keeping a second, subtly different implementation of mention
  // detection around was an invitation for the two to drift.

  // ---- Admin WYSIWYG composer (RichEditable) ----
  // The editor serializes to markdown into `body` on every keystroke, so send /
  // drafts / captions all keep working unchanged.
  function onRichChange(md) {
    setBody(md)
    saveDraft('chat-' + channel, md)
    if (md.trim()) pingTyping()
  }
  // Detect an in-progress @mention from the caret's own text node.
  function onRichInput() {
    const before = textBeforeCaret()
    const m = before.match(/(?:^|\s)@([^\s@]{0,30})$/)
    if (m) { mentionQueryLenRef.current = m[1].length; setMention({ query: m[1], start: -1 }) }
    else setMention(null)
  }
  // Insert a mention: the composer swaps the typed "@query" for a chip. No
  // longer gated on isAdmin - there is only one composer now, and gating it
  // meant a creator picking a name from the menu silently did nothing.
  function chooseMention(member) {
    if (!composerEditorRef.current) return
    composerEditorRef.current.insertMention(member.name, mentionQueryLenRef.current + 1)
    setMention(null)
  }

  async function toggleReaction(messageId, emoji) {
    setPickerFor(null)
    const mine = reactions.find((r) => r.message_id === messageId && r.creator_id === user.id && r.emoji === emoji)
    if (mine) await supabase.from('reactions').delete().eq('id', mine.id)
    else await supabase.from('reactions').insert({ message_id: messageId, creator_id: user.id, emoji })
  }

  async function moderateDelete(messageId) {
    if (!await confirm('Delete this message for everyone?')) return
    await supabase.from('messages').update({ deleted: true }).eq('id', messageId)
  }

  async function muteCreator(senderId, name) {
    if (!await confirm(`Mute ${name}? They'll be able to read but not post until unmuted (Admin → Creators).`)) return
    await supabase.from('profiles').update({ status: 'muted' }).eq('id', senderId)
  }

  // Post a card-only message (poll / game / resource) into THIS channel.
  // Handed to ChatAdminTools, which owns the three forms; all this side knows
  // is what "a message in this room" means here.
  async function postCard(fields) {
    await supabase.from('messages').insert({ channel, sender_id: user.id, body: '', ...fields })
  }

  // Resolve a reactor's display name for the "who reacted" popup ("You" for me).
  const memberName = useCallback((id) => {
    if (id === user.id) return 'You'
    return members.find((m) => m.id === id)?.name ?? extraNames.get(id) ?? 'Someone'
  }, [members, extraNames, user.id])

  // Members who have read up to (at least) a given message, for its "seen by"
  // row. Excludes me and the sender. Driven by channel_reads timestamps.
  function seenBy(msg) {
    if (!msg) return []
    const t = new Date(msg.created_at).getTime()
    const out = []
    for (const mem of members) {
      if (mem.id === user.id || mem.id === msg.sender_id) continue
      const r = reads.get(mem.id)
      if (r && new Date(r).getTime() >= t) out.push(mem)
    }
    return out
  }

  // Group reactions per message: { '❤️': { count, mine, ids: [...] } }
  function reactionSummary(messageId) {
    const grouped = {}
    for (const r of reactions.filter((x) => x.message_id === messageId)) {
      grouped[r.emoji] = grouped[r.emoji] || { count: 0, mine: false, ids: [] }
      grouped[r.emoji].count++
      grouped[r.emoji].ids.push(r.creator_id)
      if (r.creator_id === user.id) grouped[r.emoji].mine = true
    }
    return grouped
  }

  return (
    <div
      style={mobileStyle}
      className={cx(
        // Mobile/tablet: a fixed overlay pinned to the visual viewport (geometry
        // in mobileStyle) so the document never scrolls and the composer hugs
        // the keyboard. Desktop keeps the normal centered card.
        'fixed inset-x-0 mx-auto flex w-full max-w-6xl flex-col sm:px-8',
        // While typing the overlay goes full-screen and sits ABOVE the header so
        // it can cover it; otherwise it sits BELOW the header (z-20) so the
        // header's bell/avatar dropdowns stay tappable over the chat.
        kbOpen ? 'z-50' : 'z-20',
        'lg:static lg:inset-auto lg:bottom-auto lg:z-auto lg:h-[calc(100vh-4rem)] lg:translate-y-0 lg:py-6'
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white sm:rounded-card sm:border sm:border-gray-100 sm:shadow-card">
        {/* ---------- Channel tabs ---------- */}
        <div className="flex shrink-0 items-stretch gap-1 border-b border-gray-100 px-2 pt-2 sm:px-5 sm:pt-3" role="tablist" aria-label="Chat channels">
          {CHANNELS.map((c) => (
            <NavLink
              key={c.key}
              to={`/chat/${c.key}`}
              role="tab"
              aria-selected={channel === c.key}
              title={c.label}
              className={cx(
                'relative flex flex-1 items-center justify-center gap-1.5 rounded-t-xl px-2 py-2 text-xs font-semibold transition-colors sm:flex-none sm:px-4 sm:py-2.5 sm:text-sm',
                channel === c.key ? 'bg-brand-tint text-brand' : 'text-smoke hover:bg-cloud hover:text-ink'
              )}
            >
              <Icon name={c.icon} className="h-4 w-4 shrink-0" />
              <span className="truncate">{c.label}</span>
              {unread[c.key] && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-brand sm:right-1 sm:top-1" aria-label="Unread messages" />}
            </NavLink>
          ))}
        </div>

        {/* Channel hint bar, which doubles as the search bar. The hint is a
            sentence you read once; the row it sits in is otherwise empty, and
            a channel with a few hundred messages in it needs a way to find
            the one you remember. */}
        <div className={cx('flex shrink-0 items-center gap-2 px-5 py-1 text-[11px] sm:py-2 sm:text-xs', channel === 'announcements' ? 'bg-brand-tint font-medium text-brand' : 'bg-cloud/60 text-smoke')}>
          {!search && <span className="min-w-0 flex-1 truncate">{meta.hint}</span>}
          <RoomSearch
            value={search}
            onChange={setSearch}
            count={visibleMessages.length}
            total={messages.filter((m) => !m.deleted).length}
          />
        </div>

        {/* Pinned message bar (admins pin one per channel; everyone sees it). */}
        {pinnedMsg && (
          <div className="flex shrink-0 items-center gap-2 border-b border-brand/15 bg-brand-tint/60 px-4 py-2 sm:px-8">
            <Icon name="pin" className="h-4 w-4 shrink-0 text-brand" />
            <button type="button" onClick={() => scrollToMessage(pinnedMsg.id)} className="min-w-0 flex-1 text-left">
              <span className="block text-[11px] font-semibold text-brand">Pinned{pinnedMsg.profiles?.name ? ` · ${pinnedMsg.profiles.name}` : ''}</span>
              <span className="block truncate text-xs text-ink">{messagePreview(pinnedMsg)}</span>
            </button>
            {isAdmin && (
              <button type="button" onClick={() => togglePin(pinnedMsg)} aria-label="Unpin message" title="Unpin" className="shrink-0 rounded-full p-1 text-smoke hover:bg-white hover:text-ink">
                <Icon name="ban" className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* ---------- Messages ---------- */}
        <div
          ref={scrollerRef}
          onScroll={onScrollMessages}
          // Tapping the chat dismisses the keyboard (WhatsApp-style). A scroll
          // drag doesn't fire click, so scrolling the history leaves it up.
          onClick={() => { if (isMobile && kbOpen) document.activeElement?.blur?.() }}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y touch-pinch-zoom px-4 py-4 sm:space-y-5 sm:px-8 sm:py-6"
        >
          {loading && (
            <div className="space-y-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-40" /><Skeleton className="h-4 w-3/4" /></div></div>
              ))}
            </div>
          )}

          {!loading && search && visibleMessages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-smoke">
              <Icon name="magnifier" className="h-8 w-8" />
              <p className="font-semibold text-ink">Nothing matches "{search}"</p>
              <p className="text-sm">Only the messages loaded in this channel are searched.</p>
            </div>
          )}

          {!loading && !search && messages.filter((m) => !m.deleted).length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-smoke">
              <Icon name={meta.icon} className="h-10 w-10" />
              <p className="font-semibold text-ink">It's quiet in #{meta.label.toLowerCase()}…</p>
              {canPost && <p className="text-sm text-smoke">Be the one to break the silence!</p>}
            </div>
          )}

          {!loading && visibleMessages.map((m) => {
            // Deleted messages simply disappear for everyone.
            if (m.deleted) return null
            const mine = m.sender_id === user.id
            const summary = reactionSummary(m.id)
            const orig = m.reply_to ? messages.find((x) => x.id === m.reply_to) : null
            const onDark = mine && channel !== 'announcements'
            const linkUrl = m.body && !m.image_url && !m.video_url ? firstUrl(m.body) : null
            const showActions = actionsFor === m.id
            return (
              <div
                key={m.id}
                id={`msg-${m.id}`}
                data-msg
                className={cx(
                  'group flex gap-3',
                  mine && 'flex-row-reverse',
                  m.pending && 'opacity-60',
                  // Bring the row with an open popover forward. See the note in
                  // Messages.jsx: any row carrying a filled transform is its own
                  // stacking context, so the next message wins on paint order.
                  (showActions || pickerFor === m.id) && 'relative z-20',
                )}
              >
                <Link to={`/profile/${m.sender_id}`} className="shrink-0 self-end">
                  <Avatar src={m.profiles?.photo_url} name={m.profiles?.name} size="sm" />
                </Link>

                <div
                  // min-w-0 matters: a flex item defaults to min-width:auto, so
                  // without it a wide child can push the column past max-w.
                  // `relative` because the action toolbar is now absolutely
                  // positioned against this column - see the note on it below.
                  className={cx('relative flex min-w-0 max-w-[78%] flex-col sm:max-w-[65%]', mine ? 'items-end text-right' : 'items-start')}
                  // Tap a message on mobile to reveal its reply / react actions.
                  onClick={(e) => { if (isMobile && !e.target.closest('a,button,video,input')) setActionsFor(showActions ? null : m.id) }}
                >
                  <div className={cx('mb-1 flex items-center gap-2 text-xs', mine && 'flex-row-reverse')}>
                    <span className="text-gray-400" title={messageTimeTitle(m.created_at)}>{formatMessageTime(m.created_at)}</span>
                    {/* AN EDITED MESSAGE SAYS SO. This is the whole reason
                        editing is safe to ship: without the marker, a record of
                        a conversation stops being a record. */}
                    {m.edited_at && (
                      <span className="text-gray-400" title={`Edited ${messageTimeTitle(m.edited_at)}`}>· edited</span>
                    )}
                    <span className="font-semibold text-ink">{mine ? 'You' : m.profiles?.name}</span>
                    {m.profiles?.is_admin && <Badge tone="light" className="shrink-0 whitespace-nowrap !px-2 !py-0.5">Tryp.com Team</Badge>}
                    {m.pinned && <Icon name="pin" className="h-3.5 w-3.5 shrink-0 text-brand" title="Pinned" />}
                  </div>

                  {(m.body || m.image_url || m.video_url) && (
                    <div
                      className={cx(
                        'relative inline-block max-w-full whitespace-pre-line break-words rounded-2xl text-left text-sm leading-relaxed',
                        (m.image_url || m.video_url) ? 'overflow-hidden p-1.5' : 'px-4 py-2.5',
                        channel === 'announcements'
                          ? 'border border-brand/20 bg-brand-tint text-ink'
                          : mine
                            ? 'bg-brand text-white'
                            : 'bg-cloud text-ink'
                      )}
                    >
                      {/* Quoted reply */}
                      {m.reply_to && (
                        <button
                          type="button"
                          onClick={() => orig && scrollToMessage(orig.id)}
                          className={cx(
                            'mb-1.5 block w-full max-w-full overflow-hidden rounded-lg border-l-2 px-2.5 py-1 text-left',
                            (m.image_url || m.video_url) && 'mx-0.5 mt-0.5',
                            onDark ? 'border-white/70 bg-white/15' : 'border-brand/60 bg-black/[0.04]'
                          )}
                        >
                          <span className={cx('block truncate text-[11px] font-semibold', onDark ? 'text-white' : 'text-brand')}>
                            {orig ? (orig.sender_id === user.id ? 'You' : orig.profiles?.name) : 'Original message'}
                          </span>
                          {/* line-clamp, NOT truncate: truncate sets white-space:nowrap, which
                              makes this preview's min-content width the whole quoted line. The
                              bubble is shrink-to-fit, so that min-content won the sizing race
                              and a reply to a long message stretched way off screen. Clamping a
                              WRAPPING line keeps min-content down to one word. */}
                          <span className={cx('line-clamp-1 text-xs [overflow-wrap:anywhere]', onDark ? 'text-white/80' : 'text-smoke')}>{messagePreview(orig)}</span>
                        </button>
                      )}

                      {m.image_url && <ChatMedia url={m.image_url} kind="image" alt={m.body || 'Shared image'} />}
                      {m.video_url && <ChatMedia url={m.video_url} kind="video" />}
                      {/* `rich` is UNCONDITIONAL. It was gated on the sender being
                          an admin, from when formatting was an admin tool - but the
                          formatting row has been open to every creator for a while
                          now, so a creator who pressed B watched their own message
                          arrive as **like this**, and so did everybody else. Gating
                          the renderer on who wrote it can only ever make somebody's
                          own text look broken to them. */}
                      {editingId === m.id ? (
                        <span className={cx('block', (m.image_url || m.video_url) && 'px-2.5 py-1.5')}>
                          <MessageEditor
                            kind="channel"
                            message={m}
                            onDark={onDark}
                            onCancel={() => setEditingId(null)}
                            onSaved={(next) => {
                              setMessages((cur) => cur.map((x) => (x.id === next.id ? { ...x, body: next.body, edited_at: next.edited_at } : x)))
                              setEditingId(null)
                            }}
                          />
                        </span>
                      ) : (
                        m.body && <span className={cx('block', (m.image_url || m.video_url) && 'px-2.5 py-1.5')}>{renderMessageBody(m.body, { rich: true, members, onDark })}</span>
                      )}
                      {linkUrl && <LinkPreview url={linkUrl} onDark={onDark} />}
                    </div>
                  )}

                  {/* Inline cards: poll / game challenge / birthday (render on their own) */}
                  {m.poll_id && <PollCard pollId={m.poll_id} />}
                  {m.game_event_id && <GameEventCard eventId={m.game_event_id} />}
                  {m.birthday_for && <BirthdayCard creatorId={m.birthday_for} />}
                  {m.resource_id && <ResourceCard resourceId={m.resource_id} />}
                  {m.leaderboard_challenge_id && <LeaderboardCard challengeId={m.leaderboard_challenge_id} />}

                  {/* "Sending" only while that is true. Once a try has come
                      back with nothing, the message is waiting, and the bubble
                      says so rather than spinning a lie at somebody on a train. */}
                  {m.pending && (
                    <p className={cx('mt-0.5 text-[11px] text-gray-400', mine && 'text-right')}>
                      {m.tries > 0 ? 'Waiting for signal' : 'Sending…'}
                    </p>
                  )}
                  {m.failed && (
                    <p className={cx('mt-0.5 text-[11px] text-smoke', mine && 'text-right')}>
                      Not sent yet.{' '}
                      <button
                        type="button"
                        onClick={() => (m.queuedId ? retryQueued(m.queuedId) : retrySend(m))}
                        className="font-semibold text-brand underline"
                      >
                        Retry
                      </button>
                      {m.queuedId && (
                        <>
                          {' · '}
                          <button type="button" onClick={() => dropQueued(m.queuedId)} className="font-semibold underline">Discard</button>
                        </>
                      )}
                    </p>
                  )}

                  {/* Reactions stay IN FLOW - they are content, they belong to
                      the message and they should push what is under them down. */}
                  {Object.keys(summary).length > 0 && (
                    <div className={cx('mt-1 flex flex-wrap items-center gap-1', mine && 'justify-end')}>
                      {Object.entries(summary).map(([emoji, info]) => (
                        <ReactionPill
                          key={emoji}
                          emoji={emoji}
                          count={info.count}
                          mine={info.mine}
                          names={info.ids.map(memberName)}
                          onToggle={() => toggleReaction(m.id, emoji)}
                          align={mine ? 'right' : 'left'}
                        />
                      ))}
                    </div>
                  )}

                  {/* THE ACTION ROW FLOATS. IT USED TO RESERVE ITS OWN HEIGHT.
                      Reply / react / pin / delete were an `opacity-0` row sitting
                      in the flow, and opacity does not remove a box - so every
                      message carried an invisible 26px strip under it whether or
                      not anybody ever hovered. On desktop that is a suspicious
                      gap; on a phone, where the row only appears when you TAP a
                      message, it meant "Seen by 4" hovered somewhere below the
                      bubble with nothing between them. That is the reported
                      floating "seen by".
                      Now it is absolutely positioned into the free half of the
                      meta line - the side the name is NOT on - so it costs no
                      layout at all, and the seen-by row sits directly under the
                      bubble where it belongs. */}
                  <div
                    className={cx(
                      // IT SITS ON THE BOTTOM EDGE OF THE MESSAGE.
                      //
                      // It has been three places now and each move fixed the
                      // last one. Inside the top corner it covered the words
                      // ("the reaction and reply buttons cover the top right
                      // half of the message"). Straddling the TOP edge it sat
                      // level with the timestamp and the author's name, which
                      // is the point your eye STARTS at, not the point you
                      // finish at and decide to react. On the bottom edge it is
                      // where the message ends, which is where the decision
                      // happens, and it is the nearest control to your thumb on
                      // a phone rather than the furthest.
                      //
                      // Still absolute, so it costs no layout: an `opacity-0`
                      // row in the flow would put an invisible strip under
                      // every single message, which is the gap this design has
                      // been avoiding from the start.
                      'absolute bottom-0 z-10 flex translate-y-1/2 items-center gap-1 rounded-full border border-gray-100 bg-white/95 px-1 py-0.5 shadow-card backdrop-blur transition-opacity',
                      mine ? 'left-0' : 'right-0',
                      showActions
                        ? 'opacity-100'
                        : 'pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100',
                    )}
                  >
                      {!m.pending && (
                        <button
                          onClick={() => { setReplyTo(m); setActionsFor(null); composerEditorRef.current?.focus() }}
                          aria-label="Reply"
                          title="Reply"
                          className="rounded-full border border-gray-200 p-1 text-smoke hover:border-brand hover:text-brand"
                        >
                          <Icon name="reply" className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                        aria-label="Add reaction"
                        className="rounded-full border border-gray-200 p-1 text-smoke hover:border-brand hover:text-brand"
                      >
                        <Icon name="smile" className="h-4 w-4" />
                      </button>
                      {/* EDIT YOUR OWN, FOR FIVE MINUTES. Only drawn while the
                          window is genuinely open, so the button is never a
                          promise the server then refuses. */}
                      {mine && !m.pending && !m.deleted && withinEditWindow(m.created_at, nowTick) && (
                        <button
                          onClick={() => { setEditingId(m.id); setActionsFor(null) }}
                          aria-label="Edit message"
                          title="Edit (5 minutes)"
                          className="rounded-full border border-gray-200 p-1 text-smoke hover:border-brand hover:text-brand"
                        >
                          <Icon name="pencil" className="h-4 w-4" />
                        </button>
                      )}
                      {/* REPORT SOMEBODY ELSE'S. Not on your own message and not
                          on the team's - an admin who wants a colleague's
                          message gone can simply delete it. */}
                      {!mine && !m.pending && (
                        <button
                          onClick={() => { setReporting(m); setActionsFor(null) }}
                          aria-label="Report message"
                          title="Report to the team"
                          className="rounded-full border border-gray-200 p-1 text-smoke hover:border-red-300 hover:text-red-500"
                        >
                          <Icon name="flag" className="h-4 w-4" />
                        </button>
                      )}
                      {isAdmin && !m.pending && (
                        <>
                          <button onClick={() => togglePin(m)} aria-label={m.pinned ? 'Unpin message' : 'Pin message'} title={m.pinned ? 'Unpin' : 'Pin'} className={cx('rounded-full border p-1', m.pinned ? 'border-brand bg-brand-tint text-brand' : 'border-gray-200 text-smoke hover:border-brand hover:text-brand')}><Icon name="pin" className="h-4 w-4" /></button>
                          <button onClick={() => moderateDelete(m.id)} aria-label="Delete message" className="rounded-full border border-gray-200 p-1 text-smoke hover:border-red-300 hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
                          {!mine && !m.profiles?.is_admin && (
                            <button onClick={() => muteCreator(m.sender_id, m.profiles?.name)} aria-label="Mute creator" className="rounded-full border border-gray-200 p-1 text-smoke hover:border-red-300 hover:text-red-500"><Icon name="mute" className="h-4 w-4" /></button>
                          )}
                        </>
                      )}
                      {pickerFor === m.id && (
                        <>
                          {/* Backdrop. Without one the only way out of the
                              picker is to react with something. */}
                          <div className="fixed inset-0 z-20" onClick={() => setPickerFor(null)} />
                          <ReactionPicker
                            // The ROW's side, not the message's. For somebody
                            // else's message the row is at the right edge, so a
                            // panel anchored left grew straight off the screen.
                            align={mine ? 'left' : 'right'}
                            onPick={(e) => toggleReaction(m.id, e)}
                            onClose={() => setPickerFor(null)}
                          />
                        </>
                      )}
                  </div>

                  {/* Read receipts, for EVERYONE now, not just admins.
                      They were admin-only out of caution when they shipped, and
                      the caution was misplaced: the value of "seen by 12" is
                      knowing your message landed, and that is worth more to the
                      creator who posted a question into a quiet room than to the
                      team. Only shown on YOUR OWN messages though - who read
                      somebody else's post is their business, not yours, and a
                      room where everybody can audit everybody's reading is a
                      room people stop opening. Admins keep the full view,
                      because moderating needs it. */}
                  {(isAdmin || mine) && !m.pending && !m.deleted ? (() => {
                    const seen = seenBy(m)
                    if (!seen.length) return null
                    return (
                      <div className={cx('mt-0.5 flex', mine ? 'justify-end' : 'justify-start')}>
                        <SeenBy readers={seen} align={mine ? 'right' : 'left'} />
                      </div>
                    )
                  })() : null}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Typing indicator + jump-to-latest pill float just above the composer. */}
        <div className="relative">
          {typers.length > 0 && (
            <div className="pointer-events-none absolute -top-6 left-4 flex items-center gap-1.5 text-xs text-smoke sm:left-8">
              <span className="flex gap-0.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-smoke [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-smoke [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-smoke" />
              </span>
              <span className="italic">{typingLabel(typers.map((t) => t.name))}</span>
            </div>
          )}
          {farUp && (
            <div className="pointer-events-none absolute -top-14 inset-x-0 z-10 flex justify-center">
              <button
                type="button"
                onClick={jumpToLatest}
                className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white shadow-lift transition-transform hover:scale-105 active:scale-95"
              >
                {newBelow > 0 ? `${newBelow} new message${newBelow === 1 ? '' : 's'}` : 'Jump to latest'}
                <Icon name="arrow-down" className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* ---------- Composer ---------- */}
        <div ref={composerRef} className="shrink-0 border-t border-gray-100 px-4 py-2.5 sm:px-8 sm:py-4">
          {isMuted ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-700">
              You've been muted by the team. You can read but not post. Questions? DM an admin.
            </p>
          ) : canPost ? (
            <>
            <OutboxNotice scope={outboxScope} />
            {attachError && <p className="mb-2 text-xs text-red-600">{attachError}</p>}
            {/* FORMATTING IS FOR EVERYONE; the rest of this row is not.
                Heading, bold and italic were admin-only on the theory that
                creators would not need them, which was wrong: they ask
                questions, share links and write their own mini-briefs all day.
                Posting a game card, a resource card or a poll IS an admin
                action - those write to shared library rows - so those stay
                behind the check. One row, two audiences. */}
            <ChatComposer
              ref={composerEditorRef}
              docId={channel}
              initialMd={loadDraft('chat-' + channel)}
              placeholder="Message…"
              ariaLabel={`Message ${meta.label}`}
              mentionNames={memberNames}
              onChangeMd={onRichChange}
              onInput={onRichInput}
              onBlur={stopTyping}
              onKeyDown={(e) => {
                if (mention && mentionResults.length) {
                  if (e.key === 'Enter') { e.preventDefault(); chooseMention(mentionResults[0]); return }
                  if (e.key === 'Escape') { e.preventDefault(); setMention(null) }
                }
              }}
              onSend={send}
              canSend={!!body.trim()}
              onAttach={sendAttachment}
              isAdmin={isAdmin}
              onGame={() => setAdminTool('game')}
              onResource={() => setAdminTool('resource')}
              onPoll={() => setAdminTool('poll')}
              isMobile={isMobile}
              kbOpen={kbOpen}
              className="!border-t-0 !px-0 !py-0"
            >
              {attachError && <p className="mb-2 text-xs text-red-600">{attachError}</p>}
              {/* @mention autocomplete (admins also get @everyone and @here) */}
              {mention && mentionResults.length > 0 && (
                <div className="mb-2 overflow-hidden rounded-card border border-gray-100 bg-white shadow-lift">
                  {mentionResults.map((mem) => (
                    <button key={mem.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => chooseMention(mem)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-cloud">
                      {mem.broadcast ? (
                        <>
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand"><Icon name="megaphone" className="h-4 w-4" /></span>
                          <span className="min-w-0"><span className="block font-medium">{mem.label}</span><span className="block text-xs text-smoke">{mem.hint}</span></span>
                        </>
                      ) : (
                        <>
                          <Avatar src={mem.photo_url} name={mem.name} size="sm" />
                          <span className="font-medium">{mem.name}</span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {/* Reply preview: what you're replying to, with a cancel button. */}
              {replyTo && (
                <div className="mb-2 flex items-center gap-2 rounded-xl border-l-2 border-brand bg-cloud/70 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-brand">
                      Replying to {replyTo.sender_id === user.id ? 'yourself' : replyTo.profiles?.name}
                    </p>
                    <p className="truncate text-xs text-smoke">{messagePreview(replyTo)}</p>
                  </div>
                  <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="rounded-full p-1 text-smoke hover:bg-white hover:text-ink">
                    <Icon name="ban" className="h-4 w-4" />
                  </button>
                </div>
              )}
            </ChatComposer>
            </>
          ) : (
            <p className="rounded-xl bg-cloud px-4 py-3 text-center text-sm text-smoke">
              Only the Tryp.com Team can post announcements. React to show you've seen them!
            </p>
          )}
        </div>
      </div>

      {/* Poll / game / resource, for admins, in every channel. */}
      <ChatAdminTools
        tool={adminTool}
        onClose={() => setAdminTool(null)}
        postCard={postCard}
        roomLabel={`#${meta.label.toLowerCase()}`}
      />

      <ReportMessage
        open={!!reporting}
        kind="channel"
        messageId={reporting?.id}
        authorName={reporting?.profiles?.name}
        authorPhoto={reporting?.profiles?.photo_url}
        sentAt={reporting?.created_at}
        // The BODY, not `messagePreview`: the snapshot draws its own "this was
        // a photo" row off the urls, so passing the string "Photo" as the body
        // would put the word Photo in the message and the thumbnail beneath it.
        preview={reporting?.body || ''}
        imageUrl={reporting?.image_url}
        videoUrl={reporting?.video_url}
        onClose={() => setReporting(null)}
      />
    </div>
  )
}
