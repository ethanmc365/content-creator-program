import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react'
import { confirm } from '../lib/confirm'
import { loadDraft, saveDraft, clearDraft } from '../lib/drafts'
import { uploadChatImage, uploadChatVideo } from '../lib/chatMedia'
import { Link, NavLink, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, Badge, Modal, Skeleton, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import PollCard from '../components/PollCard'
import GameEventCard from '../components/GameEventCard'
import BirthdayCard from '../components/BirthdayCard'
import ResourceCard from '../components/ResourceCard'
import LeaderboardCard from '../components/LeaderboardCard'
import LinkPreview from '../components/LinkPreview'
import ReactionPill from '../components/ReactionPill'
import ChatMedia from '../components/ChatMedia'
import { CONTINENTS } from '../lib/countries'
import { formatChatTime, cx } from '../lib/utils'
import { renderMessageBody } from '../lib/richText'
import RichEditable from '../components/RichEditable'
import { textBeforeCaret } from '../lib/richEditor'
import { firstUrl } from '../lib/linkPreview'
import { useVisualViewport, useIsMobile } from '../lib/useKeyboardInset'

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

// Admin-only read receipt: a small "Seen by N" chip; hovering (desktop) or
// tapping (mobile) reveals a popup listing the individual creators' names.
function SeenByChip({ names, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const label = names.length <= 12 ? names.join(', ') : `${names.slice(0, 12).join(', ')} +${names.length - 12} more`
  return (
    <span className="group/seen relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        aria-label={`Seen by ${names.length}: ${label}`}
        className="text-[10px] text-gray-400 transition-colors hover:text-smoke"
      >
        Seen by {names.length}
      </button>
      <span
        role="tooltip"
        className={cx(
          'pointer-events-none absolute bottom-full z-30 mb-1.5 w-max max-w-[220px] whitespace-normal rounded-lg bg-ink px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug text-white shadow-lift',
          open ? 'block' : 'hidden group-hover/seen:block',
          align === 'right' ? 'right-0' : 'left-0'
        )}
      >
        {label}
      </span>
    </span>
  )
}

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

const QUICK_EMOJI = ['❤️', '🔥', '😂', '👍', '🎉', '✈️']

const lastReadKey = (channel) => `tryp-chat-last-read-${channel}`

export default function Chat() {
  const { channel = 'general' } = useParams()
  const { user, profile, isAdmin } = useAuth()

  const [messages, setMessages] = useState([])
  const [reactions, setReactions] = useState([]) // all reactions for loaded messages
  const [reads, setReads] = useState(new Map()) // user_id -> last_read_at, for "seen by"
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [pickerFor, setPickerFor] = useState(null) // message id with emoji picker open
  const [actionsFor, setActionsFor] = useState(null) // message id with its action row open (mobile tap)
  const [unread, setUnread] = useState({}) // channel -> bool
  const [attachError, setAttachError] = useState('')
  const [replyTo, setReplyTo] = useState(null)      // message being replied to
  const [typers, setTypers] = useState([])          // others currently typing
  const [atBottom, setAtBottom] = useState(true)    // is the view scrolled to newest
  const [newBelow, setNewBelow] = useState(0)       // unseen messages while scrolled up
  const bottomRef = useRef(null)
  const fileRef = useRef(null)
  const textareaRef = useRef(null)
  // Admins compose on a WYSIWYG contentEditable (RichEditable); creators keep the
  // plain textarea. `body` stays the markdown source of truth for both paths.
  const richRef = useRef(null)
  const mentionQueryLenRef = useRef(0)
  const composerRef = useRef(null)
  const scrollerRef = useRef(null)
  const prevLenRef = useRef(0)
  const atBottomRef = useRef(true)
  const typingChanRef = useRef(null)
  const typingSentRef = useRef(0)
  const typerTimersRef = useRef({})

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
    if (isAdmin) names.push('everyone')
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
        // Admins can @everyone to notify the whole community.
        if (isAdmin && 'everyone'.startsWith(q)) {
          return [{ id: 'everyone', name: 'everyone', everyone: true }, ...people].slice(0, 6)
        }
        return people
      })()
    : []

  // Poll composer (admins, announcements only).
  const [showPoll, setShowPoll] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [creatingPoll, setCreatingPoll] = useState(false)

  // Game-event composer (admins).
  const [showGame, setShowGame] = useState(false)
  const [gameForm, setGameForm] = useState({ title: '', mode: 'flags', region: 'World' })
  const [creatingGame, setCreatingGame] = useState(false)

  // Resource-card composer (admins): pick a library resource to drop in.
  const [showResource, setShowResource] = useState(false)
  const [resourceList, setResourceList] = useState(null)
  const [postingResource, setPostingResource] = useState(false)

  const meta = CHANNELS.find((c) => c.key === channel) ?? CHANNELS[0]
  const canPost = channel !== 'announcements' || isAdmin
  const isMuted = profile?.status === 'muted'
  const pinnedMsg = messages.find((m) => m.pinned && !m.deleted) ?? null

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

  // ---------- Realtime: messages + reactions ----------
  useEffect(() => {
    const sub = supabase
      .channel(`chat-${channel}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel=eq.${channel}` },
        async (payload) => {
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
        (payload) => setReactions((prev) => prev.some((r) => r.id === payload.new.id) ? prev : [...prev, payload.new]))
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
  }, [channel, mergeIncoming])

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
  // (avatars, images, embeds) can finish loading AFTER the first scroll and push
  // content down, stranding the view in the middle. Re-pin across the next few
  // frames and whenever an image inside the history finishes loading, but only
  // while the reader hasn't deliberately scrolled up.
  useLayoutEffect(() => {
    if (loading) return
    const el = scrollerRef.current
    if (!el) return
    const pin = () => { if (atBottomRef.current) el.scrollTop = el.scrollHeight }
    el.scrollTop = el.scrollHeight
    const raf = requestAnimationFrame(pin)
    const timers = [setTimeout(pin, 100), setTimeout(pin, 300), setTimeout(pin, 700)]
    const imgs = Array.from(el.querySelectorAll('img'))
    imgs.forEach((img) => { if (!img.complete) img.addEventListener('load', pin) })
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
      imgs.forEach((img) => img.removeEventListener('load', pin))
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
    } else if (grew) {
      setNewBelow((n) => n + (messages.length - prevLenRef.current))
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
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 90
    atBottomRef.current = near
    setAtBottom(near)
    if (near) setNewBelow(0)
  }, [])

  const jumpToLatest = useCallback(() => {
    setAtBottom(true)
    atBottomRef.current = true
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
  // Build an optimistic bubble that renders instantly (greyed) before the DB
  // round-trip; mergeIncoming swaps it for the real row when it lands.
  const makeOptimistic = (fields) => ({
    id: newTempId(),
    channel,
    sender_id: user.id,
    body: '',
    image_url: null,
    video_url: null,
    reply_to: null,
    created_at: new Date().toISOString(),
    deleted: false,
    pending: true,
    profiles: { id: user.id, name: profile?.name, photo_url: profile?.photo_url, is_admin: isAdmin },
    ...fields,
  })

  const markFailed = (tempId) =>
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)))

  async function send(e) {
    e?.preventDefault?.()
    const text = body.trim()
    if (!text) return
    const replyId = replyTo?.id ?? null
    const temp = makeOptimistic({ body: text, reply_to: replyId })
    setMessages((prev) => [...prev, temp])
    // Clear the composer immediately; keep focus so the mobile keyboard stays up
    // (it only closes when the user taps the chat or swipes the composer down).
    setBody(''); clearDraft('chat-' + channel); setMention(null); setReplyTo(null); stopTyping()
    richRef.current?.clear()
    setAtBottom(true)
    ;(richRef.current ? richRef.current.focus() : textareaRef.current?.focus())
    const { data, error } = await supabase
      .from('messages')
      .insert({ channel, sender_id: user.id, body: text, reply_to: replyId })
      .select('*, profiles:sender_id(id, name, photo_url, is_admin)')
      .single()
    if (error) markFailed(temp.id)
    else mergeIncoming(data)
  }

  // Re-send a bubble that failed the first time (media is already uploaded, so we
  // only re-insert the row).
  async function retrySend(m) {
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, pending: true, failed: false } : x)))
    const { data, error } = await supabase
      .from('messages')
      .insert({ channel, sender_id: user.id, body: m.body, image_url: m.image_url, video_url: m.video_url, reply_to: m.reply_to })
      .select('*, profiles:sender_id(id, name, photo_url, is_admin)')
      .single()
    if (error) markFailed(m.id)
    else mergeIncoming(data)
  }

  // Attach an image OR a video (same button). Shows it instantly from a local
  // URL, uploads in the background (image → compressed via the upload proxy;
  // video → straight to storage), then sends it as a message with any typed text
  // as the caption.
  async function sendAttachment(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setAttachError('')
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)
    const caption = body.trim()
    const replyId = replyTo?.id ?? null
    const localUrl = URL.createObjectURL(file)
    const temp = makeOptimistic(
      isVideo
        ? { video_url: localUrl, reply_to: replyId }
        : { body: caption, image_url: localUrl, reply_to: replyId }
    )
    setMessages((prev) => [...prev, temp])
    if (!isVideo) { setBody(''); clearDraft('chat-' + channel); richRef.current?.clear() }
    setReplyTo(null); setAtBottom(true)
    try {
      const url = isVideo ? await uploadChatVideo(file, user.id) : await uploadChatImage(file, user.id)
      const row = isVideo
        ? { channel, sender_id: user.id, body: '', video_url: url, reply_to: replyId }
        : { channel, sender_id: user.id, body: caption, image_url: url, reply_to: replyId }
      const { data, error } = await supabase
        .from('messages')
        .insert(row)
        .select('*, profiles:sender_id(id, name, photo_url, is_admin)')
        .single()
      if (error) throw new Error(error.message)
      mergeIncoming(data)
    } catch (err) {
      setAttachError(err.message)
      markFailed(temp.id)
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

  // Detect an in-progress "@query" just before the caret to drive autocomplete.
  function onBodyChange(e) {
    const val = e.target.value
    setBody(val)
    saveDraft('chat-' + channel, val)
    if (val.trim()) pingTyping()
    const caret = e.target.selectionStart ?? val.length
    const m = val.slice(0, caret).match(/(?:^|\s)@([^\s@]{0,30})$/)
    setMention(m ? { query: m[1], start: caret - m[1].length - 1 } : null)
  }

  function selectMention(member) {
    const ta = textareaRef.current
    const caret = ta?.selectionStart ?? body.length
    const start = mention?.start ?? caret
    const insert = '@' + member.name + ' '
    const next = body.slice(0, start) + insert + body.slice(caret)
    setBody(next)
    setMention(null)
    const pos = start + insert.length
    requestAnimationFrame(() => { ta?.focus(); ta?.setSelectionRange(pos, pos) })
  }

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
  // Toolbar for the rich composer (bold / italic / heading), driven via the handle.
  function richFormat(kind) {
    const ed = richRef.current
    if (!ed) return
    if (kind === 'heading') {
      const cur = (document.queryCommandValue('formatBlock') || '').toLowerCase()
      ed.exec('formatBlock', cur === 'h1' ? 'p' : 'h1')
    } else ed.exec(kind) // bold | italic
  }
  // Insert a mention: rich composer swaps the typed "@query" for a chip; the
  // textarea path keeps its string-splice behaviour.
  function chooseMention(member) {
    if (isAdmin && richRef.current) {
      richRef.current.insertMention(member.name, mentionQueryLenRef.current + 1)
      setMention(null)
    } else {
      selectMention(member)
    }
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

  // Create a poll: makes the poll + its options, then posts an announcement
  // message that carries it (so it renders inline in the channel).
  async function createPoll(e) {
    e.preventDefault()
    const opts = pollOptions.map((o) => o.trim()).filter(Boolean)
    if (!pollQuestion.trim() || opts.length < 2) return
    setCreatingPoll(true)
    const { data: poll, error } = await supabase
      .from('polls')
      .insert({ question: pollQuestion.trim(), created_by: user.id })
      .select('id')
      .single()
    if (!error && poll) {
      await supabase.from('poll_options').insert(opts.map((label, i) => ({ poll_id: poll.id, label, sort_order: i })))
      // Post the poll card on its own - no preceding text message.
      await supabase.from('messages').insert({
        channel: 'announcements',
        sender_id: user.id,
        body: '',
        poll_id: poll.id,
      })
    }
    setCreatingPoll(false)
    setShowPoll(false)
    setPollQuestion('')
    setPollOptions(['', ''])
  }

  // Create a game event: makes the event, then posts a message carrying its
  // card so creators can launch it from the chat.
  async function createGameEvent(e) {
    e.preventDefault()
    if (!gameForm.title.trim()) return
    setCreatingGame(true)
    const { data: ev, error } = await supabase
      .from('game_events')
      .insert({ title: gameForm.title.trim(), mode: gameForm.mode, region: gameForm.region, created_by: user.id })
      .select('id')
      .single()
    if (!error && ev) {
      // Post the card on its own - no accompanying text message.
      await supabase.from('messages').insert({
        channel,
        sender_id: user.id,
        body: '',
        game_event_id: ev.id,
      })
    }
    setCreatingGame(false)
    setShowGame(false)
    setGameForm({ title: '', mode: 'flags', region: 'World' })
  }

  // Resource cards: open the picker (loading the library on first open), then
  // post the chosen resource as a card-only message into this channel.
  function openResourcePicker() {
    setShowResource(true)
    if (resourceList === null) {
      supabase.from('resources').select('id, title, category').order('created_at', { ascending: false })
        .then(({ data }) => setResourceList(data ?? []))
    }
  }

  async function postResourceCard(resourceId) {
    setPostingResource(true)
    await supabase.from('messages').insert({ channel, sender_id: user.id, body: '', resource_id: resourceId })
    setPostingResource(false)
    setShowResource(false)
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

        {/* Channel hint bar */}
        <div className={cx('shrink-0 px-5 py-1 text-[11px] sm:py-2.5 sm:text-xs', channel === 'announcements' ? 'bg-brand-tint font-medium text-brand' : 'bg-cloud/60 text-smoke')}>
          {meta.hint}
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
          onClick={() => { if (isMobile && kbOpen) textareaRef.current?.blur() }}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:space-y-5 sm:px-8 sm:py-6"
        >
          {loading && (
            <div className="space-y-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-40" /><Skeleton className="h-4 w-3/4" /></div></div>
              ))}
            </div>
          )}

          {!loading && messages.filter((m) => !m.deleted).length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-smoke">
              <Icon name={meta.icon} className="h-10 w-10" />
              <p className="font-semibold text-ink">It's quiet in #{meta.label.toLowerCase()}…</p>
              {canPost && <p className="text-sm text-smoke">Be the one to break the silence!</p>}
            </div>
          )}

          {!loading && messages.map((m) => {
            // Deleted messages simply disappear for everyone.
            if (m.deleted) return null
            const mine = m.sender_id === user.id
            const summary = reactionSummary(m.id)
            const orig = m.reply_to ? messages.find((x) => x.id === m.reply_to) : null
            const onDark = mine && channel !== 'announcements'
            const linkUrl = m.body && !m.image_url && !m.video_url ? firstUrl(m.body) : null
            const showActions = actionsFor === m.id
            return (
              <div key={m.id} id={`msg-${m.id}`} className={cx('group flex gap-3', mine && 'flex-row-reverse', m.pending && 'opacity-60')}>
                <Link to={`/profile/${m.sender_id}`} className="shrink-0 self-end">
                  <Avatar src={m.profiles?.photo_url} name={m.profiles?.name} size="sm" />
                </Link>

                <div
                  className={cx('flex max-w-[78%] flex-col sm:max-w-[65%]', mine ? 'items-end text-right' : 'items-start')}
                  // Tap a message on mobile to reveal its reply / react actions.
                  onClick={(e) => { if (isMobile && !e.target.closest('a,button,video,input')) setActionsFor(showActions ? null : m.id) }}
                >
                  <div className={cx('mb-1 flex items-center gap-2 text-xs', mine && 'flex-row-reverse')}>
                    <span className="text-gray-400">{formatChatTime(m.created_at)}</span>
                    <span className="font-semibold text-ink">{mine ? 'You' : m.profiles?.name}</span>
                    {m.profiles?.is_admin && <Badge tone="light" className="shrink-0 whitespace-nowrap !px-2 !py-0.5">Tryp.com Team</Badge>}
                    {m.pinned && <Icon name="pin" className="h-3.5 w-3.5 shrink-0 text-brand" title="Pinned" />}
                  </div>

                  {(m.body || m.image_url || m.video_url) && (
                    <div
                      className={cx(
                        'relative inline-block whitespace-pre-line rounded-2xl text-left text-sm leading-relaxed',
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
                            'mb-1.5 block w-full rounded-lg border-l-2 px-2.5 py-1 text-left',
                            (m.image_url || m.video_url) && 'mx-0.5 mt-0.5',
                            onDark ? 'border-white/70 bg-white/15' : 'border-brand/60 bg-black/[0.04]'
                          )}
                        >
                          <span className={cx('block text-[11px] font-semibold', onDark ? 'text-white' : 'text-brand')}>
                            {orig ? (orig.sender_id === user.id ? 'You' : orig.profiles?.name) : 'Original message'}
                          </span>
                          <span className={cx('block truncate text-xs', onDark ? 'text-white/80' : 'text-smoke')}>{messagePreview(orig)}</span>
                        </button>
                      )}

                      {m.image_url && <ChatMedia url={m.image_url} kind="image" alt={m.body || 'Shared image'} />}
                      {m.video_url && <ChatMedia url={m.video_url} kind="video" maxW={240} maxH={360} />}
                      {m.body && <span className={cx('block', (m.image_url || m.video_url) && 'px-2.5 py-1.5')}>{renderMessageBody(m.body, { rich: m.profiles?.is_admin, members, onDark })}</span>}
                      {linkUrl && <LinkPreview url={linkUrl} onDark={onDark} />}
                    </div>
                  )}

                  {/* Inline cards: poll / game challenge / birthday (render on their own) */}
                  {m.poll_id && <PollCard pollId={m.poll_id} />}
                  {m.game_event_id && <GameEventCard eventId={m.game_event_id} />}
                  {m.birthday_for && <BirthdayCard creatorId={m.birthday_for} />}
                  {m.resource_id && <ResourceCard resourceId={m.resource_id} />}
                  {m.leaderboard_challenge_id && <LeaderboardCard challengeId={m.leaderboard_challenge_id} />}

                  {m.pending && <p className={cx('mt-0.5 text-[11px] text-gray-400', mine && 'text-right')}>Sending…</p>}
                  {m.failed && (
                    <p className={cx('mt-0.5 text-[11px] text-red-500', mine && 'text-right')}>
                      Couldn't send. <button type="button" onClick={() => retrySend(m)} className="font-semibold underline">Retry</button>
                    </p>
                  )}

                  {/* Reactions + action row (reply / react / moderate / pin). On
                      desktop the actions appear on hover; on mobile, tapping the
                      message reveals them (showActions). */}
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

                    <div className={cx('relative flex items-center gap-1 transition-opacity focus-within:opacity-100 group-hover:opacity-100', showActions ? 'opacity-100' : 'opacity-0')}>
                      {!m.pending && (
                        <button
                          onClick={() => { setReplyTo(m); setActionsFor(null); textareaRef.current?.focus() }}
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
                        <div className={cx('absolute bottom-7 z-20 flex gap-1 rounded-full border border-gray-100 bg-white px-2 py-1.5 shadow-lift', mine ? 'right-0' : 'left-0')}>
                          {QUICK_EMOJI.map((e) => (
                            <button key={e} onClick={() => toggleReaction(m.id, e)} className="rounded-full px-1 text-lg transition-transform hover:scale-125" aria-label={`React ${e}`}>
                              {e}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Read receipts are ADMIN-ONLY: a "Seen by N" count under
                      each message; hover or tap it to see the creators' names. */}
                  {isAdmin && !m.pending && !m.deleted ? (() => {
                    const seen = seenBy(m)
                    if (!seen.length) return null
                    return (
                      <div className={cx('mt-0.5 flex', mine ? 'justify-end' : 'justify-start')}>
                        <SeenByChip names={seen.map((s) => s.name)} align={mine ? 'right' : 'left'} />
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
          {!atBottom && (
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
            {attachError && <p className="mb-2 text-xs text-red-600">{attachError}</p>}
            {/* Admin tools: text formatting + game/resource cards (all channels)
                + poll (announcements). Moved up here so the composer box below
                spans the full width. Creators never see this row. */}
            {isAdmin && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5" role="group" aria-label="Text formatting">
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => richFormat('heading')} title="Heading" aria-label="Heading" className="rounded px-2.5 py-1 text-xs font-bold text-smoke hover:bg-cloud hover:text-ink">H</button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => richFormat('bold')} title="Bold" aria-label="Bold" className="rounded px-2.5 py-1 text-sm font-bold text-smoke hover:bg-cloud hover:text-ink">B</button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => richFormat('italic')} title="Italic" aria-label="Italic" className="rounded px-2.5 py-1 text-sm italic text-smoke hover:bg-cloud hover:text-ink">I</button>
                </div>
                {/* Drop a game challenge card into this channel. */}
                <button type="button" onClick={() => setShowGame(true)} title="Post a game challenge" aria-label="Post a game challenge" className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-smoke hover:bg-cloud hover:text-ink">
                  <Icon name="joystick" className="h-4 w-4" /> <span className="hidden sm:inline">Game</span>
                </button>
                {/* Drop a resource-library card into this channel. */}
                <button type="button" onClick={openResourcePicker} title="Share a resource" aria-label="Share a resource" className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-smoke hover:bg-cloud hover:text-ink">
                  <Icon name="book" className="h-4 w-4" /> <span className="hidden sm:inline">Resource</span>
                </button>
                {channel === 'announcements' && (
                  <button type="button" onClick={() => setShowPoll(true)} className="btn-secondary !py-2 text-xs">
                    <Icon name="poll" className="h-4 w-4" /> Create a poll
                  </button>
                )}
              </div>
            )}
            {/* @mention autocomplete (admins also get @everyone) */}
            {mention && mentionResults.length > 0 && (
              <div className="mb-2 overflow-hidden rounded-card border border-gray-100 bg-white shadow-lift">
                {mentionResults.map((mem) => (
                  <button key={mem.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => chooseMention(mem)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-cloud">
                    {mem.everyone ? (
                      <>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand"><Icon name="megaphone" className="h-4 w-4" /></span>
                        <span className="min-w-0"><span className="block font-medium">@everyone</span><span className="block text-xs text-smoke">Notify the whole community</span></span>
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

            {/* One attach button handles images AND videos. */}
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={sendAttachment} />

            <form onSubmit={send} className="flex items-end gap-2">
              {/* blur() so the global focus-visible ring doesn't stick to the
                  button after the file dialog closes and re-focuses it */}
              <button type="button" onClick={(e) => { e.currentTarget.blur(); fileRef.current?.click() }} className="btn-ghost !px-2.5 !py-3" aria-label="Attach a photo or video" title="Attach a photo or video">
                <Icon name="image" className="h-5 w-5" />
              </button>
              {isAdmin ? (
                <RichEditable
                  ref={richRef}
                  docId={channel}
                  initialMd={loadDraft('chat-' + channel)}
                  inlineOnly
                  mentionNames={memberNames}
                  placeholder="Message…"
                  onChangeMd={onRichChange}
                  onInput={onRichInput}
                  onBlur={stopTyping}
                  className="input max-h-32 flex-1 self-stretch overflow-y-auto"
                  aria-label={`Message ${meta.label}`}
                  onKeyDown={(e) => {
                    if (mention && mentionResults.length) {
                      if (e.key === 'Enter') { e.preventDefault(); chooseMention(mentionResults[0]); return }
                      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return }
                    }
                    if (!isMobile && e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (body.trim()) send(e)
                    }
                  }}
                />
              ) : (
                <textarea
                  ref={textareaRef}
                  rows={1}
                  className="input max-h-32 flex-1 resize-none overflow-y-auto"
                  placeholder="Message…"
                  value={body}
                  onChange={onBodyChange}
                  onBlur={stopTyping}
                  onKeyDown={(e) => {
                    // Mention autocomplete grabs Enter/Escape first.
                    if (mention && mentionResults.length) {
                      if (e.key === 'Enter') { e.preventDefault(); selectMention(mentionResults[0]); return }
                      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return }
                    }
                    // On a laptop, Enter sends and Shift+Enter makes a new line.
                    // On mobile (touch keyboards) Enter is always a newline and
                    // sending is done with the button.
                    if (!isMobile && e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (body.trim()) send(e)
                    }
                  }}
                  aria-label={`Message ${meta.label}`}
                />
              )}
              <button
                type="submit"
                // Prevent the tap from moving focus off the textarea — that blur
                // is what collapsed the keyboard on send. The click/submit still
                // fires; focus (and the keyboard) stay put.
                onMouseDown={(e) => e.preventDefault()}
                disabled={!body.trim()}
                className="btn-primary !px-5"
                aria-label="Send"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3 21l18-9L3 3l3 9zm0 0h6" /></svg>
              </button>
            </form>
            </>
          ) : (
            <p className="rounded-xl bg-cloud px-4 py-3 text-center text-sm text-smoke">
              Only the Tryp.com Team can post announcements. React to show you've seen them!
            </p>
          )}
        </div>
      </div>

      {/* ---------- Create-poll modal ---------- */}
      <Modal open={showPoll} onClose={() => setShowPoll(false)} title="Create a poll">
        <form onSubmit={createPoll} className="space-y-5">
          <div>
            <label htmlFor="poll-q" className="label">Question</label>
            <input id="poll-q" type="text" required className="input" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} placeholder="e.g. Where should our next challenge be?" />
          </div>
          <div>
            <p className="label">Options</p>
            <div className="space-y-2">
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text" className="input" placeholder={`Option ${i + 1}`}
                    value={opt}
                    onChange={(e) => setPollOptions(pollOptions.map((o, j) => (j === i ? e.target.value : o)))}
                  />
                  {pollOptions.length > 2 && (
                    <button type="button" aria-label="Remove option" className="btn-ghost !px-3" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}>✕</button>
                  )}
                </div>
              ))}
            </div>
            {pollOptions.length < 6 && (
              <button type="button" className="btn-secondary mt-2 !py-2 text-xs" onClick={() => setPollOptions([...pollOptions, ''])}>+ Add option</button>
            )}
          </div>
          <button type="submit" disabled={creatingPoll} className="btn-primary w-full">
            {creatingPoll ? <Spinner /> : 'Post poll to announcements'}
          </button>
        </form>
      </Modal>

      {/* ---------- Create-game-event modal ---------- */}
      <Modal open={showGame} onClose={() => setShowGame(false)} title="Post a game challenge">
        <form onSubmit={createGameEvent} className="space-y-5">
          <div>
            <label htmlFor="game-title" className="label">Challenge title</label>
            <input id="game-title" type="text" required className="input" value={gameForm.title} onChange={(e) => setGameForm({ ...gameForm, title: e.target.value })} placeholder="e.g. Friday Flag Frenzy" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="game-mode" className="label">Mode</label>
              <select id="game-mode" className="input" value={gameForm.mode} onChange={(e) => setGameForm({ ...gameForm, mode: e.target.value })}>
                <option value="flags">Guess the flag</option>
                <option value="map">Find on the map</option>
                <option value="airports">Airport codes</option>
                <option value="currencies">Currencies</option>
              </select>
            </div>
            <div>
              <label htmlFor="game-region" className="label">Region</label>
              <select id="game-region" className="input" value={gameForm.region} onChange={(e) => setGameForm({ ...gameForm, region: e.target.value })}>
                <option value="World">World</option>
                {CONTINENTS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={creatingGame} className="btn-primary w-full">
            {creatingGame ? <Spinner /> : `Post to #${meta.label.toLowerCase()}`}
          </button>
        </form>
      </Modal>

      {/* ---------- Share-a-resource modal ---------- */}
      <Modal open={showResource} onClose={() => setShowResource(false)} title="Share a resource">
        <p className="mb-4 text-sm text-smoke">Pick a library resource to post as a card in #{meta.label.toLowerCase()}.</p>
        {resourceList === null ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : resourceList.length === 0 ? (
          <p className="rounded-xl bg-cloud px-4 py-6 text-center text-sm text-smoke">
            No resources yet. Add some in <Link to="/admin/resources" className="font-medium text-brand hover:underline">Manage resources</Link> first.
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {resourceList.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={postingResource}
                onClick={() => postResourceCard(r.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-gray-100 px-4 py-3 text-left transition-colors hover:border-brand hover:bg-brand-tint/40 disabled:opacity-50"
              >
                <Icon name="book" className="h-5 w-5 shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.title}</span>
                  {r.category && <span className="block truncate text-xs text-smoke">{r.category}</span>}
                </span>
                <span className="shrink-0 text-xs font-medium text-brand">Post →</span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
