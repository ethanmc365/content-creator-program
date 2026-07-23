import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { confirm } from '../lib/confirm'
import { loadDraft, saveDraft, clearDraft } from '../lib/drafts'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { uploadDmImage, uploadDmVideo, signDmImages, isSignedDmPath } from '../lib/chatMedia'
import { loadRelationship } from '../lib/connections'
import { Avatar, Badge, EmptyState, Skeleton, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import ChatMedia from '../components/ChatMedia'
import ReactionPill from '../components/ReactionPill'
import { mediaType } from '../lib/media'
import { formatChatTime, otherParticipant, cx } from '../lib/utils'
import { useVisualViewport, useIsMobile } from '../lib/useKeyboardInset'

const QUICK_EMOJI = ['❤️', '🔥', '😂', '👍', '🎉', '✈️']

// A short label for a DM when it's quoted in a reply.
function dmPreview(m) {
  if (!m) return 'Message unavailable'
  if (m.body) return m.body
  if (m.image_url) return mediaType(m.image_url) === 'video' ? 'Video' : 'Photo'
  return 'Message'
}

// Direct messages: inbox (conversation list) + active thread, both realtime.
// On mobile you see one panel at a time; on desktop they sit side by side.
export default function Messages() {
  const { conversationId } = useParams()
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [conversations, setConversations] = useState([]) // enriched with profile + unread
  const [thread, setThread] = useState([])
  const [reactions, setReactions] = useState([]) // dm_reactions for the open thread
  const [pickerFor, setPickerFor] = useState(null) // message id with emoji picker open
  const [actionsFor, setActionsFor] = useState(null) // message id with actions revealed (mobile tap)
  const [replyTo, setReplyTo] = useState(null)     // message being replied to
  const [loadingList, setLoadingList] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [attachError, setAttachError] = useState('')
  const [activeRelation, setActiveRelation] = useState(null)
  // path -> short-lived signed URL, for DM images in the private dm-media bucket.
  const [signedUrls, setSignedUrls] = useState(new Map())
  // Scroll bookkeeping so the thread only follows new messages when you're
  // already at the bottom (mirrors #general), with a jump-to-latest pill.
  const [atBottom, setAtBottom] = useState(true)
  const [newBelow, setNewBelow] = useState(0)
  const bottomRef = useRef(null)
  const scrollerRef = useRef(null)
  const prevLenRef = useRef(0)
  const atBottomRef = useRef(true)
  const fileRef = useRef(null)
  const taRef = useRef(null)
  const composerRef = useRef(null)

  // Visual-viewport tracking drives the WhatsApp-style mobile layout: the whole
  // thread becomes a fixed overlay pinned to the visible area so the composer
  // hugs the keyboard, the person you're messaging stays pinned at the top, and
  // the app header + bottom tab bar collapse away while typing. Same approach as
  // the #general chat (see useVisualViewport for the iOS reasoning).
  const { height: vpHeight, offsetTop: vpOffset, keyboardOpen: kbOpen } = useVisualViewport()
  const isMobile = useIsMobile()

  // Mobile overlay geometry. Keyboard closed: leave room for the top header
  // (4rem) and the bottom tab bar (4.5rem + safe area). Keyboard open: take the
  // full visible viewport so the header + tabs are hidden until it closes.
  const mobileStyle = isMobile
    ? {
        top: kbOpen ? 0 : '4rem',
        height: kbOpen
          ? `${vpHeight}px`
          : `calc(${vpHeight}px - 4rem - 4.5rem - env(safe-area-inset-bottom))`,
        // Clamp to >= 0: on iOS a downward pull at the top makes offsetTop go
        // negative, which would ride the overlay up above the header.
        transform: `translateY(${Math.max(0, vpOffset)}px)`,
        paddingTop: kbOpen ? 'env(safe-area-inset-top)' : undefined,
      }
    : undefined

  // Lock the document while the mobile DM overlay is up so iOS can't rubber-band
  // the page (which dragged the header down / exposed content above it).
  useEffect(() => {
    if (!isMobile) return
    document.documentElement.classList.add('overlay-lock')
    return () => document.documentElement.classList.remove('overlay-lock')
  }, [isMobile])

  const active = conversations.find((c) => c.id === conversationId)
  const otherId = active?.other?.id

  // DM gating: a non-connection may send only until the other person replies
  // (a reply auto-connects them). Connected / admins have no limit.
  const iSentCount = thread.filter((m) => m.sender_id === user.id).length
  const theyReplied = !!otherId && thread.some((m) => m.sender_id === otherId)
  const connected = activeRelation?.relation === 'connected'
  const dmLocked = !isAdmin && !!otherId && !connected && iSentCount >= 1 && !theyReplied

  // Load the connection status for the open conversation.
  useEffect(() => {
    if (!otherId) { setActiveRelation(null); return }
    let cancelled = false
    loadRelationship(user.id, otherId).then((r) => { if (!cancelled) setActiveRelation(r) })
    return () => { cancelled = true }
  }, [otherId, user.id, thread.length])

  // ---------- Inbox ----------
  const loadConversations = useCallback(async () => {
    const { data: convos } = await supabase
      .from('conversations')
      .select('*')
      .order('last_message_at', { ascending: false })
    if (!convos?.length) {
      setConversations([])
      setLoadingList(false)
      return
    }
    // Pull the other participant's profile + my unread count per conversation.
    const otherIds = convos.map((c) => otherParticipant(c, user.id))
    const [{ data: profiles }, { data: unreadMsgs }] = await Promise.all([
      supabase.from('profiles').select('id, name, photo_url, is_admin, bio').in('id', otherIds),
      supabase.from('direct_messages').select('id, conversation_id').eq('recipient_id', user.id).eq('read', false),
    ])
    const profileById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))
    const unreadByConvo = {}
    for (const m of unreadMsgs ?? []) unreadByConvo[m.conversation_id] = (unreadByConvo[m.conversation_id] || 0) + 1

    setConversations(
      convos.map((c) => ({
        ...c,
        other: profileById[otherParticipant(c, user.id)],
        unread: unreadByConvo[c.id] || 0,
      }))
    )
    setLoadingList(false)
  }, [user.id])

  useEffect(() => { loadConversations() }, [loadConversations])

  // Restore any half-written draft when the open conversation changes, so a
  // message you started isn't lost when you flick away to check something.
  useEffect(() => {
    setBody(loadDraft(conversationId ? 'dm-' + conversationId : ''))
  }, [conversationId])

  // ---------- Active thread ----------
  useEffect(() => {
    if (!conversationId) return
    let cancelled = false
    async function loadThread() {
      setLoadingThread(true)
      const { data } = await supabase
        .from('direct_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      if (cancelled) return
      setThread(data ?? [])
      // Load reactions for the thread (silently no-ops if the table isn't there yet).
      const ids = (data ?? []).map((m) => m.id)
      if (ids.length) {
        const { data: reacts } = await supabase.from('dm_reactions').select('*').in('message_id', ids)
        if (!cancelled) setReactions(reacts ?? [])
      } else if (!cancelled) {
        setReactions([])
      }
      setLoadingThread(false)
      // Mark everything they sent me as read.
      await supabase
        .from('direct_messages')
        .update({ read: true })
        .eq('conversation_id', conversationId)
        .eq('recipient_id', user.id)
        .eq('read', false)
      loadConversations() // refresh unread badges
    }
    loadThread()
    return () => { cancelled = true }
  }, [conversationId, user.id, loadConversations])

  // ---------- Realtime: new DMs in any of my conversations ----------
  useEffect(() => {
    const sub = supabase
      .channel(`dms-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, async (payload) => {
        const msg = payload.new
        // Only react to messages I can see (mine or to me).
        if (msg.sender_id !== user.id && msg.recipient_id !== user.id) return
        if (msg.conversation_id === conversationId) {
          setThread((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
          // I'm looking at this thread - mark it read immediately.
          if (msg.recipient_id === user.id) {
            await supabase.from('direct_messages').update({ read: true }).eq('id', msg.id)
          }
        }
        loadConversations()
      })
      // Admin moderation: a deleted DM disappears for both participants instantly.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'direct_messages' }, (payload) => {
        setThread((prev) => prev.filter((m) => m.id !== payload.old.id))
      })
      // Reactions on messages in the open thread appear instantly for both people.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_reactions' }, (payload) => {
        setThread((cur) => {
          if (cur.some((m) => m.id === payload.new.message_id)) {
            setReactions((prev) => (prev.some((r) => r.id === payload.new.id) ? prev : [...prev, payload.new]))
          }
          return cur
        })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'dm_reactions' }, (payload) => {
        setReactions((prev) => prev.filter((r) => r.id !== payload.old.id))
      })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [user.id, conversationId, loadConversations])

  // ---------- Typing indicator (realtime broadcast, no DB writes) ----------
  const [otherTyping, setOtherTyping] = useState(false)
  const typingChanRef = useRef(null)
  const typingSentRef = useRef(0)
  const typingTimerRef = useRef(null)
  useEffect(() => {
    setOtherTyping(false)
    if (!conversationId) return
    const ch = supabase.channel(`dm-typing-${conversationId}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (!payload || payload.id === user.id) return
      setOtherTyping(!!payload.typing)
      clearTimeout(typingTimerRef.current)
      if (payload.typing) typingTimerRef.current = setTimeout(() => setOtherTyping(false), 4500)
    }).subscribe()
    typingChanRef.current = ch
    return () => {
      clearTimeout(typingTimerRef.current)
      supabase.removeChannel(ch)
      typingChanRef.current = null
      setOtherTyping(false)
    }
  }, [conversationId, user.id])

  const pingTyping = useCallback(() => {
    const now = Date.now()
    if (now - typingSentRef.current < 1500) return
    typingSentRef.current = now
    typingChanRef.current?.send({ type: 'broadcast', event: 'typing', payload: { id: user.id, typing: true } })
  }, [user.id])
  const stopTyping = useCallback(() => {
    typingSentRef.current = 0
    typingChanRef.current?.send({ type: 'broadcast', event: 'typing', payload: { id: user.id, typing: false } })
  }, [user.id])

  // ---------- Admin: long-press a message to delete it for everyone ----------
  async function deleteDm(m) {
    if (!isAdmin) return
    if (!await confirm('Delete this message for everyone?')) return
    setThread((prev) => prev.filter((x) => x.id !== m.id))
    await supabase.from('direct_messages').delete().eq('id', m.id)
  }

  // Accept a pending connection request from the person I'm messaging, right in
  // the thread (smooths the gated-DM flow: accepting connects us and unlocks it).
  async function acceptConnection() {
    if (!activeRelation?.rowId) return
    const { error } = await supabase.from('connections').update({ status: 'accepted' }).eq('id', activeRelation.rowId)
    if (!error) setActiveRelation((r) => (r ? { ...r, relation: 'connected' } : r))
  }

  // ---------- Reactions ----------
  // Add / remove my reaction to a DM (same UX as #general).
  async function toggleReaction(messageId, emoji) {
    setPickerFor(null)
    setActionsFor(null)
    const mine = reactions.find((r) => r.message_id === messageId && r.creator_id === user.id && r.emoji === emoji)
    if (mine) {
      setReactions((prev) => prev.filter((r) => r.id !== mine.id))
      await supabase.from('dm_reactions').delete().eq('id', mine.id)
    } else {
      const { data } = await supabase
        .from('dm_reactions')
        .insert({ message_id: messageId, creator_id: user.id, emoji })
        .select('*')
        .single()
      if (data) setReactions((prev) => (prev.some((r) => r.id === data.id) ? prev : [...prev, data]))
    }
  }

  // Only two people in a DM, so a reactor is either me or the other participant.
  const reactorName = useCallback((id) => {
    if (id === user.id) return 'You'
    if (id === active?.other?.id) return active?.other?.name ?? 'Them'
    return 'Someone'
  }, [user.id, active?.other?.id, active?.other?.name])

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

  // Flash-highlight and scroll to a quoted original message when its reply is tapped.
  const scrollToMessage = useCallback((id) => {
    const el = document.getElementById(`dm-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-brand', 'ring-offset-2', 'rounded-2xl')
    setTimeout(() => el.classList.remove('ring-2', 'ring-brand', 'ring-offset-2', 'rounded-2xl'), 1300)
  }, [])

  // ---------- Anyone: long-press a conversation to delete it entirely ----------
  const convTimer = useRef(null)
  const convLongPressed = useRef(false)
  async function deleteConversation(c) {
    if (!await confirm(`Delete your conversation with ${c.other?.name ?? 'this creator'}? This removes the whole thread.`)) return
    setConversations((prev) => prev.filter((x) => x.id !== c.id))
    if (c.id === conversationId) navigate('/messages')
    await supabase.from('conversations').delete().eq('id', c.id)
  }
  const startConvPress = (c) => { convTimer.current = setTimeout(() => { convLongPressed.current = true; deleteConversation(c) }, 550) }
  const cancelConvPress = () => clearTimeout(convTimer.current)

  // Reset scroll bookkeeping when the open conversation changes (we always land
  // at the newest message in a freshly opened thread).
  useEffect(() => {
    prevLenRef.current = 0
    setAtBottom(true)
    setNewBelow(0)
    setReplyTo(null)
    setPickerFor(null)
    setActionsFor(null)
  }, [conversationId])

  // Jump the thread to the newest message. Setting scrollTop directly is more
  // reliable than scrollIntoView on a sentinel inside this flex/overflow column.
  const scrollToBottom = useCallback((behavior = 'auto') => {
    const el = scrollerRef.current
    if (!el) return
    if (behavior === 'smooth') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    else el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => { atBottomRef.current = atBottom }, [atBottom])

  // Opening a conversation, pin firmly to the newest message. Media (avatars,
  // images, video) can finish loading AFTER the first scroll and push content
  // down, stranding the view in the middle. Re-pin across the next few frames and
  // whenever an image finishes loading, while the reader hasn't scrolled up.
  useLayoutEffect(() => {
    if (loadingThread || !conversationId) return
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
  }, [loadingThread, conversationId])

  // Smart auto-scroll + "jump to latest" bookkeeping (same as #general): only
  // follow new messages when the reader is already at the bottom, or the new
  // message is their own. If they've scrolled up to read history, leave them put
  // and count arrivals for the jump-to-latest pill instead.
  useEffect(() => {
    const last = thread[thread.length - 1]
    const grew = thread.length > prevLenRef.current
    const firstPaint = prevLenRef.current === 0
    const mineJustSent = grew && last && last.sender_id === user.id
    if (firstPaint || atBottom || mineJustSent) {
      scrollToBottom(firstPaint ? 'auto' : 'smooth')
      setNewBelow(0)
    } else if (grew) {
      setNewBelow((n) => n + (thread.length - prevLenRef.current))
    }
    prevLenRef.current = thread.length
  }, [thread, atBottom, user.id, scrollToBottom])

  // Keep the latest message visible as the keyboard opens/closes or the visible
  // viewport resizes (only if we were already following the newest).
  useEffect(() => {
    if (atBottom) scrollToBottom('smooth')
  }, [kbOpen, vpHeight, atBottom, scrollToBottom])

  // Auto-grow the composer like WhatsApp, capped before it scrolls internally.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`
  }, [body])

  // Track whether the reader is pinned to the bottom of the thread.
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

  // Mobile composer gestures (same as #general). The thread is a fixed overlay,
  // so a drag on the composer chrome used to rubber-band the page body under it,
  // firing visualViewport scroll events that made the whole screen shake/jitter.
  // We swallow those drags so the body can't move, and a downward swipe smoothly
  // dismisses the keyboard. A touch that starts inside the textarea is left alone
  // ONLY when the textarea is actually scrollable (a multi-line message you've
  // typed), so you can still scroll through what you've written.
  useEffect(() => {
    const el = composerRef.current
    if (!el || !isMobile) return
    let startY = null
    let letScroll = false
    const onStart = (e) => {
      const ta = e.target.closest?.('textarea')
      letScroll = !!ta && ta.scrollHeight > ta.clientHeight + 1
      startY = e.touches[0]?.clientY ?? null
    }
    const onMove = (e) => {
      if (letScroll || startY == null) return
      const dy = (e.touches[0]?.clientY ?? startY) - startY
      if (dy > 20) { taRef.current?.blur(); startY = null }
      if (e.cancelable) e.preventDefault()
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
    }
  }, [isMobile, conversationId])

  // Sign any private DM-image paths in the thread so they can render. Legacy
  // messages hold a full public URL and are skipped by signDmImages.
  useEffect(() => {
    const paths = thread.map((m) => m.image_url).filter(isSignedDmPath)
    if (!paths.length) return
    const missing = paths.filter((p) => !signedUrls.has(p))
    if (!missing.length) return
    let cancelled = false
    signDmImages(missing).then((map) => {
      if (cancelled || map.size === 0) return
      setSignedUrls((prev) => new Map([...prev, ...map]))
    })
    return () => { cancelled = true }
  }, [thread, signedUrls])

  async function send(e) {
    e.preventDefault()
    if (!body.trim() || !active || dmLocked) return
    setAtBottom(true)
    setSending(true)
    const replyId = replyTo?.id ?? null
    const { error } = await supabase.from('direct_messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      recipient_id: otherParticipant(active, user.id),
      body: body.trim(),
      ...(replyId ? { reply_to: replyId } : {}),
    })
    setSending(false)
    if (!error) { setBody(''); clearDraft('dm-' + conversationId); setReplyTo(null); stopTyping() }
  }

  // Attach a photo or video to the DM (uploads, then sends with any typed
  // caption). Both land in the private dm-media bucket; the storage PATH is
  // stored in image_url and rendered back through a signed URL (video paths end
  // in .mp4 etc, so the renderer picks the right player from the extension).
  async function sendImage(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !active || dmLocked) return
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)
    setAttachError('')
    setAtBottom(true)
    setSending(true)
    try {
      // Store the private storage PATH (not a public URL); it's signed on render.
      const path = isVideo
        ? await uploadDmVideo(file, conversationId)
        : await uploadDmImage(file, conversationId)
      const replyId = replyTo?.id ?? null
      const { error } = await supabase.from('direct_messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        recipient_id: otherParticipant(active, user.id),
        body: body.trim(),
        image_url: path,
        ...(replyId ? { reply_to: replyId } : {}),
      })
      if (error) throw new Error(error.message)
      setBody(''); clearDraft('dm-' + conversationId); setReplyTo(null)
    } catch (err) {
      setAttachError(err.message)
    }
    setSending(false)
  }

  return (
    <div
      style={mobileStyle}
      className={cx(
        // Mobile/tablet: a fixed overlay pinned to the visual viewport (geometry
        // in mobileStyle) so the document never scrolls and the composer hugs
        // the keyboard. Desktop keeps the normal centered card.
        'fixed inset-x-0 mx-auto flex w-full max-w-6xl sm:px-8',
        // While typing the overlay goes full-screen ABOVE the header so it can
        // cover it; otherwise it sits below (z-20) so the header stays tappable.
        kbOpen ? 'z-50' : 'z-20',
        'lg:static lg:inset-auto lg:bottom-auto lg:z-auto lg:h-[calc(100vh-4rem)] lg:translate-y-0 lg:py-6'
      )}
    >
      <div className="flex min-h-0 flex-1 overflow-hidden bg-white sm:rounded-card sm:border sm:border-gray-100 sm:shadow-card">
        {/* ---------- Conversation list ---------- */}
        <aside
          className={cx(
            'w-full shrink-0 flex-col border-r border-gray-100 sm:flex sm:w-80',
            conversationId ? 'hidden' : 'flex'
          )}
          aria-label="Conversations"
        >
          <div className="border-b border-gray-100 px-5 py-4">
            <h1 className="text-lg font-bold">Messages</h1>
            <p className="text-xs text-smoke">Collabs start here.</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingList && (
              <div className="space-y-4 p-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-40" /></div></div>
                ))}
              </div>
            )}

            {!loadingList && conversations.length === 0 && (
              <div className="p-5">
                <EmptyState
                  icon={<Icon name="envelope" className="h-7 w-7" />}
                  title="No conversations yet"
                  hint="Find a creator you'd love to collab with and hit Message on their profile."
                  action={<Link to="/creators" className="btn-primary !py-2 text-xs">Browse creators</Link>}
                />
              </div>
            )}

            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => { if (convLongPressed.current) { convLongPressed.current = false; return } navigate(`/messages/${c.id}`) }}
                onTouchStart={() => startConvPress(c)} onTouchEnd={cancelConvPress} onTouchMove={cancelConvPress}
                onMouseDown={() => startConvPress(c)} onMouseUp={cancelConvPress} onMouseLeave={cancelConvPress}
                onContextMenu={(e) => { e.preventDefault(); deleteConversation(c) }}
                className={cx(
                  'flex w-full select-none items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-cloud',
                  c.id === conversationId && 'bg-brand-tint/50'
                )}
              >
                <Avatar src={c.other?.photo_url} name={c.other?.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{c.other?.name ?? 'Creator'}</p>
                    {c.other?.is_admin && <Badge tone="light" className="!px-2 !py-0">Tryp.com</Badge>}
                  </div>
                  <p className="truncate text-xs text-smoke">{formatChatTime(c.last_message_at)}</p>
                </div>
                {c.unread > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-semibold text-white">
                    {c.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* ---------- Thread ---------- */}
        <section className={cx('min-w-0 flex-1 flex-col sm:flex', conversationId ? 'flex' : 'hidden')}>
          {!conversationId ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand" aria-hidden>
                <Icon name="chat" className="h-7 w-7" />
              </span>
              <p className="font-semibold">Pick a conversation</p>
              <p className="max-w-xs text-sm text-smoke">Or start a new one from any creator's profile.</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
                <button onClick={() => navigate('/messages')} className="rounded-full p-2 text-smoke hover:bg-cloud sm:hidden" aria-label="Back to inbox">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                {active?.other && (
                  <Link to={`/profile/${active.other.id}`} className="flex min-w-0 items-center gap-3">
                    <Avatar src={active.other.photo_url} name={active.other.name} size="sm" />
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold hover:text-brand">
                        {active.other.name}
                        {active.other.is_admin && <Badge tone="light" className="!px-2 !py-0">Tryp.com Team</Badge>}
                      </p>
                      <p className="truncate text-xs text-smoke">{active.other.bio}</p>
                    </div>
                  </Link>
                )}
              </div>

              {/* Inline connection request: accept without leaving the thread. */}
              {activeRelation?.relation === 'pending_received' && (
                <div className="mx-5 mt-4 flex items-center gap-3 rounded-card border border-brand/20 bg-brand-tint/50 px-4 py-3">
                  <Icon name="users" className="h-5 w-5 shrink-0 text-brand" />
                  <p className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{active?.other?.name?.split(' ')[0]}</span> wants to connect with you.
                  </p>
                  <button onClick={acceptConnection} className="btn-primary shrink-0 !py-1.5 text-xs">Accept</button>
                </div>
              )}

              {/* Messages */}
              <div
                ref={scrollerRef}
                onScroll={onScrollMessages}
                // Tapping the thread dismisses the keyboard (WhatsApp-style); a
                // scroll drag doesn't fire click, so scrolling history leaves it up.
                onClick={() => { if (isMobile && kbOpen) taRef.current?.blur() }}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-6"
              >
                {loadingThread && <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="ml-auto h-10 w-1/2" /><Skeleton className="h-10 w-3/5" /></div>}
                {!loadingThread && thread.map((m) => {
                  const mine = m.sender_id === user.id
                  // Private DM media resolves to a signed URL; legacy public URLs pass through.
                  const imageSrc = m.image_url ? (isSignedDmPath(m.image_url) ? signedUrls.get(m.image_url) : m.image_url) : null
                  const isVid = m.image_url && mediaType(m.image_url) === 'video'
                  const summary = reactionSummary(m.id)
                  const orig = m.reply_to ? thread.find((x) => x.id === m.reply_to) : null
                  const showActions = actionsFor === m.id
                  return (
                    <div key={m.id} id={`dm-${m.id}`} className={cx('group flex', mine && 'justify-end')}>
                      <div
                        className="max-w-[80%] sm:max-w-[65%]"
                        // Tap a message on mobile to reveal its reply / react actions.
                        onClick={(e) => { if (isMobile && !e.target.closest('a,button,video,input')) setActionsFor(showActions ? null : m.id) }}
                      >
                        <div
                          className={cx(
                          'whitespace-pre-line rounded-2xl text-sm leading-relaxed',
                          m.image_url ? 'overflow-hidden p-1.5' : 'px-4 py-2.5',
                          mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-cloud text-ink'
                        )}>
                          {/* Quoted reply */}
                          {m.reply_to && (
                            <button
                              type="button"
                              onClick={() => orig && scrollToMessage(orig.id)}
                              className={cx(
                                'mb-1.5 block w-full rounded-lg border-l-2 px-2.5 py-1 text-left',
                                m.image_url && 'mx-0.5 mt-0.5',
                                mine ? 'border-white/70 bg-white/15' : 'border-brand/60 bg-black/[0.04]'
                              )}
                            >
                              <span className={cx('block text-[11px] font-semibold', mine ? 'text-white' : 'text-brand')}>
                                {orig ? (orig.sender_id === user.id ? 'You' : active?.other?.name) : 'Original message'}
                              </span>
                              <span className={cx('block truncate text-xs', mine ? 'text-white/80' : 'text-smoke')}>{dmPreview(orig)}</span>
                            </button>
                          )}
                          {m.image_url && (
                            imageSrc ? (
                              <ChatMedia url={imageSrc} kind={isVid ? 'video' : 'image'} alt={m.body || 'Shared image'} maxW={240} maxH={360} />
                            ) : (
                              <div className="flex h-40 w-56 items-center justify-center rounded-xl bg-cloud"><Spinner /></div>
                            )
                          )}
                          {m.body && <span className={cx('block', m.image_url && 'px-2.5 py-1.5')}>{m.body}</span>}
                        </div>
                        <p className={cx('mt-1 text-[10px] text-gray-400', mine && 'text-right')}>
                          {formatChatTime(m.created_at)}{mine && m.read && ' · Read'}
                        </p>

                        {/* Reactions + action row (reply / react). Desktop: on hover;
                            mobile: tap the message to reveal (showActions). */}
                        <div className={cx('mt-0.5 flex flex-wrap items-center gap-1', mine && 'justify-end')}>
                          {Object.entries(summary).map(([emoji, info]) => (
                            <ReactionPill
                              key={emoji}
                              emoji={emoji}
                              count={info.count}
                              mine={info.mine}
                              names={info.ids.map(reactorName)}
                              onToggle={() => toggleReaction(m.id, emoji)}
                              align={mine ? 'right' : 'left'}
                            />
                          ))}
                          <div className={cx('relative flex items-center gap-1 transition-opacity focus-within:opacity-100 group-hover:opacity-100', showActions ? 'opacity-100' : 'opacity-0')}>
                            <button
                              onClick={() => { setReplyTo(m); setActionsFor(null); taRef.current?.focus() }}
                              aria-label="Reply"
                              title="Reply"
                              className="rounded-full border border-gray-200 bg-white p-1 text-smoke hover:border-brand hover:text-brand"
                            >
                              <Icon name="reply" className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                              aria-label="Add reaction"
                              className="rounded-full border border-gray-200 bg-white p-1 text-smoke hover:border-brand hover:text-brand"
                            >
                              <Icon name="smile" className="h-4 w-4" />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => deleteDm(m)}
                                aria-label="Delete message"
                                title="Delete for everyone"
                                className="rounded-full border border-gray-200 bg-white p-1 text-smoke hover:border-red-300 hover:text-red-500"
                              >
                                <Icon name="trash" className="h-4 w-4" />
                              </button>
                            )}
                            {pickerFor === m.id && (
                              <div className={cx('absolute bottom-8 z-20 flex gap-1 rounded-full border border-gray-100 bg-white px-2 py-1.5 shadow-lift', mine ? 'right-0' : 'left-0')}>
                                {QUICK_EMOJI.map((e) => (
                                  <button key={e} onClick={() => toggleReaction(m.id, e)} className="rounded-full px-1 text-lg transition-transform hover:scale-125" aria-label={`React ${e}`}>
                                    {e}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Typing indicator + jump-to-latest pill float above the composer. */}
              <div className="relative">
                {otherTyping && (
                  <div className="pointer-events-none absolute -top-6 left-5 flex items-center gap-1.5 text-xs text-smoke">
                    <span className="flex gap-0.5">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-smoke [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-smoke [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-smoke" />
                    </span>
                    <span className="italic">{active?.other?.name?.split(' ')[0]} is typing…</span>
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

              {/* Composer */}
              <div ref={composerRef} className="border-t border-gray-100 px-5 py-4">
                {dmLocked ? (
                  <div className="rounded-card bg-cloud px-4 py-3 text-center text-sm text-smoke">
                    Message sent. You can send one message until {active?.other?.name?.split(' ')[0]} replies, which connects you.
                  </div>
                ) : (
                <>
                {attachError && <p className="mb-2 text-xs text-red-600">{attachError}</p>}
                {!connected && !isAdmin && iSentCount === 0 && !theyReplied && (
                  <p className="mb-2 text-xs text-smoke">You can send one message. If {active?.other?.name?.split(' ')[0]} replies, you’ll be connected.</p>
                )}
                {/* Reply preview: what you're replying to, with a cancel button. */}
                {replyTo && (
                  <div className="mb-2 flex items-center gap-2 rounded-xl border-l-2 border-brand bg-cloud/70 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-brand">
                        Replying to {replyTo.sender_id === user.id ? 'yourself' : active?.other?.name?.split(' ')[0]}
                      </p>
                      <p className="truncate text-xs text-smoke">{dmPreview(replyTo)}</p>
                    </div>
                    <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="rounded-full p-1 text-smoke hover:bg-white hover:text-ink">
                      <Icon name="ban" className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <form onSubmit={send} className="flex items-end gap-2 sm:gap-3">
                  <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={sendImage} />
                  <button
                    type="button" onClick={() => fileRef.current?.click()} disabled={sending}
                    className="btn-ghost !px-3.5 !py-3" aria-label="Attach a photo or video" title="Attach a photo or video"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 19.5h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25z" />
                    </svg>
                  </button>
                  <textarea
                    ref={taRef}
                    rows={1}
                    className="input max-h-32 flex-1 resize-none overflow-y-auto"
                    placeholder={`Message ${active?.other?.name?.split(' ')[0] ?? ''}…`}
                    value={body}
                    onChange={(e) => { setBody(e.target.value); saveDraft('dm-' + conversationId, e.target.value); if (e.target.value.trim()) pingTyping() }}
                    onBlur={stopTyping}
                    onKeyDown={(e) => { if (!isMobile && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e) } }}
                    aria-label="Message"
                  />
                  <button type="submit" disabled={sending || !body.trim()} className="btn-primary !px-5" aria-label="Send">
                    {sending ? <Spinner /> : (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3 21l18-9L3 3l3 9zm0 0h6" /></svg>
                    )}
                  </button>
                </form>
                </>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
