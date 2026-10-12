import { useEffect } from 'react'

// A SHORT CHAT MUST STILL OWN THE DRAG (12 Oct 2026, third pass).
//
// Ethan: "if I'm typing a message on a chat with lots of previous messages and I scroll up or down, everything is
// fine, but if I do this on a chat with few messages and scroll, the entire screen starts shaking and lagging".
// `overscroll-none` and a 1px `::after` (10 Sep) only help once the messages overflow the scroller; a thread of three
// messages has no scroll range at all, so iOS hands the drag to the page and, with the keyboard up, pans the visual
// viewport - which the overlay then chases (useViewportPin), and the two fight: the shake. A vertical drag that the
// scroller cannot use is cancelled here instead, so nothing above it moves. Horizontal drags (a photo strip) and pinch
// are left alone.
// `key`: whatever remounts the scroller (the open thread or room), so the listeners follow the element.
export function useNoScrollChain(ref, key) {
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    let x0 = 0
    let y0 = 0
    const start = (e) => {
      if (e.touches.length !== 1) return
      x0 = e.touches[0].clientX
      y0 = e.touches[0].clientY
    }
    const move = (e) => {
      if (e.touches.length !== 1 || !e.cancelable) return
      const dx = e.touches[0].clientX - x0
      const dy = e.touches[0].clientY - y0
      if (Math.abs(dy) <= Math.abs(dx)) return
      const range = el.scrollHeight - el.clientHeight
      const atTop = el.scrollTop <= 0
      const atEnd = el.scrollTop >= range - 1
      // Nothing to scroll, or pulling past either end: there is nowhere for this drag to go but the page.
      if (range <= 1 || (atTop && dy > 0) || (atEnd && dy < 0)) e.preventDefault()
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
    }
  }, [ref, key])
}

/**
 * THE SAME RULE FOR THE WHOLE CHAT OVERLAY (12 Oct 2026). A drag that starts on the chat's own header, the reply chip or
 * the space round the composer is over nothing that scrolls, so iOS passed it to the page and the overlay shook the same
 * way. A vertical drag is cancelled unless something under the finger can scroll that way; text fields keep their own
 * gestures (moving the caret, selecting) and sideways drags are untouched.
 */
export function useOverlayTouchLock(ref, enabled) {
  useEffect(() => {
    const root = ref.current
    if (!enabled || !root) return undefined
    let x0 = 0
    let y0 = 0
    const start = (e) => {
      if (e.touches.length !== 1) return
      x0 = e.touches[0].clientX
      y0 = e.touches[0].clientY
    }
    const canScroll = (el, dy) => {
      for (let n = el; n && n !== root.parentElement; n = n.parentElement) {
        if (n.nodeType !== 1) continue
        const oy = getComputedStyle(n).overflowY
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
          // The message scroller has its own edge rule (useNoScrollChain); anything else may scroll if it has room.
          return dy > 0 ? n.scrollTop > 0 : n.scrollTop < n.scrollHeight - n.clientHeight - 1
        }
      }
      return false
    }
    const move = (e) => {
      if (e.touches.length !== 1 || !e.cancelable) return
      const t = e.target
      if (t?.closest?.('input, textarea, [contenteditable="true"]')) return
      const dx = e.touches[0].clientX - x0
      const dy = e.touches[0].clientY - y0
      if (Math.abs(dy) <= Math.abs(dx)) return
      if (!canScroll(t, dy)) e.preventDefault()
    }
    root.addEventListener('touchstart', start, { passive: true })
    root.addEventListener('touchmove', move, { passive: false })
    return () => {
      root.removeEventListener('touchstart', start)
      root.removeEventListener('touchmove', move)
    }
  }, [ref, enabled])
}
