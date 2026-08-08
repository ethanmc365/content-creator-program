import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCommunity } from '../context/CommunityContext'
import { flagFromIso } from '../components/network/PlaceSwitcher'
import NetworkMotion from '../components/NetworkMotion'
import IntroPrompt from '../components/network/IntroPrompt'
import { ReactionRow, useReactions, RoomSearch, Highlight, MentionMenu, withMentions } from '../components/network/ChatExtras'
import { ChatSkeleton } from '../components/network/Skeletons'
import Icon from '../components/Icon'
import { Avatar, EmptyState } from '../components/ui'
import { useVisualViewport, useIsMobile } from '../lib/useKeyboardInset'
import { cx, timeAgo } from '../lib/utils'
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

export default function NetworkChat() {
  const { slug, channelKey } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { bySlug, network, manages, loading: ctxLoading } = useCommunity()

  const community = slug ? bySlug(slug) : network
  const [channels, setChannels] = useState([])
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [members, setMembers] = useState([])
  const [mention, setMention] = useState(null) // { query, start } while typing @…
  const scrollerRef = useRef(null)
  const inputRef = useRef(null)
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

  const messageIds = useMemo(() => messages.map((m) => m.id), [messages])
  const { byMessage: reactionsByMessage, toggle: toggleReaction } = useReactions(messageIds, user?.id)

  // Search filters what is already in memory. A room holds 200 messages; a
  // server round trip for this would be slower and would not work offline.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return messages
    return messages.filter(
      (m) => m.body?.toLowerCase().includes(q) || m.profiles?.name?.toLowerCase().includes(q),
    )
  }, [messages, search])

  const memberFirstNames = useMemo(
    () => new Set(members.map((m) => m.name?.split(' ')[0]?.toLowerCase()).filter(Boolean)),
    [members],
  )

  // Typing "@" opens the picker; a space or a match closes it.
  function onBodyChange(e) {
    const value = e.target.value
    setBody(value)
    const upto = value.slice(0, e.target.selectionStart ?? value.length)
    const m = /(?:^|\s)@([\w' -]{0,20})$/.exec(upto)
    setMention(m ? { query: m[1], start: upto.length - m[1].length - 1 } : null)
  }

  function pickMention(person) {
    if (!mention) return
    const before = body.slice(0, mention.start)
    const after = body.slice(mention.start + mention.query.length + 1)
    setBody(`${before}@${person.name} ${after}`)
    setMention(null)
    inputRef.current?.focus()
  }

  function onScroll(e) {
    const el = e.currentTarget
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function send(e) {
    e?.preventDefault?.()
    const text = body.trim()
    if (!text || !canPost || sending) return
    setSending(true)
    setBody('')
    atBottomRef.current = true
    const { data, error } = await supabase.from('messages').insert({
      channel: scopedKey(community, active.key),
      channel_id: active.id,
      community_id: community.id,
      sender_id: user.id,
      body: text,
    }).select('*, profiles:sender_id(id, name, photo_url, is_admin)').single()
    setSending(false)
    if (!error && data) setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]))
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
  // Derived from the messages already loaded rather than a second query: if
  // you have posted in this room, you have introduced yourself.
  const hasIntroduced = messages.some((m) => m.sender_id === user?.id)

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
      </div>

      {/* Introductions gets a guided composer instead of a blank room, and only
          until you have actually used it. "Say hello" asks for a blank page
          from the person in the room with the least context; five questions
          produce a post somebody can reply to. */}
      {active?.key === 'introductions' && canPost && !hasIntroduced && (
        <IntroPrompt community={community} channel={active} onPosted={load} />
      )}

      {/* The hint bar doubles as the room's identity on mobile, where the page
          heading is scrolled away. */}
      {active && (
        <div className={cx(
          'flex shrink-0 items-center gap-2 px-3 py-1 text-[11px] sm:px-4 sm:py-1.5 sm:text-xs',
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
                className={cx('group/msg flex gap-3', grouped && '!mt-1')}
              >
                <div className="w-9 shrink-0">
                  {!grouped && <Avatar src={m.profiles?.photo_url} name={m.profiles?.name} size="sm" />}
                </div>
                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <p className="mb-0.5 flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold">{m.profiles?.name || 'Someone'}</span>
                      {m.profiles?.is_admin && (
                        <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold text-brand">Team</span>
                      )}
                      <span className="text-[11px] text-smoke">{timeAgo(m.created_at)}</span>
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm text-ink">
                    {search
                      ? <Highlight text={m.body || ''} term={search} />
                      : withMentions(m.body || '', memberFirstNames)}
                  </p>
                  <ReactionRow
                    messageId={m.id}
                    reactions={reactions}
                    myId={user?.id}
                    onToggle={toggleReaction}
                  />
                </div>
              </motion.div>
            )
          })
        )}
      </div>

      <div className="shrink-0 border-t border-gray-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-3">
        {isLiveWorldwide ? (
          <p className="rounded-xl bg-cloud px-4 py-3 text-center text-xs text-smoke">
            {active?.label} is a room every creator is already in today. It is read only here so a test
            message cannot reach all of them by accident. The other rooms are open.
          </p>
        ) : !canPost ? (
          <p className="rounded-xl bg-cloud px-4 py-3 text-center text-xs text-smoke">
            Only the team posts in {active?.label}.
          </p>
        ) : (
          <form onSubmit={send} className="relative flex items-center gap-2">
            {/* @-autocomplete, anchored to the composer. */}
            <AnimatePresence>
              {mention && (
                <MentionMenu
                  query={mention.query}
                  members={members}
                  onPick={pickMention}
                  onClose={() => setMention(null)}
                />
              )}
            </AnimatePresence>
            {/* text-base on mobile, deliberately: anything smaller makes iOS
                zoom the page on focus and the overlay geometry never recovers. */}
            <input
              ref={inputRef}
              className="input text-base sm:text-sm"
              placeholder={`Message ${active?.label}`}
              value={body}
              onChange={onBodyChange}
              aria-label={`Message ${active?.label}`}
            />
            <button type="submit" disabled={!body.trim() || sending} className="btn-primary shrink-0 !px-5 !py-2.5">
              {sending ? '…' : 'Send'}
            </button>
          </form>
        )}
      </div>
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
          <nav aria-label="Rooms" className="hidden lg:block lg:w-56 lg:shrink-0">
            <div className="flex flex-col gap-0.5 rounded-card border border-gray-100 bg-white p-2 shadow-card">
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
          </nav>

          {room}
        </div>
      </div>
    </NetworkMotion>
  )
}
