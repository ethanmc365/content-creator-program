import { useRef } from 'react'
import Icon from './Icon'
import { cx } from '../lib/utils'

// SWIPE A ROW AWAY (1 Oct 2026). Ethan: "for mobile we should have a swipe to clear notifications."
//
// Touch only: a mouse keeps the X button, and nothing here listens to it. The row follows the finger sideways
// (either way); let go past a third of its width, or flick it, and it slides off and is dismissed; anything less and
// it springs back. `touch-action: pan-y` hands vertical movement to the browser, so the list still scrolls normally
// and only a sideways gesture is ours. The drag writes the transform straight to the element - no React state per
// frame - and a press that turned into a swipe never also opens the row.
export default function SwipeToDismiss({ onDismiss, children, className, label = 'Clear' }) {
  const fg = useRef(null)
  const g = useRef(null)

  const setX = (x, animate) => {
    const el = fg.current
    if (!el) return
    el.style.transition = animate ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease' : 'none'
    el.style.transform = x ? `translate3d(${x}px,0,0)` : ''
    el.style.opacity = x ? String(Math.max(0.35, 1 - Math.abs(x) / (el.offsetWidth * 1.2))) : ''
    const bg = el.previousSibling
    if (bg) {
      bg.style.opacity = x ? '1' : '0'
      bg.style.justifyContent = x < 0 ? 'flex-end' : 'flex-start'
    }
  }

  function down(e) {
    if (e.pointerType !== 'touch') return
    g.current = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, mode: null, id: e.pointerId }
  }
  function move(e) {
    const s = g.current
    if (!s || e.pointerId !== s.id) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (!s.mode) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g.current = null; return }
      if (Math.abs(dx) < 10) return
      s.mode = 'swipe'
      try { fg.current?.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
    }
    s.dx = dx
    setX(dx, false)
  }
  function up(e) {
    const s = g.current
    if (!s || e.pointerId !== s.id) return
    g.current = null
    if (s.mode !== 'swipe') return
    // Swallow the click this release would otherwise send to the row.
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault() }
    fg.current?.addEventListener('click', stop, { capture: true, once: true })
    setTimeout(() => fg.current?.removeEventListener('click', stop, { capture: true }), 350)
    const w = fg.current?.offsetWidth || 320
    const speed = Math.abs(s.dx) / Math.max(1, performance.now() - s.t)
    if (Math.abs(s.dx) > w / 3 || (speed > 0.6 && Math.abs(s.dx) > 40)) {
      setX(Math.sign(s.dx) * (w + 40), true)
      setTimeout(() => onDismiss?.(), 200)
    } else {
      setX(0, true)
    }
  }
  function cancel() {
    if (g.current?.mode === 'swipe') setX(0, true)
    g.current = null
  }

  return (
    <div className={cx('relative overflow-hidden', className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center bg-red-500 px-6 text-sm font-bold text-white opacity-0 transition-opacity duration-150">
        <span className="flex items-center gap-2"><Icon name="trash" className="h-4 w-4" />{label}</span>
      </div>
      <div
        ref={fg}
        className="relative bg-white [touch-action:pan-y]"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
      >
        {children}
      </div>
    </div>
  )
}
