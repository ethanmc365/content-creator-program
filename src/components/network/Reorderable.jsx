import { useEffect, useState } from 'react'
import { cx } from '../../lib/utils'

// A vertical list you can drag into your own order.
//
// WHY NOT HTML5 DRAG AND DROP
//
// The admin panel's tool cards use `draggable` + dragstart/drop, and that was
// fine there because the admin panel is a desktop surface. This list is in the
// rail on the Worldwide hub, which every creator sees, and a good half of them
// are on a phone. HTML5 drag events do not fire from touch at all: the feature
// would simply not exist for the people most likely to want their own order.
//
// Pointer Events cover mouse, touch and pen with one code path, and
// setPointerCapture keeps the drag alive when the pointer leaves the handle -
// which it does immediately, because the handle is 24px wide and a drag is
// 200px long.
//
// WHY THERE ARE NO REFS IN HERE
//
// The obvious implementation keeps the row elements and the in-flight drag in
// refs. It also trips `react-hooks/refs`, and not spuriously: the row handlers
// are closures created inside a `.map()` during render, and a linter cannot tell
// that they only read the ref later. Rather than silence the rule, the drag
// carries its own measurements in STATE - taken once on pointerdown, when the
// geometry is still untransformed. Every move is then arithmetic on a snapshot
// instead of a fresh read of a DOM we are busy transforming, which is more
// correct anyway: measuring mid-drag would feed our own translations back in.
//
// HOW IT FEELS
//
// The row you are holding tracks the pointer 1:1 from where you grabbed it and
// never snaps to its own centre. The rows it displaces glide out of the way
// while the held row stays exactly under your finger, so the list reads as a
// physical stack being reordered rather than a list being recalculated.
//
// Reduced motion keeps the drag - it is direct manipulation, not decoration -
// and drops the displacement glide, which is the part that moves things the user
// did not touch.

const GLIDE = 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)'

export default function Reorderable({
  items,
  getId = (it) => it.id,
  onReorder,
  renderItem,
  className,
  handleLabel = 'Drag to reorder',
}) {
  // { id, from, to, dy, startY, pointerId, tops[], heights[] }
  const [drag, setDrag] = useState(null)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  function start(e, index, id) {
    // Left button, touch or pen. A right-click drag would leave the list stuck
    // mid-reorder underneath an open context menu.
    if (e.button != null && e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)

    // The handle sits inside the row; the row's siblings are the whole list.
    // Measured here, once, while nothing is transformed.
    const row = e.currentTarget.closest('[data-reorder-row]')
    const rows = row ? Array.from(row.parentElement.children) : []
    setDrag({
      id,
      from: index,
      to: index,
      dy: 0,
      startY: e.clientY,
      pointerId: e.pointerId,
      tops: rows.map((r) => r.offsetTop),
      heights: rows.map((r) => r.offsetHeight),
    })
  }

  function move(e) {
    setDrag((prev) => {
      if (!prev || e.pointerId !== prev.pointerId) return prev
      const dy = e.clientY - prev.startY
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

  function end(e) {
    if (!drag) return
    e.currentTarget.releasePointerCapture?.(drag.pointerId)
    const { from, to } = drag
    setDrag(null)
    if (to !== from) {
      const next = items.slice()
      next.splice(to, 0, next.splice(from, 1)[0])
      onReorder(next)
    }
  }

  // How far a row that is NOT held has to move to make room for the one that is.
  function shiftFor(index) {
    if (!drag) return 0
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
        const held = drag?.id === id
        const shift = shiftFor(i)
        return (
          <div
            key={id}
            data-reorder-row
            style={{
              transform: held ? `translateY(${drag.dy}px)` : shift ? `translateY(${shift}px)` : undefined,
              // The held row must not animate: it is glued to the pointer.
              // Everything else glides, unless the user asked it not to.
              transition: held || reduced ? 'none' : GLIDE,
              zIndex: held ? 20 : undefined,
              position: 'relative',
            }}
            className={cx(held && 'rounded-xl bg-white shadow-lift')}
          >
            {renderItem(it, {
              dragging: held,
              handleProps: {
                onPointerDown: (e) => start(e, i, id),
                onPointerMove: move,
                onPointerUp: end,
                onPointerCancel: end,
                role: 'button',
                tabIndex: 0,
                'aria-label': handleLabel,
                // Keyboard is the accessible path to the same outcome. A handle
                // that only answers to a pointer excludes exactly the people who
                // most need to put things where they can reach them.
                onKeyDown: (e) => {
                  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
                  e.preventDefault()
                  nudge(i, e.key === 'ArrowUp' ? -1 : 1)
                },
                // Without this the browser claims the gesture as a page scroll
                // the moment the finger moves vertically, which is every drag.
                style: { touchAction: 'none', cursor: 'grab' },
              },
            })}
          </div>
        )
      })}
    </div>
  )
}
