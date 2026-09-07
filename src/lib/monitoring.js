// Error monitoring via Sentry.
//
// WHY THE DSN IS IN THE SOURCE. A Sentry DSN is not a secret and is not treated
// as one by Sentry: it is compiled into every client bundle that uses it, so it
// is readable by anyone who opens devtools on any site in the world that runs
// Sentry. It grants exactly one capability - posting an event to this project -
// and Sentry's own docs say to embed it. Keeping it in an env var would buy no
// security at all and would cost the one thing that matters here: monitoring
// that is silently off because a variable was never set in one environment.
//
// `VITE_SENTRY_DSN` still overrides it, so a fork or a staging project can point
// somewhere else without touching the code.
const DEFAULT_DSN = 'https://17378c7401c05460b304f92d28488842@o4512044607733760.ingest.de.sentry.io/4512045143556176'

import * as Sentry from '@sentry/react'
import { supabase } from './supabase'

/** The DSN actually in use: the env var if set, otherwise the project's own. */
export const sentryDsn = () => import.meta.env.VITE_SENTRY_DSN || DEFAULT_DSN

// NOISE THAT IS NOT OURS AND NEVER WILL BE.
//
// A free Sentry plan is 5,000 errors a month, and an unfiltered browser SDK
// spends most of that on things nobody can fix. Each of these is a known
// non-bug:
//
//   ResizeObserver loop     A benign browser warning fired by any page with a
//                           ResizeObserver under load. This app has several
//                           (the onboarding card's height, the chat scroller).
//   AbortError / cancelled  A fetch the user navigated away from. That is the
//                           app working, not failing.
//   Non-Error promise       Thrown by browser extensions and by some ad/consent
//                           scripts injected into the page.
//   Load failed / NetworkError
//                           A phone that lost signal mid-request. Real, and not
//                           a defect - the app already shows an offline screen.
const IGNORE = [
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
  'Non-Error promise rejection captured',
  'AbortError',
  'The operation was aborted',
  'Load failed',
  'NetworkError when attempting to fetch resource',
  'Failed to fetch',
  'cancelled',
]

// Anything thrown by code that is not ours. A browser extension running in a
// creator's page throws into our handler and there is nothing we can do about
// it except spend quota reading it.
const DENY_URLS = [
  /extensions\//i,
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-(web-)?extension:/i,
]

export function initMonitoring() {
  const dsn = sentryDsn()
  if (!dsn) return
  // Local development reports nothing. A console is a better debugger than a
  // dashboard when the code is in front of you, and a month of `npm run dev`
  // would eat the whole quota.
  if (import.meta.env.DEV) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,

    // WHICH DEPLOY DID THIS COME FROM. Without a release every error is just
    // "the app", and the single most useful question about a new error - did
    // this start today - cannot be asked. Vercel exposes the commit SHA to the
    // build, so the answer is free. It is `undefined` locally, which Sentry
    // handles by simply not tagging.
    release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || undefined,

    // ERRORS ARE THE POINT; TRACES ARE NOT, ON THIS PLAN. Performance events
    // are metered separately and a 10% trace sample on a community app produces
    // far more of them than errors, for information nobody is currently asking
    // for. Off, and one number to change if that stops being true.
    tracesSampleRate: 0,

    // NO AUTOMATIC PII. The community includes people as young as 16 and the
    // platform holds phone numbers, dates of birth and bank details. Sentry's
    // default PII capture would attach IP addresses and, with some
    // integrations, form field contents. See `beforeSend` for what is scrubbed
    // on top of this.
    sendDefaultPii: false,

    ignoreErrors: IGNORE,
    denyUrls: DENY_URLS,

    beforeSend(event) {
      // A SECOND FENCE ROUND THE SAME THING. `sendDefaultPii: false` covers
      // what the SDK collects; this covers what OUR code might hand it. A URL
      // is the most likely leak - a password-reset link carries a token in its
      // query string, and an error thrown on that page would otherwise post the
      // token to a third party.
      try {
        if (event.request?.url) event.request.url = event.request.url.split(/[?#]/)[0]
        if (event.request) { delete event.request.cookies; delete event.request.headers }
        if (event.user) { delete event.user.email; delete event.user.ip_address; delete event.user.username }
      } catch { /* never let scrubbing throw away the report */ }
      return event
    },
  })
}

/**
 * WHO HIT IT. Just the profile id.
 *
 * An error report with no idea who it happened to is an error report you cannot
 * act on: the one question worth asking about a crash is "is this everybody or
 * is this one person's account", and a stable id answers it. The id is a UUID
 * that means nothing outside this database, and the email, name and IP are all
 * explicitly stripped above - so this is pseudonymous rather than personal, and
 * proportionate to running a support desk.
 *
 * Called from AuthContext when the profile lands and cleared on sign-out.
 */
export function identifyForMonitoring(profileId) {
  if (import.meta.env.DEV) return
  try {
    Sentry.setUser(profileId ? { id: profileId } : null)
  } catch { /* monitoring must never break the app it monitors */ }
}

/**
 * Report an error we caught ourselves.
 *
 * The error boundary is the only place a render crash is visible: the creator
 * gets a friendly screen and walks away, so without this the bug is known to
 * exactly one person and they are not us. A no-op in development, same as
 * `initMonitoring` - but it still logs to the console, because a developer
 * running locally is precisely who needs to see it.
 */
export function captureError(error, context) {
  if (import.meta.env.DEV) { console.error('[captured]', error, context); return }
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined)
  } catch {
    /* never let reporting an error throw a second one */
  }
  // AND INTO THE ADMIN PANEL, not only into Sentry.
  //
  // Ethan: "did you build something into analytics to track errors, or do I
  // have to actually check the Sentry website?"
  //
  // Sentry is the right tool for DEBUGGING one crash - stack traces,
  // breadcrumbs, which release it started in - and the wrong tool for the
  // question an admin actually has, which is "is anything broken right now and
  // for how many people". That belongs on the panel somebody already opens
  // every day, so it is both. `report_client_error` folds repeats into one row
  // by fingerprint and counts distinct people (migration 199).
  //
  // A THENABLE, NOT A PROMISE. `.rpc(...).catch()` throws a TypeError on a
  // supabase-js builder; `.then(ok, fail)` is the shape that is safe. And this
  // is called from the error boundary, so a failure here must go nowhere at all.
  try {
    supabase.rpc('report_client_error', {
      p_message: String(error?.message || error || 'Unknown error'),
      p_route: typeof window !== 'undefined' ? window.location.pathname : null,
      p_component: context?.componentStack ? String(context.componentStack).slice(0, 2000) : null,
      p_release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || null,
    }).then(() => {}, () => {})
  } catch { /* the app is already broken; do not make it worse */ }
}
