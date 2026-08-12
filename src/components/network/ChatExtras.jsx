import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import ReactionPicker from '../ReactionPicker'
import { Avatar } from '../ui'
import { cx } from '../../lib/utils'
import { SNAPPY, overlay } from '../../lib/motion'

// The three things a room needs before it is a room rather than a log:
// something to react with, a way to find what was said, and a way to point at
// somebody. The legacy chat has all three; the network rooms shipped without
// them, which is why they felt like a preview rather than a place.

// ---------------------------------------------------------------- reactions
//
// Stored in the existing `reactions` table (message_id, creator_id, emoji), the
// same one the live chat uses. Reusing it means a message reacted to in a market
// room and one reacted to in #general are the same shape of data, and there is
// one place to change if reactions ever grow up.

export function ReactionRow({ messageId, reactions, myId, onToggle, revealed = false }) {
  const mine = useMemo(
    () => new Set(reactions.filter((r) => r.creator_id === myId).map((r) => r.emoji)),
    [reactions, myId],
  )
  const counts = useMemo(() => {
    const m = new Map()
    for (const r of reactions) m.set(r.emoji, (m.get(r.emoji) || 0) + 1)
    return [...m.entries()]
  }, [reactions])

  const [picking, setPicking] = useState(false)

  // THE PILLS SIT IN THE FLOW; THE ADD BUTTON FLOATS.
  //
  // They used to share one row, and because the button is only `opacity-0` when
  // hidden it still claimed its 28px under EVERY message - a permanent empty
  // strip between a message and whatever came after it. Opacity does not remove
  // a box. Reactions are content and belong in the flow; the affordance for
  // adding one is chrome and belongs over the corner of the message, which is
  // also where every other chat product puts it.
  //
  // The parent must be `relative`; NetworkChat's message column is.
  return (
    <div className={cx('flex flex-wrap items-center gap-1', counts.length > 0 && 'mt-1')}>
      <AnimatePresence initial={false}>
        {counts.map(([emoji, n]) => (
          <motion.button
            key={emoji}
            layout
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={SNAPPY}
            onClick={() => onToggle(messageId, emoji)}
            className={cx(
              'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
              mine.has(emoji)
                ? 'border-brand bg-brand-tint text-brand'
                : 'border-gray-200 bg-white text-smoke hover:border-brand/40',
            )}
          >
            <span aria-hidden>{emoji}</span>
            <span className="font-semibold tabular-nums">{n}</span>
          </motion.button>
        ))}
      </AnimatePresence>

      <div className="absolute right-0 top-0 z-10">
        <button
          onClick={() => setPicking((p) => !p)}
          aria-label="Add a reaction"
          className={cx(
            // `revealed` is the phone's answer to hover. Without it the only
            // way to open this picker was `group-hover/msg`, which never fires
            // on a touch screen - so market rooms had reactions that a phone
            // could see and could not add.
            'flex h-7 w-7 items-center justify-center rounded-full border border-gray-100 bg-white/95 text-smoke shadow-card backdrop-blur transition-all',
            'pointer-events-none opacity-0 hover:border-brand hover:text-brand focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100',
            (picking || revealed) && 'pointer-events-auto opacity-100',
          )}
        >
          <Icon name="smile" className="h-3.5 w-3.5" />
        </button>
        {picking && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setPicking(false)} />
            <ReactionPicker
              onPick={(e) => onToggle(messageId, e)}
              onClose={() => setPicking(false)}
            />
          </>
        )}
      </div>
    </div>
  )
}

export function useReactions(messageIds, myId) {
  const [rows, setRows] = useState([])
  const key = messageIds.join(',')

  useEffect(() => {
    if (!messageIds.length) { setRows([]); return }
    let alive = true
    supabase.from('reactions').select('id, message_id, creator_id, emoji')
      .in('message_id', messageIds)
      .then(({ data }) => { if (alive) setRows(data || []) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Realtime on the whole table then filtered client-side: the id list changes
  // on every page of history, and re-subscribing per list would churn a
  // websocket channel every time somebody scrolls.
  useEffect(() => {
    const ch = supabase.channel('net-reactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (payload) => {
        const row = payload.new?.id ? payload.new : payload.old
        if (!row) return
        setRows((cur) => {
          if (payload.eventType === 'DELETE') return cur.filter((r) => r.id !== row.id)
          if (cur.some((r) => r.id === row.id)) return cur
          return [...cur, row]
        })
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const byMessage = useMemo(() => {
    const m = new Map()
    for (const r of rows) {
      if (!m.has(r.message_id)) m.set(r.message_id, [])
      m.get(r.message_id).push(r)
    }
    return m
  }, [rows])

  async function toggle(messageId, emoji) {
    const existing = rows.find((r) => r.message_id === messageId && r.creator_id === myId && r.emoji === emoji)
    // Optimistic both ways: a reaction that waits for the network reads as a
    // broken button.
    if (existing) {
      setRows((cur) => cur.filter((r) => r.id !== existing.id))
      const { error } = await supabase.from('reactions').delete().eq('id', existing.id)
      if (error) setRows((cur) => [...cur, existing])
    } else {
      const temp = { id: `tmp-${Date.now()}`, message_id: messageId, creator_id: myId, emoji }
      setRows((cur) => [...cur, temp])
      const { data, error } = await supabase.from('reactions')
        .insert({ message_id: messageId, creator_id: myId, emoji })
        .select('id, message_id, creator_id, emoji').single()
      setRows((cur) => {
        const without = cur.filter((r) => r.id !== temp.id)
        return error || !data ? without : [...without, data]
      })
    }
  }

  return { byMessage, toggle }
}

// Search lives in ../ChatSearch so the eagerly routed Chat.jsx can use it
// without pulling the Motion runtime in through this file. Re-exported here so
// every existing import keeps working.
export { RoomSearch, Highlight } from '../ChatSearch'

// ----------------------------------------------------------------- mentions
//
// Autocomplete over the room's own members. Scoped to the community rather than
// every profile on the platform: @-ing somebody who cannot read the room is a
// mention that goes nowhere.

export function MentionMenu({ query, members, onPick, onClose }) {
  const hits = useMemo(() => {
    const q = query.toLowerCase()
    return members.filter((m) => m.name?.toLowerCase().includes(q)).slice(0, 6)
  }, [members, query])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (hits.length === 0) return null

  return (
    <motion.div
      {...overlay}
      className="absolute bottom-full left-3 right-3 z-30 mb-2 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lift"
    >
      {hits.map((m) => (
        <button
          key={m.id}
          onClick={() => onPick(m)}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-cloud"
        >
          <Avatar src={m.photo_url} name={m.name} size="xs" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
        </button>
      ))}
    </motion.div>
  )
}

// Renders @Name runs in brand orange. Plain-text in, React out, so a message
// body is never injected as HTML.
export function withMentions(body, names) {
  if (!names?.size) return body
  const parts = body.split(/(@[\w' -]{2,40})/g)
  return parts.map((p, i) => {
    if (!p.startsWith('@')) return p
    const clean = p.slice(1).trim().toLowerCase()
    const hit = [...names].some((n) => clean.startsWith(n))
    return hit ? <span key={i} className="font-semibold text-brand">{p}</span> : p
  })
}
