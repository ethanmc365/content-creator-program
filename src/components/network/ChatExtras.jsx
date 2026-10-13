import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { Avatar } from '../ui'
import { matchBroadcasts } from '../../lib/broadcastMentions'
import { overlay } from '../../lib/motion'

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

// NAMES FOR A SET OF PROFILE IDS, fetched once and cached.
//
// A reaction row carries a creator_id and nothing else, and the lists each chat
// page already has are the wrong shape to resolve it: the rooms' `members`
// query filters out `is_test` profiles, and neither page holds anybody who has
// since left. Every id it cannot name came out as "Someone", which is what made
// the reaction tooltip look broken even after it was drawing.
//
// So anything still unnamed is looked up directly, once per id, and kept. The
// pages pass their own list in first, so this usually fetches nothing at all.
export function useProfileNames(ids) {
  const [map, setMap] = useState(() => new Map())
  // A ref of what has been asked for, so a fetch in flight is never repeated
  // and `map` does not have to be a dependency (which would re-run on its own
  // result, forever).
  const asked = useRef(new Set())
  const key = [...new Set((ids || []).filter(Boolean))].sort().join(',')

  useEffect(() => {
    const want = key ? key.split(',') : []
    const missing = want.filter((id) => !asked.current.has(id))
    if (!missing.length) return undefined
    missing.forEach((id) => asked.current.add(id))
    let alive = true
    supabase.from('profiles').select('id, name').in('id', missing)
      .then(({ data }) => {
        if (!alive || !data?.length) return
        setMap((cur) => {
          const next = new Map(cur)
          for (const p of data) next.set(p.id, p.name)
          return next
        })
      })
    return () => { alive = false }
  }, [key])

  return map
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

export function MentionMenu({ query, members, onPick, onClose, isAdmin = false }) {
  const hits = useMemo(() => {
    const q = query.toLowerCase()
    const people = members.filter((m) => m.name?.toLowerCase().includes(q))
    // @everyone / @here lead the list for the team. They are what you go
    // looking for on purpose, and six near-matching names above them is how a
    // control ends up believed not to exist.
    return [...matchBroadcasts(q, isAdmin), ...people].slice(0, 6)
  }, [members, query, isAdmin])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const [anchor, setAnchor] = useState(null)
  const [rect, setRect] = useState(null)
  useEffect(() => {
    if (!anchor) return undefined
    const measure = () => {
      const r = anchor.getBoundingClientRect()
      const left = Math.max(8, r.left)
      setRect({ top: r.top, left, width: Math.min(r.width || 320, window.innerWidth - left - 8, 420) })
    }
    measure()
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [anchor, query])

  // A POP-UP OVER THE PAGE, JUST ABOVE THE MESSAGE BOX (12 Oct 2026). Ethan: "whenever I type in the @ symbol to actually
  // tag a creator, it shows up at the very, very top, and I can't even click it." It was `absolute bottom-full` with no
  // positioned parent in between, so it hung off whichever ancestor was positioned - the room's top - under the header.
  // Now an invisible marker sits where the menu used to be and the menu is drawn into <body>, fixed above that marker,
  // so no scroller, transform or header can move or cover it. A press keeps the caret in the box (mousedown is held).
  return (
    <>
      <span ref={setAnchor} aria-hidden className="block h-0 w-full" />
      {hits.length > 0 && rect && createPortal(
        <motion.div
          {...overlay}
          role="listbox"
          aria-label="People to mention"
          style={{ position: 'fixed', left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 14 }}
          className="z-[120] max-h-[min(18rem,50vh)] overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 bg-white py-1 shadow-lift"
        >
          {hits.map((m) => (
            <button
              key={m.id}
              type="button"
              role="option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(m)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-cloud active:bg-brand-tint"
            >
              {m.broadcast ? (
                <>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-brand">
                    <Icon name="megaphone" className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{m.label}</span>
                    <span className="block truncate text-[11px] text-smoke">{m.hint}</span>
                  </span>
                </>
              ) : (
                <>
                  <Avatar src={m.photo_url} name={m.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
                </>
              )}
            </button>
          ))}
        </motion.div>,
        document.body,
      )}
    </>
  )
}
