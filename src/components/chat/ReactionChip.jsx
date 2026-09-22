import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { Avatar } from '../ui'
import { cx } from '../../lib/utils'

// A REACTION, AND WHO IS BEHIND IT (22 Sep 2026, third design).
//
// Ethan: "whenever you hover over one to see who reacted, it shows up their
// names all in a row in black which can't really be read, it should be a nice
// popup, similar to how it looks when you check who views the message, but
// just a popup when hovering over it, or when holding down on it on mobile.
// Also holding down on the reaction button shouldn't show up the blue bar to
// copy text... I also want you to improve the UI of the reactions, currently
// it shows a heart with 1 and has a weird box around it."
//
// So:
//  * THE CHIP IS THE EMOJI AND THE NUMBER. No border, no box. Yours carries a
//    soft brand wash and a brand number so you can still see which ones you
//    added; everybody's grows a touch on hover.
//  * THE PEOPLE ARE A CARD, NOT A SENTENCE. Faces and names in a list, the same
//    shape as the "Seen by" dialog, portalled to the body (a chat bubble lives
//    inside a clipped, transformed overlay - see SeenBy for why that matters).
//    A mouse opens it by hovering; a finger opens it by HOLDING. A tap still
//    toggles the reaction, as it always has.
//  * A HOLD SELECTS NOTHING. `select-none` plus `-webkit-touch-callout: none`
//    and a swallowed context menu, so iOS never raises its copy bar over a
//    chip. The message text beside it is untouched and still selectable.

// id -> { name, photo_url }, shared by every chip on the page and never
// refetched: a face does not change while you read a thread.
const people = new Map()
const asked = new Set()
async function loadPeople(ids) {
  const missing = ids.filter((id) => id && !asked.has(id))
  if (!missing.length) return
  missing.forEach((id) => asked.add(id))
  const { data } = await supabase.from('profiles').select('id, name, photo_url').in('id', missing)
  for (const p of data || []) people.set(p.id, p)
}

const HOLD_MS = 420
const canHover = () => typeof window !== 'undefined'
  && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches

export default function ReactionChip({ emoji, count, mine, names = [], ids = [], myId = null, side = 'left', onClick }) {
  const chip = useRef(null)
  const card = useRef(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const [tick, setTick] = useState(0)
  const hold = useRef(null)
  const held = useRef(false)
  const start = useRef(null)
  const hoverT = useRef(null)

  const label = reactorTitle(names, count)

  const show = useCallback(() => {
    setOpen(true)
    if (ids.length) loadPeople(ids).then(() => setTick((n) => n + 1))
  }, [ids])
  const hide = useCallback(() => { setOpen(false); setPos(null) }, [])

  // Where the card goes: above the chip, anchored to the chip's own side, kept
  // on screen; below it when there is no room above.
  useLayoutEffect(() => {
    if (!open) return
    const c = chip.current?.getBoundingClientRect()
    const box = card.current?.getBoundingClientRect()
    if (!c || !box) return
    const pad = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = side === 'right' ? c.right - box.width : c.left
    left = Math.max(pad, Math.min(vw - box.width - pad, left))
    const above = c.top - box.height - 8
    const top = above >= pad ? above : Math.min(vh - box.height - pad, c.bottom + 8)
    setPos((p) => (p && Math.abs(p.left - left) < 1 && Math.abs(p.top - top) < 1 ? p : { left, top, below: above < pad }))
  }, [open, side, tick, count])

  // Close on Escape, on a press anywhere else, and when the thread scrolls.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') hide() }
    const onDown = (e) => {
      if (chip.current?.contains(e.target) || card.current?.contains(e.target)) return
      hide()
    }
    const onScroll = () => hide()
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, hide])

  useEffect(() => () => { clearTimeout(hold.current); clearTimeout(hoverT.current) }, [])

  // ---- mouse: hover
  const onEnter = (e) => {
    if (e.pointerType !== 'mouse' || !canHover()) return
    clearTimeout(hoverT.current)
    hoverT.current = setTimeout(show, 140)
  }
  const onLeave = (e) => {
    if (e.pointerType !== 'mouse') return
    clearTimeout(hoverT.current)
    hoverT.current = setTimeout(hide, 160)
  }

  // ---- finger: hold
  const onDown = (e) => {
    if (e.pointerType === 'mouse') return
    held.current = false
    start.current = { x: e.clientX, y: e.clientY }
    clearTimeout(hold.current)
    hold.current = setTimeout(() => { held.current = true; show() }, HOLD_MS)
  }
  const onMove = (e) => {
    if (!start.current) return
    if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) clearTimeout(hold.current)
  }
  const onUp = () => { clearTimeout(hold.current); start.current = null }

  const onPress = (e) => {
    // A hold opened the list; the finger lifting is not also a tap.
    if (held.current) { held.current = false; e.preventDefault(); return }
    hide()
    onClick?.()
  }

  const list = ids.length
    ? ids.map((id, i) => {
      const p = people.get(id)
      const you = id === myId || names[i] === 'You'
      return { id, you, name: you ? 'You' : (p?.name || names[i] || 'Someone'), photo_url: p?.photo_url }
    })
    : names.map((n, i) => ({ id: `n${i}`, you: n === 'You', name: n, photo_url: null }))
  // You first, then everybody in the order they reacted.
  list.sort((a, b) => Number(b.you) - Number(a.you))

  return (
    <>
      <button
        ref={chip}
        type="button"
        onClick={onPress}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
        aria-pressed={mine}
        aria-label={`${emoji} ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
        className={cx(
          'reaction-chip inline-flex select-none items-center gap-1 rounded-full px-1.5 py-0.5 leading-none transition-[transform,background-color] duration-150 ease-out',
          'hoverable:hover:scale-110 active:scale-95',
          mine ? 'bg-brand-tint' : 'hoverable:hover:bg-cloud',
        )}
      >
        <span aria-hidden className="text-[17px] leading-none">{emoji}</span>
        <span className={cx('text-xs font-semibold tabular-nums', mine ? 'text-brand' : 'text-smoke')}>{count}</span>
      </button>

      {open && createPortal(
        <div
          ref={card}
          role="dialog"
          aria-label={label}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') clearTimeout(hoverT.current) }}
          onPointerLeave={onLeave}
          style={{
            position: 'fixed',
            left: pos?.left ?? -9999,
            top: pos?.top ?? -9999,
            visibility: pos ? 'visible' : 'hidden',
            WebkitTouchCallout: 'none',
          }}
          className={cx(
            'z-[130] w-60 select-none overflow-hidden rounded-2xl border border-gray-100 bg-white text-ink shadow-lift',
            pos && (pos.below ? 'origin-top' : 'origin-bottom'),
            pos && 'animate-menu-in',
          )}
        >
          <div className="flex items-center gap-2.5 border-b border-gray-100 px-3.5 py-2.5">
            <span className="text-2xl leading-none">{emoji}</span>
            <span className="text-sm font-semibold">
              {count} {count === 1 ? 'reaction' : 'reactions'}
            </span>
          </div>
          <ul className="max-h-60 overflow-y-auto overscroll-contain p-1.5">
            {list.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                <Avatar src={p.photo_url} name={p.name} size="xs" className="!h-7 !w-7" />
                <span className={cx('min-w-0 flex-1 truncate text-sm', p.you ? 'font-semibold text-brand' : 'font-medium')}>
                  {p.name}
                </span>
              </li>
            ))}
          </ul>
          {mine && (
            <p className="border-t border-gray-100 px-3.5 py-2 text-[11px] text-smoke">Tap the reaction to remove yours</p>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

// "Ana, Ben and Chi reacted" - the accessible name, and the fallback when no
// names came through.
export function reactorTitle(names, count) {
  const list = (names || []).filter(Boolean)
  if (!list.length) return `${count} ${count === 1 ? 'reaction' : 'reactions'}`
  if (list.length === 1) return `${list[0]} reacted`
  if (list.length === 2) return `${list[0]} and ${list[1]} reacted`
  if (list.length === 3) return `${list[0]}, ${list[1]} and ${list[2]} reacted`
  return `${list.slice(0, 3).join(', ')} and ${list.length - 3} more reacted`
}
