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
