import { useEffect, useRef, useState, useCallback } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, Badge, Skeleton, Spinner } from '../components/ui'
import { formatChatTime, cx } from '../lib/utils'

// Real-time community chat — the WhatsApp replacement.
//  * Three channels: #general, #announcements (admin-post-only), #content-tips.
//  * Supabase realtime: new messages and reactions appear instantly.
//  * Emoji reactions, admin moderation (delete message, mute creator).
//  * Unread dots per channel (last-read time kept in localStorage).
const CHANNELS = [
  { key: 'general', label: 'General', emoji: '💬', hint: 'Open chat for everyone' },
  { key: 'announcements', label: 'Announcements', emoji: '📣', hint: 'Official — only the Tryp team posts here' },
  { key: 'content_tips', label: 'Content Tips', emoji: '💡', hint: 'Tips & tricks — share what works' },
]

const QUICK_EMOJI = ['❤️', '🔥', '😂', '👍', '🎉', '✈️']

const lastReadKey = (channel) => `tryp-chat-last-read-${channel}`

export default function Chat() {
  const { channel = 'general' } = useParams()
  const { user, profile, isAdmin } = useAuth()

  const [messages, setMessages] = useState([])
  const [reactions, setReactions] = useState([]) // all reactions for loaded messages
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [pickerFor, setPickerFor] = useState(null) // message id with emoji picker open
  const [unread, setUnread] = useState({}) // channel -> bool
  const bottomRef = useRef(null)

  const meta = CHANNELS.find((c) => c.key === channel) ?? CHANNELS[0]
  const canPost = channel !== 'announcements' || isAdmin
  const isMuted = profile?.status === 'muted'

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
    const { data: reacts } = ids.length
      ? await supabase.from('reactions').select('*').in('message_id', ids)
      : { data: [] }
    setMessages(msgs ?? [])
    setReactions(reacts ?? [])
    setLoading(false)
  }, [channel])

  useEffect(() => { load() }, [load])

  // ---------- Realtime: messages + reactions ----------
  useEffect(() => {
    const sub = supabase
      .channel(`chat-${channel}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel=eq.${channel}` },
        async (payload) => {
          // Fetch the sender's profile for the incoming message.
          const { data: sender } = await supabase
            .from('profiles').select('id, name, photo_url, is_admin').eq('id', payload.new.sender_id).single()
          setMessages((prev) =>
            prev.some((m) => m.id === payload.new.id) ? prev : [...prev, { ...payload.new, profiles: sender }]
          )
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
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [channel])

  // ---------- Auto-scroll to newest + mark channel read ----------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    localStorage.setItem(lastReadKey(channel), new Date().toISOString())
    setUnread((u) => ({ ...u, [channel]: false }))
  }, [messages, channel])

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
  async function send(e) {
    e.preventDefault()
    if (!body.trim()) return
    setSending(true)
    const { error } = await supabase.from('messages').insert({ channel, sender_id: user.id, body: body.trim() })
    setSending(false)
    if (!error) setBody('')
  }

  async function toggleReaction(messageId, emoji) {
    setPickerFor(null)
    const mine = reactions.find((r) => r.message_id === messageId && r.creator_id === user.id && r.emoji === emoji)
    if (mine) await supabase.from('reactions').delete().eq('id', mine.id)
    else await supabase.from('reactions').insert({ message_id: messageId, creator_id: user.id, emoji })
  }

  async function moderateDelete(messageId) {
    if (!confirm('Delete this message for everyone?')) return
    await supabase.from('messages').update({ deleted: true }).eq('id', messageId)
  }

  async function muteCreator(senderId, name) {
    if (!confirm(`Mute ${name}? They'll be able to read but not post until unmuted (Admin → Creators).`)) return
    await supabase.from('profiles').update({ status: 'muted' }).eq('id', senderId)
  }

  // Group reactions per message: { '❤️': { count, mine } }
  function reactionSummary(messageId) {
    const grouped = {}
    for (const r of reactions.filter((x) => x.message_id === messageId)) {
      grouped[r.emoji] = grouped[r.emoji] || { count: 0, mine: false }
      grouped[r.emoji].count++
      if (r.creator_id === user.id) grouped[r.emoji].mine = true
    }
    return grouped
  }

  // Make shared links clickable inside message bodies.
  function renderBody(text) {
    const parts = text.split(/(https?:\/\/\S+)/g)
    return parts.map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-brand underline decoration-brand/40 hover:decoration-brand">
          {part}
        </a>
      ) : (
        part
      )
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem-6rem)] w-full max-w-6xl flex-col px-0 sm:px-8 sm:py-6 lg:h-[calc(100vh-4rem)]">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white sm:rounded-card sm:border sm:border-gray-100 sm:shadow-card">
        {/* ---------- Channel tabs ---------- */}
        <div className="flex shrink-0 gap-1 border-b border-gray-100 px-3 pt-3 sm:px-5" role="tablist" aria-label="Chat channels">
          {CHANNELS.map((c) => (
            <NavLink
              key={c.key}
              to={`/chat/${c.key}`}
              role="tab"
              aria-selected={channel === c.key}
              className={cx(
                'relative rounded-t-xl px-4 py-2.5 text-sm font-medium transition-colors',
                channel === c.key ? 'bg-brand-tint text-brand' : 'text-smoke hover:bg-cloud hover:text-ink'
              )}
            >
              <span aria-hidden>{c.emoji}</span> <span className="hidden sm:inline">{c.label}</span>
              {unread[c.key] && <span className="absolute right-1 top-1.5 h-2 w-2 rounded-full bg-brand" aria-label="Unread messages" />}
            </NavLink>
          ))}
        </div>

        {/* Channel hint bar */}
        <div className={cx('shrink-0 px-5 py-2.5 text-xs', channel === 'announcements' ? 'bg-brand-tint font-medium text-brand' : 'bg-cloud/60 text-smoke')}>
          {meta.hint}
        </div>

        {/* ---------- Messages ---------- */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-8">
          {loading && (
            <div className="space-y-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-40" /><Skeleton className="h-4 w-3/4" /></div></div>
              ))}
            </div>
          )}

          {!loading && messages.filter((m) => !m.deleted).length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-4xl" aria-hidden>{meta.emoji}</p>
              <p className="font-semibold">It's quiet in #{meta.label.toLowerCase()}…</p>
              {canPost && <p className="text-sm text-smoke">Be the one to break the silence!</p>}
            </div>
          )}

          {!loading && messages.map((m) => {
            if (m.deleted) {
              return isAdmin ? (
                <p key={m.id} className="px-12 text-xs italic text-gray-300">message deleted by a moderator</p>
              ) : null
            }
            const mine = m.sender_id === user.id
            const summary = reactionSummary(m.id)
            return (
              <div key={m.id} className={cx('group flex gap-3', mine && 'flex-row-reverse')}>
                <Link to={`/profile/${m.sender_id}`} className="shrink-0 self-end">
                  <Avatar src={m.profiles?.photo_url} name={m.profiles?.name} size="sm" />
                </Link>

                <div className={cx('max-w-[78%] sm:max-w-[65%]', mine && 'items-end text-right')}>
                  <div className={cx('mb-1 flex items-baseline gap-2 text-xs', mine && 'flex-row-reverse')}>
                    <span className="font-semibold text-ink">{mine ? 'You' : m.profiles?.name}</span>
                    {m.profiles?.is_admin && <Badge tone="light" className="!px-2 !py-0">Tryp team</Badge>}
                    <span className="text-gray-400">{formatChatTime(m.created_at)}</span>
                  </div>

                  <div
                    className={cx(
                      'relative inline-block whitespace-pre-line rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed',
                      channel === 'announcements'
                        ? 'border border-brand/20 bg-brand-tint text-ink'
                        : mine
                          ? 'bg-brand text-white'
                          : 'bg-cloud text-ink'
                    )}
                  >
                    {renderBody(m.body)}
                  </div>

                  {/* Reactions */}
                  <div className={cx('mt-1 flex flex-wrap items-center gap-1', mine && 'justify-end')}>
                    {Object.entries(summary).map(([emoji, info]) => (
                      <button
                        key={emoji}
                        onClick={() => toggleReaction(m.id, emoji)}
                        aria-label={`${emoji} ${info.count} reactions`}
                        className={cx(
                          'rounded-full border px-2 py-0.5 text-xs transition-colors',
                          info.mine ? 'border-brand bg-brand-tint text-brand' : 'border-gray-200 bg-white text-smoke hover:border-brand'
                        )}
                      >
                        {emoji} {info.count}
                      </button>
                    ))}

                    {/* Hover actions: react / moderate */}
                    <div className={cx('relative flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100')}>
                      <button
                        onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                        aria-label="Add reaction"
                        className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-smoke hover:border-brand hover:text-brand"
                      >
                        +🙂
                      </button>
                      {isAdmin && (
                        <>
                          <button onClick={() => moderateDelete(m.id)} aria-label="Delete message" className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-smoke hover:border-red-300 hover:text-red-500">🗑</button>
                          {!mine && !m.profiles?.is_admin && (
                            <button onClick={() => muteCreator(m.sender_id, m.profiles?.name)} aria-label="Mute creator" className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-smoke hover:border-red-300 hover:text-red-500">🔇</button>
                          )}
                        </>
                      )}
                      {pickerFor === m.id && (
                        <div className="absolute bottom-7 left-0 z-20 flex gap-1 rounded-full border border-gray-100 bg-white px-2 py-1.5 shadow-lift">
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

        {/* ---------- Composer ---------- */}
        <div className="shrink-0 border-t border-gray-100 px-4 py-4 sm:px-8">
          {isMuted ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-700">
              You've been muted by the team — you can read but not post. Questions? DM an admin.
            </p>
          ) : canPost ? (
            <form onSubmit={send} className="flex items-end gap-3">
              <textarea
                rows={1}
                className="input max-h-32 flex-1 resize-none"
                placeholder={`Message #${meta.label.toLowerCase()}…`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e) }
                }}
                aria-label={`Message ${meta.label}`}
              />
              <button type="submit" disabled={sending || !body.trim()} className="btn-primary !px-5" aria-label="Send">
                {sending ? <Spinner /> : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3 21l18-9L3 3l3 9zm0 0h6" /></svg>
                )}
              </button>
            </form>
          ) : (
            <p className="rounded-xl bg-cloud px-4 py-3 text-center text-sm text-smoke">
              📣 Only the Tryp team can post announcements — react to show you've seen them!
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
