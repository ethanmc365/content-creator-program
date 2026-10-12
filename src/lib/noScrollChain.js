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
