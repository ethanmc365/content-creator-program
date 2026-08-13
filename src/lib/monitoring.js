// Error monitoring via Sentry. Only initialises when VITE_SENTRY_DSN is set, so
// local dev and any environment without a DSN stay a no-op (no network, no
// noise). Set the DSN as a Vercel env var to turn it on in production.
import * as Sentry from '@sentry/react'

export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Capture a small sample of performance traces; errors are always captured.
    tracesSampleRate: 0.1,
    // Don't send default PII (IP, etc.) - this is a community app with minors' data.
    sendDefaultPii: false,
  })
}

/**
 * Report an error we caught ourselves.
 *
 * The error boundary is the only place a render crash is visible: the creator
 * gets a friendly screen and walks away, so without this the bug is known to
 * exactly one person and they are not us. A no-op when there is no DSN, same as
 * `initMonitoring` - but it still logs to the console, because a developer
 * running locally is precisely who needs to see it.
 */
export function captureError(error, context) {
  if (import.meta.env.DEV) console.error('[captured]', error, context)
  if (!import.meta.env.VITE_SENTRY_DSN) return
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined)
  } catch {
    /* never let reporting an error throw a second one */
  }
}
