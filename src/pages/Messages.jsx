import { useEffect, useRef, useState, useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { uploadChatImage } from '../lib/chatMedia'
import { Avatar, Badge, EmptyState, Skeleton, Spinner } from '../components/ui'
import { formatChatTime, otherParticipant, cx } from '../lib/utils'

// Direct messages: inbox (conversation list) + active thread, both realtime.
// On mobile you see one panel at a time; on desktop they sit side by side.
export default function Messages() {
  const { conversationId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [conversations, setConversations] = useState([]) // enriched with profile + unread
  const [thread, setThread] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [attachError, setAttachError] = useState('')
  const bottomRef = useRef(null)
  const fileRef = useRef(null)

  const active = conversations.find((c) => c.id === conversationId)

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
          // I'm looking at this thread — mark it read immediately.
          if (msg.recipient_id === user.id) {
            await supabase.from('direct_messages').update({ read: true }).eq('id', msg.id)
          }
        }
        loadConversations()
      })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [user.id, conversationId, loadConversations])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread])

  async function send(e) {
    e.preventDefault()
    if (!body.trim() || !active) return
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

  // Attach a photo to the DM (uploads, then sends with any typed caption).
  async function sendImage(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !active) return
    setAttachError('')
    setSending(true)
    try {
      const url = await uploadChatImage(file, user.id)
      const { error } = await supabase.from('direct_messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        recipient_id: otherParticipant(active, user.id),
        body: body.trim(),
        image_url: url,
      })
      if (error) throw new Error(error.message)
      setBody('')
    } catch (err) {
      setAttachError(err.message)
    }
    setSending(false)
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem-6rem)] w-full max-w-6xl px-0 sm:px-8 sm:py-6 lg:h-[calc(100vh-4rem)]">
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
            <p className="text-xs text-smoke">Collabs start here ✨</p>
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
                  emoji="💌"
                  title="No conversations yet"
                  hint="Find a creator you'd love to collab with and hit Message on their profile."
                  action={<Link to="/creators" className="btn-primary !py-2 text-xs">Browse creators</Link>}
                />
              </div>
            )}

            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/messages/${c.id}`)}
                className={cx(
                  'flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-cloud',
                  c.id === conversationId && 'bg-brand-tint/50'
                )}
              >
                <Avatar src={c.other?.photo_url} name={c.other?.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{c.other?.name ?? 'Creator'}</p>
                    {c.other?.is_admin && <Badge tone="light" className="!px-2 !py-0">Tryp</Badge>}
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
              <p className="text-4xl" aria-hidden>💬</p>
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
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-6">
                {loadingThread && <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="ml-auto h-10 w-1/2" /><Skeleton className="h-10 w-3/5" /></div>}
                {!loadingThread && thread.map((m) => {
                  const mine = m.sender_id === user.id
                  return (
                    <div key={m.id} className={cx('flex', mine && 'justify-end')}>
                      <div className={cx('max-w-[80%] sm:max-w-[65%]')}>
                        <div className={cx(
                          'whitespace-pre-line rounded-2xl text-sm leading-relaxed',
                          m.image_url ? 'overflow-hidden p-1.5' : 'px-4 py-2.5',
                          mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-cloud text-ink'
                        )}>
                          {m.image_url && (
                            <a href={m.image_url} target="_blank" rel="noopener noreferrer" aria-label="Open image full size">
                              <img src={m.image_url} alt={m.body || 'Shared image'} loading="lazy" className="max-h-72 w-full rounded-xl object-cover" />
                            </a>
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

              {/* Composer */}
              <div className="border-t border-gray-100 px-5 py-4">
                {attachError && <p className="mb-2 text-xs text-red-600">{attachError}</p>}
                <form onSubmit={send} className="flex items-end gap-2 sm:gap-3">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={sendImage} />
                  <button
                    type="button" onClick={() => fileRef.current?.click()} disabled={sending}
                    className="btn-ghost !px-3.5 !py-3" aria-label="Attach a photo" title="Attach a photo"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 19.5h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25z" />
                    </svg>
                  </button>
                  <textarea
                    rows={1}
                    className="input max-h-32 flex-1 resize-none"
                    placeholder={`Message ${active?.other?.name?.split(' ')[0] ?? ''}…`}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e) } }}
                    aria-label="Message"
                  />
                  <button type="submit" disabled={sending || !body.trim()} className="btn-primary !px-5" aria-label="Send">
                    {sending ? <Spinner /> : (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3 21l18-9L3 3l3 9zm0 0h6" /></svg>
                    )}
                  </button>
                </form>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
