import { useEffect, useRef, useState } from 'react'

// Pull-to-refresh for the installed (standalone) PWA, where the browser's own
// pull-to-refresh gesture doesn't exist. Pull down from the very top of the
// page past the threshold to reload. No-op in a normal browser tab.
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
      startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null
    }
    function onMove(e) {
      if (startY.current == null || window.scrollY > 0) return
      const dy = e.touches[0].clientY - startY.current
      if (dy > 0) {
        // Dampen the pull so it feels elastic.
        const val = Math.min(dy * 0.5, 90)
        pullRef.current = val
        setPull(val)
      }
    }
    function onEnd() {
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
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
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
        <svg
          className={refreshing ? 'h-5 w-5 animate-spin text-brand' : 'h-5 w-5 text-brand'}
          style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
          fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M3.985 14.652H8.977v4.992m-4.992-4.992l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      </div>
    </div>
  )
}
