import { useEffect, useRef, useState, useCallback } from 'react'
import { uploadChatImage } from '../lib/chatMedia'
import { Link, NavLink, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, Badge, Modal, Skeleton, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import PollCard from '../components/PollCard'
import GameEventCard from '../components/GameEventCard'
import BirthdayCard from '../components/BirthdayCard'
import ResourceCard from '../components/ResourceCard'
import { CONTINENTS } from '../lib/countries'
import { formatChatTime, cx } from '../lib/utils'
import { renderMessageBody } from '../lib/richText'
import { useVisualViewport, useIsMobile } from '../lib/useKeyboardInset'

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
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [pickerFor, setPickerFor] = useState(null) // message id with emoji picker open
  const [unread, setUnread] = useState({}) // channel -> bool
  const [attachError, setAttachError] = useState('')
  const bottomRef = useRef(null)
  const fileRef = useRef(null)
  const textareaRef = useRef(null)

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
        transform: `translateY(${vpOffset}px)`,
        // When the overlay covers the header (keyboard open) clear the status
        // bar / notch in a standalone PWA; harmless (0) in a browser tab.
        paddingTop: kbOpen ? 'env(safe-area-inset-top)' : undefined,
      }
    : undefined

  // Members (for @mention autocomplete + rendering mention links).
  const [members, setMembers] = useState([])
  const [mention, setMention] = useState(null) // { query, start } while typing @…
  useEffect(() => {
    supabase.from('profiles').select('id, name, photo_url')
      .in('status', ['active', 'muted']).eq('is_test', false)
      .then(({ data }) => setMembers(data ?? []))
  }, [])
  const mentionResults = mention
    ? members.filter((m) => m.id !== user.id && m.name?.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6)
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

  // Keep the latest message in view when the keyboard opens/closes or the
  // visible viewport resizes.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [kbOpen, vpHeight])

  // Auto-grow the composer like WhatsApp: expand with the text up to a few
  // lines, then let it scroll internally instead of pushing the layout.
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`
  }, [body])

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
    if (!error) { setBody(''); setMention(null) }
  }

  // Attach an image: upload to storage, then send it as a message
  // (with whatever text is in the composer as its caption).
  async function sendImage(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setAttachError('')
    setSending(true)
    try {
      const url = await uploadChatImage(file, user.id)
      const { error } = await supabase
        .from('messages')
        .insert({ channel, sender_id: user.id, body: body.trim(), image_url: url })
      if (error) throw new Error(error.message)
      setBody('')
    } catch (err) {
      setAttachError(err.message)
    }
    setSending(false)
  }

  // Detect an in-progress "@query" just before the caret to drive autocomplete.
  function onBodyChange(e) {
    const val = e.target.value
    setBody(val)
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

  // Admin markdown helpers: wrap the current selection (or insert a placeholder).
  function applyFormat(kind) {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart, end = ta.selectionEnd
    const sel = body.slice(start, end)
    let next, s, en
    if (kind === 'heading') {
      const ls = body.lastIndexOf('\n', start - 1) + 1
      next = body.slice(0, ls) + '# ' + body.slice(ls)
      s = en = start + 2
    } else {
      const mark = kind === 'bold' ? '**' : '*'
      const inner = sel || (kind === 'bold' ? 'bold' : 'italic')
      next = body.slice(0, start) + mark + inner + mark + body.slice(end)
      s = start + mark.length
      en = s + inner.length
    }
    setBody(next)
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s, en) })
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

  return (
    <div
      style={mobileStyle}
      className={cx(
        // Mobile/tablet: a fixed overlay pinned to the visual viewport (geometry
        // in mobileStyle) so the document never scrolls and the composer hugs
        // the keyboard. Desktop keeps the normal centered card.
        'fixed inset-x-0 mx-auto flex w-full max-w-6xl flex-col sm:px-8',
        // Smoothly interpolate the size/position changes as the keyboard slides
        // up/down (the geometry lands over a few polled frames, so without this
        // it snaps through intermediate sizes and looks juttery). Mobile only;
        // desktop uses the static card. Respects reduced-motion.
        'motion-safe:transition-[top,height,transform] motion-safe:duration-200 motion-safe:ease-out',
        // While typing the overlay goes full-screen and sits ABOVE the header so
        // it can cover it; otherwise it sits BELOW the header (z-20) so the
        // header's bell/avatar dropdowns stay tappable over the chat.
        kbOpen ? 'z-50' : 'z-20',
        'lg:static lg:inset-auto lg:bottom-auto lg:z-auto lg:h-[calc(100vh-4rem)] lg:translate-y-0 lg:py-6 lg:transition-none'
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

        {/* ---------- Messages ---------- */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:space-y-5 sm:px-8 sm:py-6">
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
            return (
              <div key={m.id} className={cx('group flex gap-3', mine && 'flex-row-reverse')}>
                <Link to={`/profile/${m.sender_id}`} className="shrink-0 self-end">
                  <Avatar src={m.profiles?.photo_url} name={m.profiles?.name} size="sm" />
                </Link>

                <div className={cx('max-w-[78%] sm:max-w-[65%]', mine && 'items-end text-right')}>
                  <div className={cx('mb-1 flex items-baseline gap-2 text-xs', mine && 'flex-row-reverse')}>
                    <span className="font-semibold text-ink">{mine ? 'You' : m.profiles?.name}</span>
                    {m.profiles?.is_admin && <Badge tone="light" className="!px-2 !py-0">Tryp.com Team</Badge>}
                    <span className="text-gray-400">{formatChatTime(m.created_at)}</span>
                  </div>

                  {(m.body || m.image_url) && (
                    <div
                      className={cx(
                        'relative inline-block whitespace-pre-line rounded-2xl text-left text-sm leading-relaxed',
                        m.image_url ? 'overflow-hidden p-1.5' : 'px-4 py-2.5',
                        channel === 'announcements'
                          ? 'border border-brand/20 bg-brand-tint text-ink'
                          : mine
                            ? 'bg-brand text-white'
                            : 'bg-cloud text-ink'
                      )}
                    >
                      {m.image_url && (
                        <a href={m.image_url} target="_blank" rel="noopener noreferrer" aria-label="Open image full size">
                          <img
                            src={m.image_url}
                            alt={m.body || 'Shared image'}
                            loading="lazy"
                            className="max-h-72 w-full rounded-xl object-cover"
                          />
                        </a>
                      )}
                      {m.body && <span className={cx('block', m.image_url && 'px-2.5 py-1.5')}>{renderMessageBody(m.body, { rich: m.profiles?.is_admin, members, onDark: mine && channel !== 'announcements' })}</span>}
                    </div>
                  )}

                  {/* Inline cards: poll / game challenge / birthday (render on their own) */}
                  {m.poll_id && <PollCard pollId={m.poll_id} />}
                  {m.game_event_id && <GameEventCard eventId={m.game_event_id} />}
                  {m.birthday_for && <BirthdayCard creatorId={m.birthday_for} />}
                  {m.resource_id && <ResourceCard resourceId={m.resource_id} />}

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
                        className="rounded-full border border-gray-200 p-1 text-smoke hover:border-brand hover:text-brand"
                      >
                        <Icon name="smile" className="h-4 w-4" />
                      </button>
                      {isAdmin && (
                        <>
                          <button onClick={() => moderateDelete(m.id)} aria-label="Delete message" className="rounded-full border border-gray-200 p-1 text-smoke hover:border-red-300 hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
                          {!mine && !m.profiles?.is_admin && (
                            <button onClick={() => muteCreator(m.sender_id, m.profiles?.name)} aria-label="Mute creator" className="rounded-full border border-gray-200 p-1 text-smoke hover:border-red-300 hover:text-red-500"><Icon name="mute" className="h-4 w-4" /></button>
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
        <div className="shrink-0 border-t border-gray-100 px-4 py-2.5 sm:px-8 sm:py-4">
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
                  <button type="button" onClick={() => applyFormat('heading')} title="Heading" aria-label="Heading" className="rounded px-2.5 py-1 text-xs font-bold text-smoke hover:bg-cloud hover:text-ink">H</button>
                  <button type="button" onClick={() => applyFormat('bold')} title="Bold" aria-label="Bold" className="rounded px-2.5 py-1 text-sm font-bold text-smoke hover:bg-cloud hover:text-ink">B</button>
                  <button type="button" onClick={() => applyFormat('italic')} title="Italic" aria-label="Italic" className="rounded px-2.5 py-1 text-sm italic text-smoke hover:bg-cloud hover:text-ink">I</button>
                </div>
                {/* Drop a game challenge card into this channel. */}
                <button type="button" onClick={() => setShowGame(true)} disabled={sending} title="Post a game challenge" aria-label="Post a game challenge" className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-smoke hover:bg-cloud hover:text-ink">
                  <Icon name="joystick" className="h-4 w-4" /> <span className="hidden sm:inline">Game</span>
                </button>
                {/* Drop a resource-library card into this channel. */}
                <button type="button" onClick={openResourcePicker} disabled={sending} title="Share a resource" aria-label="Share a resource" className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-smoke hover:bg-cloud hover:text-ink">
                  <Icon name="book" className="h-4 w-4" /> <span className="hidden sm:inline">Resource</span>
                </button>
                {channel === 'announcements' && (
                  <button type="button" onClick={() => setShowPoll(true)} className="btn-secondary !py-2 text-xs">
                    <Icon name="poll" className="h-4 w-4" /> Create a poll
                  </button>
                )}
              </div>
            )}
            {/* @mention autocomplete */}
            {mention && mentionResults.length > 0 && (
              <div className="mb-2 overflow-hidden rounded-card border border-gray-100 bg-white shadow-lift">
                {mentionResults.map((mem) => (
                  <button key={mem.id} type="button" onClick={() => selectMention(mem)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-cloud">
                    <Avatar src={mem.photo_url} name={mem.name} size="sm" />
                    <span className="font-medium">{mem.name}</span>
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={send} className="flex items-end gap-2 sm:gap-3">
              {/* Image attach: uploads and sends immediately, with any typed
                  text as the caption. Links pasted in the box are clickable. */}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={sendImage} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={sending}
                className="btn-ghost !px-3.5 !py-3"
                aria-label="Attach an image"
                title="Attach an image"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 19.5h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25z" />
                </svg>
              </button>
              <textarea
                ref={textareaRef}
                rows={1}
                className="input max-h-32 flex-1 resize-none overflow-y-auto"
                placeholder="Message…"
                value={body}
                onChange={onBodyChange}
                onKeyDown={(e) => {
                  if (mention && mentionResults.length) {
                    if (e.key === 'Enter') { e.preventDefault(); selectMention(mentionResults[0]); return }
                    if (e.key === 'Escape') { e.preventDefault(); setMention(null); return }
                  }
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="game-mode" className="label">Mode</label>
              <select id="game-mode" className="input" value={gameForm.mode} onChange={(e) => setGameForm({ ...gameForm, mode: e.target.value })}>
                <option value="flags">Guess the flag</option>
                <option value="map">Find on the map</option>
                <option value="airports">Airport codes</option>
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
