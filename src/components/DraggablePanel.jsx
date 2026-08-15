import { useCallback, useEffect, useState } from 'react'

// MOVE THE CARD OUT OF THE WAY OF THE THING IT IS DESCRIBING.
//
// WHY THIS EXISTS. On the full-screen creator map the country and town panels
// live in one fixed corner. That corner is fine most of the time and wrong
// exactly when it matters: tap Spain and the card lands on Portugal, tap Norway
// and it covers half of Scandinavia, and the only way to see underneath is to
// close the card you opened to read. Ethan: "when you tap a country and the
// popup card comes up, it should be draggable around the page so you can ensure
// it's not covering any countries you want to see."
//
// THE THREE THINGS THAT MAKE A DRAG HANDLE NOT RUIN A CARD
//
//   1. THE CARD IS THE HANDLE, BUT NOT ALL OF IT. Requiring a grip strip would
//      be a smaller target than the card and one more thing to find. So a press
//      anywhere on the card starts a drag EXCEPT on something that already does
//      something: a button, a link, a form field, or a region that scrolls. The
//      roster inside these panels is a scroller and dragging a card by its list
//      would make the list unusable, which is the whole "doesn't affect
//      scrolling inside the card" half of the ask.
//   2. A THRESHOLD, SO A CLICK IS STILL A CLICK. Nothing moves until the
//      pointer has travelled 4px. Under that it was a press, and the click that
//      follows is left alone. Past it we swallow the click that the browser
//      fires at the end of the gesture, or letting go over a creator's name
//      would open their profile.
//   3. DOCUMENT LISTENERS, NOT ELEMENT ONES. `releasePointerCapture` throws if
//      the pointer id is already gone, and a capture can be lost a dozen ways -
//      pointer leaves the window, the tab blurs, the captured node moves under
//      a transform. Reorderable learned this the expensive way (a card stuck
//      mid-air with no way back but a reload), so every ending is heard here:
//      pointerup, pointercancel, window blur and Escape.
//
// MOUSE AND PEN ONLY. A touch drag starting anywhere on the card would fight
// the platform's own scroll and selection gestures for every list inside it,
// and full screen on a phone is a 390px-tall landscape window where there is
// nowhere useful to drag the card to anyway. Touch keeps the card exactly where
// it has always been.
//
// IT CANNOT BE DRAGGED OFF THE MAP. The position is clamped to the bounds it
// was given, so the card can be put anywhere over the map and can never be
// pushed past an edge and lost - which would leave somebody with a panel they
// cannot reach and no way back but closing and reopening it.

const THRESHOLD = 4

// Anything that is already a target for a press. `closest` walks up from the
// actual node, so a press on the text inside a button still finds the button.
const INTERACTIVE = 'button, a, input, textarea, select, [role="button"], [contenteditable="true"]'

// A region that scrolls is a region the pointer belongs to. Checked live rather
// than by class name, because "does this actually have more content than fits"
// is the question that matters and it changes with the content.
function inScroller(node, root) {
  let el = node
  while (el && el !== root) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const oy = getComputedStyle(el).overflowY
      if (oy === 'auto' || oy === 'scroll') return true
    }
    el = el.parentElement
  }
  return false
}

export default function DraggablePanel({ children, enabled = true, resetKey = null, className }) {
  const [node, setNode] = useState(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState(null)

  // A new full-screen session starts the card back in its corner. Moving it is
  // an adjustment to the view you are looking at, not a setting - and a card
  // that opens somewhere you left it a week ago on a different country reads as
  // a bug.
  useEffect(() => { setPos({ x: 0, y: 0 }) }, [resetKey])
  useEffect(() => { if (!enabled) setPos({ x: 0, y: 0 }) }, [enabled])

  // How far the card may travel before a corner leaves its container. Measured
  // at the moment the drag starts: the card's height changes with its content
  // and the container's with the window, so a value cached at mount would be
  // wrong by the time anybody used it.
  const bounds = useCallback(() => {
    if (!node) return null
    const parent = node.offsetParent || node.parentElement
    if (!parent) return null
    const p = parent.getBoundingClientRect()
    const r = node.getBoundingClientRect()
    // r is the card WHERE IT IS NOW, which already includes the current offset,
    // so the room left in each direction is measured from here and added to it.
    return {
      minX: pos.x - (r.left - p.left),
      maxX: pos.x + (p.right - r.right),
      minY: pos.y - (r.top - p.top),
      maxY: pos.y + (p.bottom - r.bottom),
    }
  }, [node, pos.x, pos.y])

  function onPointerDown(e) {
    if (!enabled || e.button !== 0 || e.pointerType === 'touch') return
    if (e.target.closest(INTERACTIVE)) return
    if (inScroller(e.target, node)) return
    setDrag({
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      fromX: pos.x,
      fromY: pos.y,
      moved: false,
      limits: bounds(),
    })
  }

  useEffect(() => {
    if (!drag) return undefined

    const clamp = (v, lo, hi) => (lo == null ? v : Math.min(hi, Math.max(lo, v)))

    const move = (e) => {
      if (e.pointerId !== drag.id) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (!drag.moved && Math.hypot(dx, dy) < THRESHOLD) return
      if (!drag.moved) setDrag((d) => (d ? { ...d, moved: true } : d))
      // Text selection is the other thing a mouse drag means, and dragging a
      // card while highlighting its own contents looks broken.
      e.preventDefault()
      const l = drag.limits
      setPos({
        x: l ? clamp(drag.fromX + dx, l.minX, l.maxX) : drag.fromX + dx,
        y: l ? clamp(drag.fromY + dy, l.minY, l.maxY) : drag.fromY + dy,
      })
    }

    const end = () => {
      // A click fires after a mouse drag ends, on whatever is under the
      // pointer. Without this, letting go over a creator's row navigates to
      // their profile - so the gesture that moved the card also leaves the page
      // the card was on.
      if (drag.moved) {
        const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault() }
        document.addEventListener('click', swallow, { capture: true, once: true })
        // If no click comes (the pointer ended outside anything clickable) the
        // listener must not sit there waiting to eat the NEXT one.
        setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 0)
      }
      setDrag(null)
    }

    const onKey = (e) => { if (e.key === 'Escape') setDrag(null) }

    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', end)
    document.addEventListener('pointercancel', end)
    window.addEventListener('blur', end)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', end)
      document.removeEventListener('pointercancel', end)
      window.removeEventListener('blur', end)
      window.removeEventListener('keydown', onKey)
    }
  }, [drag])

  const moved = pos.x !== 0 || pos.y !== 0

  return (
    <div
      ref={setNode}
      onPointerDown={onPointerDown}
      className={className}
      style={{
        transform: moved ? `translate3d(${pos.x}px, ${pos.y}px, 0)` : undefined,
        // `grab` is the whole affordance: nothing on the card says "move me",
        // so the cursor has to. It becomes `grabbing` for as long as the drag
        // lasts, on the DOCUMENT as well, or moving fast enough to leave the
        // card behind flips the cursor back mid-drag.
        cursor: enabled ? (drag?.moved ? 'grabbing' : 'grab') : undefined,
        // A card that transitions while you drag it lags behind the pointer.
        // It only animates when it is NOT being dragged, which is what makes
        // letting go feel like putting something down.
        transition: drag ? 'none' : 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        touchAction: 'auto',
      }}
    >
      {/* While a drag is live, the cursor has to win everywhere - including
          over the map underneath, which sets its own. A one-rule stylesheet is
          the only thing that reaches an element this component does not own. */}
      {drag?.moved && <style>{'*{cursor:grabbing !important}'}</style>}
      {children}
    </div>
  )
}
