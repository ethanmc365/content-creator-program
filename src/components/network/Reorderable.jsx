import { useEffect, useState } from 'react'
import { cx } from '../../lib/utils'

// A vertical list you can drag into your own order, by grabbing it anywhere.
//
// WHY NOT HTML5 DRAG AND DROP
//
// The admin panel's tool cards use `draggable` + dragstart/drop, and that was
// fine there because the admin panel is a desktop surface. This list is in the
// rail on the Worldwide hub, which every creator sees, and a good half of them
// are on a phone. HTML5 drag events do not fire from touch at all.
//
// GRAB IT ANYWHERE, WITHOUT BREAKING THE LINK OR THE SCROLL
//
// The first version only let you drag a 24px grip on the right, which is a
// target you have to aim at and, on a phone, one you will miss. The whole row is
// now the handle. That creates two problems this component has to solve, because
// the row is also a link and the page also scrolls:
//
//   TAP vs DRAG.   A mouse starts dragging after 6px of movement, which is
//                  unambiguous. A finger cannot use a movement threshold at all,
//                  because the first 6px of a finger moving down a page is a
//                  SCROLL. So touch arms the drag with a 320ms hold instead, the
//                  gesture every phone already uses for "pick this up".
//   THE CLICK.     A drag ends in a click on the link underneath. That is
//                  swallowed in the capture phase, using a module-scoped flag
//                  rather than a ref: only one drag can be in flight in the
//                  whole app, and reading a ref during render is both a lint
//                  error here and a real hazard (see below).
//
// WHY THERE ARE NO REFS
//
// The row handlers are closures created inside a `.map()` during render, and
// `react-hooks/refs` cannot tell that they only read the ref later. Rather than
// silence the rule, the drag carries its own measurements in STATE, snapshotted
// on pointerdown while the geometry is still untransformed. That is more correct
// anyway: measuring mid-drag would feed our own translations back in.

const GLIDE = 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)'
const HOLD_MS = 320
const MOUSE_THRESHOLD = 6

// One drag exists at a time in the entire application, so this does not need to
// be per-instance. It is read synchronously by the click handler one tick after
// pointerup, which is exactly the window a state update would miss.
let swallowNextClick = false

export default function Reorderable({
  items,
  getId = (it) => it.id,
  onReorder,
  renderItem,
  className,
  handleLabel = 'Drag to reorder',
}) {
  // { id, from, to, dy, startY, pointerId, armed, tops[], heights[] }
  const [drag, setDrag] = useState(null)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // The hold timer that arms a touch drag. Cleared by any move or release.
  useEffect(() => {
    if (!drag || drag.armed || drag.pointerType === 'mouse') return undefined
    const t = setTimeout(() => setDrag((prev) => (prev ? { ...prev, armed: true } : prev)), HOLD_MS)
    return () => clearTimeout(t)
  }, [drag])

  function down(e, index, id) {
    // Left button, touch or pen. A right-click drag would leave the list stuck
    // mid-reorder underneath an open context menu.
    if (e.button != null && e.button !== 0) return
    const row = e.currentTarget.closest('[data-reorder-row]')
    const rows = row ? Array.from(row.parentElement.children) : []
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDrag({
      id,
      from: index,
      to: index,
      dy: 0,
      startY: e.clientY,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      // A mouse is not armed until it has moved; a finger is not armed until it
      // has been still. Both start disarmed so a plain click never reorders.
      armed: false,
      tops: rows.map((r) => r.offsetTop),
      heights: rows.map((r) => r.offsetHeight),
    })
  }

  function move(e) {
    setDrag((prev) => {
      if (!prev || e.pointerId !== prev.pointerId) return prev
      const dy = e.clientY - prev.startY

      if (!prev.armed) {
        // A finger that moves before the hold completes is scrolling the page.
        // Let it, and abandon the drag entirely.
        if (prev.pointerType !== 'mouse') {
          return Math.abs(dy) > 8 ? null : prev
        }
        if (Math.abs(dy) < MOUSE_THRESHOLD) return prev
        return { ...prev, armed: true, dy, to: prev.from }
      }

      // The centre of the held row in its original coordinate space, and which
      // slot's midpoint it has now crossed.
      const heldCentre = prev.tops[prev.from] + prev.heights[prev.from] / 2 + dy
      let to = prev.from
      if (dy > 0) {
        for (let i = prev.from + 1; i < prev.tops.length; i += 1) {
          if (heldCentre > prev.tops[i] + prev.heights[i] / 2) to = i
        }
      } else if (dy < 0) {
        for (let i = prev.from - 1; i >= 0; i -= 1) {
          if (heldCentre < prev.tops[i] + prev.heights[i] / 2) to = i
        }
      }
      return { ...prev, dy, to }
    })
  }

  function up(e) {
    if (!drag) return
    e.currentTarget.releasePointerCapture?.(drag.pointerId)
    const { from, to, armed } = drag
    setDrag(null)
    if (!armed) return // it was a tap; let the link have it
    swallowNextClick = true
    if (to !== from) {
      const next = items.slice()
      next.splice(to, 0, next.splice(from, 1)[0])
      onReorder(next)
    }
  }

  // How far a row that is NOT held has to move to make room for the one that is.
  function shiftFor(index) {
    if (!drag?.armed) return 0
    const { from, to, heights } = drag
    if (index === from) return 0
    const h = heights[from] || 0
    if (from < to && index > from && index <= to) return -h
    if (from > to && index < from && index >= to) return h
    return 0
  }

  function nudge(index, delta) {
    const to = index + delta
    if (to < 0 || to >= items.length) return
    const next = items.slice()
    next.splice(to, 0, next.splice(index, 1)[0])
    onReorder(next)
  }

  return (
    <div className={cx('relative', className)}>
      {items.map((it, i) => {
        const id = getId(it)
        const held = drag?.armed && drag.id === id
        const shift = shiftFor(i)
        return (
          <div
            key={id}
            data-reorder-row
            onPointerDown={(e) => down(e, i, id)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onClickCapture={(e) => {
              if (!swallowNextClick) return
              swallowNextClick = false
              e.preventDefault()
              e.stopPropagation()
            }}
            style={{
              transform: held ? `translateY(${drag.dy}px)` : shift ? `translateY(${shift}px)` : undefined,
              // The held row must not animate: it is glued to the pointer.
              // Everything else glides, unless the user asked it not to.
              transition: held || reduced ? 'none' : GLIDE,
              zIndex: held ? 20 : undefined,
              position: 'relative',
              // `pan-y` until the drag is armed, so an unarmed touch still
              // scrolls the page. `none` once armed, so the browser stops
              // competing for the gesture we have taken over.
              touchAction: held ? 'none' : 'pan-y',
              cursor: held ? 'grabbing' : undefined,
            }}
            className={cx(held && 'scale-[1.01] rounded-xl bg-white shadow-lift')}
          >
            {renderItem(it, {
              dragging: held,
              // Kept for the keyboard path and as a visible affordance. The row
              // itself is the handle now; this is how you reorder without a
              // pointer at all.
              handleProps: {
                role: 'button',
                tabIndex: 0,
                'aria-label': handleLabel,
                onKeyDown: (e) => {
                  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
                  e.preventDefault()
                  nudge(i, e.key === 'ArrowUp' ? -1 : 1)
                },
              },
            })}
          </div>
        )
      })}
    </div>
  )
}
