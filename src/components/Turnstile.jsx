import { useCallback, useEffect, useRef, useState } from 'react'
import { TURNSTILE_SITE_KEY } from '../lib/turnstile'
import { useT } from '../lib/i18n'

// How long to wait for the widget to draw itself before deciding Cloudflare is
// not going to answer. This only ever fires when the container is still empty,
// so a user working through an interactive "Verify you are human" challenge is
// never interrupted - that widget occupies ~70px as soon as it appears.
//
// Measure height, not iframes: Turnstile renders into a shadow root, so
// querySelector('iframe') finds nothing even when the challenge is on screen.
const MOUNT_TIMEOUT_MS = 20000
const DRAWN_MIN_HEIGHT_PX = 10

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
//
// If the widget never appears, this says so instead of staying silent. The old
// behaviour was indistinguishable from a hang: every submit button read
// "Verifying..." forever with nothing on screen to say why, which is a bad
// place to leave somebody who just wants to log in. The button stays disabled
// either way - the check genuinely has not passed - but the failure is now
// visible and retryable rather than mute.
export default function Turnstile({ onToken }) {
  const tr = useT()
  const containerRef = useRef(null)
  const widgetId = useRef(null)
  const cb = useRef(onToken)
  const [failed, setFailed] = useState(false)
  // Bumping this re-runs the mount effect, which is how "Try again" works.
  const [attempt, setAttempt] = useState(0)
  useEffect(() => { cb.current = onToken }, [onToken])

  const retry = useCallback(() => {
    cb.current('')
    setFailed(false)
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    let active = true
    let timer = null

    // Cloudflare answered: stand the watchdog down.
    const solved = (token) => {
      if (timer) { clearTimeout(timer); timer = null }
      cb.current(token)
    }

    const armWatchdog = () => {
      timer = setTimeout(() => {
        if (!active) return
        // Anything on screen means the user is mid-challenge, not stuck.
        const height = containerRef.current?.getBoundingClientRect().height ?? 0
        if (height < DRAWN_MIN_HEIGHT_PX) setFailed(true)
      }, MOUNT_TIMEOUT_MS)
    }

    loadTurnstile()
      .then(() => {
        if (!active || !containerRef.current || !window.turnstile) return
        armWatchdog()
        widgetId.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          // Auto-recover so a stale/expired/errored token never leaves the form
          // stuck with a dead submit button (the cause of "refresh to log in").
          'refresh-expired': 'auto',
          'refresh-timeout': 'auto',
          retry: 'auto',
          'retry-interval': 8000,
          callback: (token) => solved(token),
          'expired-callback': () => { cb.current(''); try { window.turnstile.reset(widgetId.current) } catch { /* noop */ } },
          'error-callback': () => { cb.current(''); if (active) setFailed(true) },
          'timeout-callback': () => { try { window.turnstile.reset(widgetId.current) } catch { /* noop */ } },
        })
      })
      .catch(() => { if (active) setFailed(true) })

    return () => {
      active = false
      if (timer) clearTimeout(timer)
      try { if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current) } catch { /* noop */ }
      widgetId.current = null
    }
  }, [attempt])

  return (
    <div>
      <div ref={containerRef} className="flex justify-center" />
      {failed && (
        <div role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          The security check could not load, so we cannot verify you are human.
          {' '}
          <button type="button" onClick={retry} className="font-semibold underline">{tr("Try again")}</button>
          {' '}
          — if it keeps failing, please let us know rather than waiting.
        </div>
      )}
    </div>
  )
}
