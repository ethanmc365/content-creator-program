import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCommunity } from '../context/CommunityContext'
import { flagFromIso } from '../components/network/MarketSwitcher'
import NetworkMotion from '../components/NetworkMotion'
import Icon from '../components/Icon'
import { Avatar, EmptyState, Skeleton } from '../components/ui'
import { cx, timeAgo } from '../lib/utils'
import { SOFT_SPRING } from '../lib/motion'

// Per-market chat. Spain's #general, the UK's #general and the Worldwide
// #general are three separate rooms that happen to share a layout.
//
// HOW THEY ARE KEPT APART, AND WHY IT MATTERS
//
// The live Chat.jsx that 44 creators use every day selects with
// `.eq('channel', 'general')` on a TEXT column. If a Spanish message were
// written with channel='general' it would appear in the UK creators' chat.
// So every chapter room writes a NAMESPACED key, `<slug>:<key>`, which that
// query can never match. Rooms cannot merge by construction, not by care.
//
// Worldwide is the exception and deliberately so: its #general IS the existing
// conversation (110 of the platform's 127 messages), so it keeps the bare key
// and shows the real thread rather than an empty room pretending to be it.

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
  const endRef = useRef(null)

  const active = useMemo(
    () => channels.find((c) => c.key === channelKey) || channels[0] || null,
    [channels, channelKey],
  )

  // The one room that is genuinely live to every creator on the platform.
  // Posting here during a preview would reach all 44 of them, so the composer
  // is disabled rather than trusting whoever is testing to notice.
  const isLiveWorldwide = community?.kind === 'network'
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  async function send(e) {
    e?.preventDefault?.()
    const text = body.trim()
    if (!text || !canPost || sending) return
    setSending(true)
    setBody('')
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
    return <div className="mx-auto w-full max-w-5xl px-4 py-8"><Skeleton className="h-96" /></div>
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

  return (
    <NetworkMotion>
      <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 lg:pb-24 lg:pt-8">
        <div className="mb-5">
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

        {/* Rooms belonging to THIS community only. There is deliberately no
            market switcher on this page: a strip of other markets above a
            conversation makes the room feel like a tab in a directory rather
            than somewhere you are. Leaving is the back link, one target. */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <nav aria-label="Rooms" className="lg:w-56 lg:shrink-0">
            <div className="-mx-4 overflow-x-auto px-4 lg:hidden">
              <div className="flex gap-2 pb-1">
                {channels.map((c) => (
                  <button key={c.id} onClick={() => navigate(`${base}/${c.key}`)}
                    className={cx(
                      'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5',
                      active?.key === c.key
                        ? 'border-brand bg-brand-tint text-brand'
                        : 'border-gray-200 bg-white text-smoke hover:text-ink',
                    )}>
                    <Icon name={c.icon || 'chat'} className="h-4 w-4" />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="hidden rounded-card border border-gray-100 bg-white p-2 shadow-card lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-0.5">
              {channels.map((c) => (
                <button key={c.id} onClick={() => navigate(`${base}/${c.key}`)}
                  className={cx(
                    'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-200',
                    active?.key === c.key ? 'bg-brand-tint text-brand' : 'text-ink hover:bg-cloud',
                  )}>
                  <Icon name={c.icon || 'chat'}
                    className={cx('h-4 w-4 shrink-0', active?.key === c.key ? 'text-brand' : 'text-smoke')} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.label}</span>
                  {c.visibility === 'staff' && (
                    <span className="shrink-0 rounded-full bg-cloud px-1.5 py-0.5 text-[10px] font-medium text-smoke">Staff</span>
                  )}
                </button>
              ))}
            </div>
          </nav>

          <div className="flex h-[min(70vh,640px)] min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
          {active && (
            <div className="shrink-0 border-b border-gray-100 px-5 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Icon name={active.icon || 'chat'} className="h-4 w-4 text-brand" />
                {active.label}
              </p>
              {active.hint && <p className="mt-0.5 text-xs text-smoke">{active.hint}</p>}
            </div>
          )}

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {loading ? (
              <><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <Icon name="chat" className="h-8 w-8 text-gray-200" />
                <p className="text-sm font-medium">Nothing here yet</p>
                <p className="max-w-xs text-xs text-smoke">
                  This room is brand new. It is separate from every other market, so it starts empty.
                </p>
              </div>
            ) : (
              messages.map((m, i) => {
                const mine = m.sender_id === user?.id
                const prev = messages[i - 1]
                const grouped = prev && prev.sender_id === m.sender_id
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SOFT_SPRING}
                    className={cx('flex gap-3', grouped && 'mt-1')}
                  >
                    <div className="w-9 shrink-0">
                      {!grouped && <Avatar src={m.profiles?.photo_url} name={m.profiles?.name} size="sm" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      {!grouped && (
                        <p className="mb-0.5 flex items-baseline gap-2">
                          <span className="text-sm font-semibold">{m.profiles?.name || 'Someone'}</span>
                          {m.profiles?.is_admin && (
                            <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold text-brand">Team</span>
                          )}
                          <span className="text-[11px] text-smoke">{timeAgo(m.created_at)}</span>
                        </p>
                      )}
                      <p className={cx('whitespace-pre-wrap break-words text-sm', mine ? 'text-ink' : 'text-ink')}>
                        {m.body}
                      </p>
                    </div>
                  </motion.div>
                )
              })
            )}
            <div ref={endRef} />
          </div>

          <div className="shrink-0 border-t border-gray-100 p-3">
            {isLiveWorldwide ? (
              <p className="rounded-xl bg-cloud px-4 py-3 text-center text-xs text-smoke">
                Worldwide is the room every creator is already in. It is read only here so a test message cannot reach all {' '}
                <span className="font-semibold">44 of them</span> by accident. Post in a market room to try this out.
              </p>
            ) : !canPost ? (
              <p className="rounded-xl bg-cloud px-4 py-3 text-center text-xs text-smoke">
                Only the team posts in {active?.label}.
              </p>
            ) : (
              <form onSubmit={send} className="flex items-center gap-2">
                <input
                  className="input"
                  placeholder={`Message ${active?.label}`}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  aria-label={`Message ${active?.label}`}
                />
                <button
                  type="submit"
                  disabled={!body.trim() || sending}
                  className="btn-primary shrink-0 !px-5 !py-2.5"
                >
                  {sending ? '…' : 'Send'}
                </button>
              </form>
            )}
          </div>
          </div>
        </div>
      </div>
    </NetworkMotion>
  )
}
