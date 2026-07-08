import { useRef } from 'react'
import Icon from './Icon'

// Mobile swipe-to-reply, like WhatsApp/iMessage: drag a message a little to the
// right to reply. Requires clear horizontal intent so it never hijacks vertical
// scrolling, and moves the bubble via direct DOM transform so a drag doesn't
// re-render the whole message list. On desktop it's disabled (a hover button is
// used instead) and renders its children untouched.
const THRESHOLD = 52

export default function SwipeToReply({ onReply, disabled, children }) {
  const ref = useRef(null)
  const s = useRef({ x: 0, y: 0, active: false, horizontal: null, dx: 0 })

  if (disabled) return children

  const onTouchStart = (e) => {
    const t = e.touches[0]
    s.current = { x: t.clientX, y: t.clientY, active: true, horizontal: null, dx: 0 }
    if (ref.current) ref.current.style.transition = ''
  }
  const onTouchMove = (e) => {
    const st = s.current
    if (!st.active) return
    const t = e.touches[0]
    const dx = t.clientX - st.x
    const dy = t.clientY - st.y
    if (st.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      st.horizontal = Math.abs(dx) > Math.abs(dy)
    }
    if (!st.horizontal) { st.active = false; return } // vertical scroll — bow out
    const clamped = Math.max(0, Math.min(dx, 80)) // only rightward, with a ceiling
    st.dx = clamped
    if (ref.current) ref.current.style.transform = `translateX(${clamped}px)`
  }
  const onTouchEnd = () => {
    const st = s.current
    if (st.horizontal && st.dx >= THRESHOLD) onReply?.()
    st.active = false
    if (ref.current) {
      ref.current.style.transition = 'transform 0.18s ease-out'
      ref.current.style.transform = 'translateX(0px)'
    }
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-1 flex items-center text-brand/70">
        <Icon name="reply" className="h-5 w-5" />
      </span>
      <div
        ref={ref}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{ willChange: 'transform' }}
      >
        {children}
      </div>
    </div>
  )
}
