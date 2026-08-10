import { useEffect, useState } from 'react'
import { cx } from '../../lib/utils'

// A vertical list you can drag into your own order, BY THE GRIP.
//
// WHY NOT HTML5 DRAG AND DROP
//
// The admin panel's tool cards use `draggable` + dragstart/drop, and that was
// fine there because the admin panel is a desktop surface. This list is in the
// rail on the Worldwide hub, which every creator sees, and a good half of them
// are on a phone. HTML5 drag events do not fire from touch at all.
//
// WHY THE GRIP AND NOT THE WHOLE ROW
//
// The whole row was the handle for one release, and it broke the rows. Every
// item here is a LINK, and a link whose surface is also a drag handle has to
// guess which one you meant every single time you touch it - so it guesses with
// a 6px threshold for a mouse and a 320ms hold for a finger, and both guesses
// are wrong often enough that people reported the navigation as simply not
// working. There is no threshold that separates "tapped a link" from "started
// to drag" reliably, because at the moment of contact those gestures are
// identical.
//
// So the two gestures get two targets. Press the row, you navigate - always,
// immediately, no hold, no threshold, no swallowed click. Press the grip, you
// are dragging - also immediately, because the grip does nothing else and
// therefore has nothing to disambiguate. The grip is a real affordance too:
// it is the same three-dots you already drag the admin tool cards by.
//
// A pleasant consequence: the grip is a SIBLING of the link, not a child, and
// it takes pointer capture, so the click that ends a drag lands on the grip
// and goes nowhere. The old version needed a module-scoped flag and a
// capture-phase click handler to eat that click, and needed them only because
// the link was the handle.
//
// WHY THERE ARE NO REFS
//
// The handle handlers are closures created inside a `.map()` during render, and
// `react-hooks/refs` cannot tell that they only read the ref later. Rather than
// silence the rule, the drag carries its own measurements in STATE, snapshotted
// on pointerdown while the geometry is still untransformed. That is more correct
// anyway: measuring mid-drag would feed our own translations back in.

const GLIDE = 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)'

// The nearest ancestor that actually scrolls, so a drag inside a scrolling
// panel can subtract the panel's own movement back out.
function findScroller(node) {
  let el = node?.parentElement
  while (el && el !== document.body) {
    const oy = getComputedStyle(el).overflowY
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el
    el = el.parentElement
  }
  return null
}

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

  function down(e, index, id) {
    // Left button, touch or pen. A right-click drag would leave the list stuck
    // mid-reorder underneath an open context menu.
    if (e.button != null && e.button !== 0) return
    // The grip is inside the link. Without this, pressing it also starts the
    // browser's own text-selection / link-drag behaviour.
    e.preventDefault()
    e.stopPropagation()
    const row = e.currentTarget.closest('[data-reorder-row]')
    const rows = row ? Array.from(row.parentElement.children) : []
    // THE LIST MAY LIVE INSIDE SOMETHING THAT SCROLLS.
    //
    // The rooms sidebar does. `clientY` is measured against the VIEWPORT, so
    // any scroll during a drag added itself to the offset and the held card
    // slid away on its own. Remembering the scroller and its starting scrollTop
    // lets `move` subtract that back out.
    const scroller = findScroller(row)
    setDrag({
      id,
      from: index,
      to: index,
      dy: 0,
      startY: e.clientY,
      scroller,
      startScroll: scroller ? scroller.scrollTop : 0,
      pointerId: e.pointerId,
      tops: rows.map((r) => r.offsetTop),
      heights: rows.map((r) => r.offsetHeight),
    })
  }

  // THE DRAG IS OWNED BY THE DOCUMENT, NOT BY THE GRIP.
  //
  // THE BUG THIS FIXES. The move/up handlers used to live on the grip itself,
  // with `setPointerCapture` keeping the stream pointed at it. That works right
  // up until the capture is lost - and it is lost routinely: the pointer leaves
  // the window, the tab loses focus, the browser drops the capture when the
  // captured node moves under a transform, or the row re-renders. When it goes,
  // `pointerup` is delivered somewhere else, `up` never runs, and `drag` stays
  // set forever. What that LOOKS like is exactly what was reported: you let go
  // and the card just hangs there on top of another one, glued to nothing,
  // unfixable without a reload. Worse, `releasePointerCapture` THROWS if the id
  // is no longer active, so even a stray release could abort `up` before the
  // `setDrag(null)` on the next line.
  //
  // Listening on the document instead means every possible ending is heard:
  // pointerup anywhere on the page, pointercancel, the window losing focus, or
  // Escape. There is no path left where a drag can survive the gesture that
  // started it. The effect also unsubscribes on unmount, so navigating away
  // mid-drag cannot leave listeners behind.
  useEffect(() => {
    if (!drag) return undefined

    const move = (e) => {
      if (e.pointerId !== drag.pointerId) return
      // A touch drag must not also scroll the page. `touch-action: none` on the
      // grip covers the common case; this covers a browser that has already
      // decided otherwise.
      if (e.cancelable) e.preventDefault()
      setDrag((prev) => {
        if (!prev || e.pointerId !== prev.pointerId) return prev
        const scrolled = prev.scroller ? prev.scroller.scrollTop - prev.startScroll : 0
        const dy = e.clientY - prev.startY + scrolled

        // The centre of the held row in its original coordinate space, and
        // which slot's midpoint it has now crossed.
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

    // Commit whatever slot the card is over. There is no "invalid drop": a
    // release is always a decision, and releasing over nothing means "leave it
    // where it looks like it is", never "keep holding it".
    const finish = (commit) => {
      const { from, to } = drag
      setDrag(null)
      if (commit && to !== from) {
        const next = items.slice()
        next.splice(to, 0, next.splice(from, 1)[0])
        onReorder(next)
      }
    }

    const onUp = (e) => { if (e.pointerId === drag.pointerId) finish(true) }
    const onCancel = (e) => { if (e.pointerId === drag.pointerId) finish(false) }
    const onBlur = () => finish(false)
    const onKey = (e) => { if (e.key === 'Escape') finish(false) }

    document.addEventListener('pointermove', move, { passive: false })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onBlur)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('keydown', onKey)
    }
  }, [drag, items, onReorder])

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
            // NOTHING IS PAINTED ON THE WRAPPER. No scale (that put faint grey
            // seams down the side of the list - a half-pixel of the row under
            // showing past the edge of the one on top) and, now, no shadow
            // either: `shadow-lift` on a plain div behind a card with its own
            // larger corner radius drew grey arcs poking out at all four
            // corners, which is the "grey outline on that column" that survived
            // the last fix. The card itself already knows it is being dragged -
            // `renderItem` gets `dragging` - so the elevation belongs there,
            // inside the same border radius as the thing being lifted.
          >
            {renderItem(it, {
              dragging: held,
              // Everything the grip needs. Spread this onto the three-dots
              // button and nothing else: it is the ONLY drag surface, which is
              // what keeps a plain press on the row a plain navigation.
              handleProps: {
                role: 'button',
                tabIndex: 0,
                'aria-label': handleLabel,
                // The grip never scrolls the page - it has exactly one job and
                // the browser must not compete for the gesture.
                style: { touchAction: 'none', cursor: held ? 'grabbing' : 'grab' },
                // Only the START of the drag is the grip's business. Everything
                // after it belongs to the document - see the effect above.
                onPointerDown: (e) => down(e, i, id),
                // Stop a press on the grip reaching the link underneath at all.
                onClick: (e) => { e.preventDefault(); e.stopPropagation() },
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
