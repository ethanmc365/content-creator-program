import { useEffect, useRef, useState } from 'react'

// Pull-to-refresh for the installed (standalone) PWA, where the browser's own
// pull-to-refresh gesture doesn't exist.
//
// The gesture is deliberately scoped to the permanent top bar (the element
// tagged `data-ptr-handle`): pull DOWN from the Tryp.com header to reload.
// Scoping it there fixes two things at once -
//   * scrolling back through a chat (which scrolls an inner container, not the
//     window) no longer counts as a pull-to-refresh, and
//   * we can `preventDefault` the drag so iOS never rubber-bands the whole page.
//     That rubber-band was what let the chat's own tabs peek up above the header
//     mid-pull; suppressing it keeps the area above the bar clean white.
// No-op in a normal browser tab (the native gesture already works there).
const THRESHOLD = 70

export default function PullToRefresh() {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(null)
  const pullRef = useRef(0)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    if (!standalone) return

    function onStart(e) {
      // Only arm the gesture when it begins on the permanent header bar and the
      // page is already scrolled to the very top.
      const onHandle = e.target.closest?.('[data-ptr-handle]')
      startY.current = onHandle && window.scrollY <= 0 ? e.touches[0].clientY : null
      pullRef.current = 0
    }
    function onMove(e) {
      if (startY.current == null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy > 0) {
        // Stop the browser from rubber-banding the page under our custom pull.
        if (e.cancelable) e.preventDefault()
        // Dampen the pull so it feels elastic.
        const val = Math.min(dy * 0.5, 90)
        pullRef.current = val
        setPull(val)
      } else {
        // Dragged back up past the start - cancel the pull.
        pullRef.current = 0
        setPull(0)
      }
    }
    function onEnd() {
      if (startY.current == null) return
      if (pullRef.current > THRESHOLD) {
        setRefreshing(true)
        setPull(THRESHOLD)
        setTimeout(() => window.location.reload(), 350)
      } else {
        pullRef.current = 0
        setPull(0)
      }
      startY.current = null
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    // Non-passive so we can preventDefault the page rubber-band while pulling.
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  if (pull <= 0 && !refreshing) return null
  const progress = Math.min(pull / THRESHOLD, 1)

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{ transform: `translateY(${pull}px)`, opacity: Math.min(progress + 0.2, 1), transition: refreshing ? 'transform 0.2s' : 'none' }}
    >
      <div className="mt-2 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-lift">
        {/* Clean circular progress spinner: a track ring plus a brand arc that
            rotates as you pull and spins continuously while refreshing. */}
        <svg
          className={refreshing ? 'h-5 w-5 animate-spin' : 'h-5 w-5'}
          style={refreshing ? undefined : { transform: `rotate(${progress * 360}deg)` }}
          viewBox="0 0 24 24" fill="none"
        >
          <circle cx="12" cy="12" r="9" stroke="#eee" strokeWidth="2.5" />
          <path d="M12 3a9 9 0 0 1 9 9" stroke="#d94407" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}
