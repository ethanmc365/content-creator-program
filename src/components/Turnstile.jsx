import { useEffect, useRef } from 'react'
import { TURNSTILE_SITE_KEY } from '../lib/turnstile'

// Loads the Cloudflare Turnstile script once and shares the promise.
let scriptPromise = null
function loadTurnstile() {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    if (window.turnstile) return resolve()
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = reject
    document.head.appendChild(s)
  })
  return scriptPromise
}

// Renders the Turnstile widget and reports the token via onToken.
//  - onToken(token) fires when solved; onToken('') on expiry/error.
//  - Remount with a changing `key` from the parent to reset after a failure
//    (Turnstile tokens are single-use).
export default function Turnstile({ onToken }) {
  const containerRef = useRef(null)
  const widgetId = useRef(null)
  const cb = useRef(onToken)
  useEffect(() => { cb.current = onToken }, [onToken])

  useEffect(() => {
    let active = true
    loadTurnstile()
      .then(() => {
        if (!active || !containerRef.current || !window.turnstile) return
        widgetId.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => cb.current(token),
          'expired-callback': () => cb.current(''),
          'error-callback': () => cb.current(''),
          'timeout-callback': () => cb.current(''),
        })
      })
      .catch(() => { /* script failed to load; submit stays gated */ })
    return () => {
      active = false
      try { if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current) } catch { /* noop */ }
    }
  }, [])

  return <div ref={containerRef} className="flex justify-center" />
}
