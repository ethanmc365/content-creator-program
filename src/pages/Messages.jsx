import { useEffect, useRef, useState, useCallback } from 'react'
import { confirm } from '../lib/confirm'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { uploadDmImage, uploadDmVideo, signDmImages, isSignedDmPath } from '../lib/chatMedia'
import { loadRelationship } from '../lib/connections'
import { Avatar, Badge, EmptyState, Skeleton, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import ChatMedia from '../components/ChatMedia'
import { mediaType } from '../lib/media'
import { formatChatTime, otherParticipant, cx } from '../lib/utils'
import { useVisualViewport, useIsMobile } from '../lib/useKeyboardInset'

// Direct messages: inbox (conversation list) + active thread, both realtime.
// On mobile you see one panel at a time; on desktop they sit side by side.
export default function Messages() {
  const { conversationId } = useParams()
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const pressTimer = useRef(null)

  const [conversations, setConversations] = useState([]) // enriched with profile + unread
  const [thread, setThread] = useState([])
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
  const fileRef = useRef(null)
  const taRef = useRef(null)

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
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [user.id, conversationId, loadConversations])

  // ---------- Admin: long-press a message to delete it for everyone ----------
  async function deleteDm(m) {
    if (!isAdmin) return
    if (!await confirm('Delete this message for everyone?')) return
    setThread((prev) => prev.filter((x) => x.id !== m.id))
    await supabase.from('direct_messages').delete().eq('id', m.id)
  }
  const startPress = (m) => { if (isAdmin) pressTimer.current = setTimeout(() => deleteDm(m), 550) }
  const cancelPress = () => clearTimeout(pressTimer.current)

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
  }, [conversationId])

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
      bottomRef.current?.scrollIntoView({ behavior: firstPaint ? 'auto' : 'smooth' })
      setNewBelow(0)
    } else if (grew) {
      setNewBelow((n) => n + (thread.length - prevLenRef.current))
    }
    prevLenRef.current = thread.length
  }, [thread, atBottom, user.id])

  // Keep the latest message visible as the keyboard opens/closes or the visible
  // viewport resizes (only if we were already following the newest).
  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [kbOpen, vpHeight, atBottom])

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
    setAtBottom(near)
    if (near) setNewBelow(0)
  }, [])

  const jumpToLatest = useCallback(() => {
    setAtBottom(true)
    setNewBelow(0)
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

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
    const { error } = await supabase.from('direct_messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      recipient_id: otherParticipant(active, user.id),
      body: body.trim(),
    })
    setSending(false)
    if (!error) setBody('')
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
      const { error } = await supabase.from('direct_messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        recipient_id: otherParticipant(active, user.id),
        body: body.trim(),
        image_url: path,
      })
      if (error) throw new Error(error.message)
      setBody('')
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
                  return (
                    <div key={m.id} className={cx('flex', mine && 'justify-end')}>
                      <div className={cx('max-w-[80%] sm:max-w-[65%]')}>
                        <div
                          onTouchStart={() => startPress(m)}
                          onTouchEnd={cancelPress}
                          onTouchMove={cancelPress}
                          onMouseDown={() => startPress(m)}
                          onMouseUp={cancelPress}
                          onMouseLeave={cancelPress}
                          onContextMenu={(e) => { if (isAdmin) { e.preventDefault(); deleteDm(m) } }}
                          title={isAdmin ? 'Long-press to delete (admin)' : undefined}
                          className={cx(
                          'whitespace-pre-line rounded-2xl text-sm leading-relaxed',
                          isAdmin && 'cursor-pointer select-none',
                          m.image_url ? 'overflow-hidden p-1.5' : 'px-4 py-2.5',
                          mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-cloud text-ink'
                        )}>
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
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Jump-to-latest pill floats just above the composer. */}
              <div className="relative">
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
              <div className="border-t border-gray-100 px-5 py-4">
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
                    onChange={(e) => setBody(e.target.value)}
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
