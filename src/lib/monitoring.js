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
import { installBreadcrumbs, readTrail } from './breadcrumbs'

/** The DSN actually in use: the env var if set, otherwise the project's own. */
export const sentryDsn = () => import.meta.env.VITE_SENTRY_DSN || DEFAULT_DSN

/**
 * WHERE THIS PROJECT'S SENTRY ACTUALLY LIVES, READ OFF THE DSN.
 *
 * Ethan: "I tried to login and check Sentry but I was having difficulties
 * logging in, it's weird, it seems like a different login screen or something."
 *
 * Two separate things were sending him to the wrong place, and both are here.
 *
 * FIRST, THE REGION. This project's DSN is `...ingest.DE.sentry.io/...`, which
 * means the organisation is on Sentry's EU instance. Sentry runs the EU and US
 * instances as separate installations with separate account databases, so
 * signing in at plain `sentry.io` is signing in to a system the account does
 * not exist in - and what you get is a login screen that looks right, takes the
 * password, and tells you it is wrong. `eu.sentry.io` is the same product with
 * the account in it.
 *
 * SECOND, THE ORG. The panel's deep link was hard-coded to
 * `/organizations/sentry/issues/`, and `sentry` is SENTRY'S OWN org slug. Every
 * press of it went to a stranger's dashboard. There is no org slug in a DSN -
 * only the numeric org and project ids - so the slug comes from
 * `VITE_SENTRY_ORG` when somebody sets it, and without it the link goes to the
 * region's front door, which is the honest answer: we know the instance, we do
 * not know the slug, and sending somebody to the right login beats sending them
 * to the wrong dashboard.
 */
export function sentryHome() {
  const dsn = sentryDsn()
  // `o<id>.ingest.<region>.sentry.io` - the region segment is absent for US.
  const region = dsn.match(/ingest\.([a-z]{2})\.sentry\.io/i)?.[1]
  return region ? `https://${region.toLowerCase()}.sentry.io` : 'https://sentry.io'
}

/** The numeric project id, which is the last path segment of the DSN. */
export const sentryProjectId = () => sentryDsn().split('/').pop() || null

/** A search for one fault, as deep as we can honestly go. */
export function sentryLink(message) {
  const org = import.meta.env.VITE_SENTRY_ORG
  const home = sentryHome()
  if (!org) return home
  return `${home}/organizations/${org}/issues/?query=${encodeURIComponent(message || '')}`
}

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

  installGlobalHandlers()
  // What the person pressed, so a crash report says how to get back to it. One
  // delegated capture-phase listener; see lib/breadcrumbs for what it is
  // allowed to record and, more importantly, what it is not.
  installBreadcrumbs()
}

// ---------------------------------------------------------------------------
// THE PANEL WAS EMPTY BECAUSE ONLY ONE KIND OF FAULT COULD EVER REACH IT.
//
// Ethan (9 Sep 2026): "I noticed the error monitoring still isn't showing any
// details."
//
// Measured against production the same day: `client_errors` held ZERO rows, and
// `report_client_error` itself is fine - called with a session it inserts, and
// the cron half of the same table (`report_system_error`) has been writing
// correctly. The gap is upstream of the database. `captureError` had exactly
// ONE caller: `componentDidCatch` on the error boundary.
//
// A React boundary catches a throw during RENDER and nothing else. Every one of
// these is invisible to it, and this platform has shipped all of them:
//
//   a throw inside an event handler       (a click that does nothing)
//   a throw inside a rAF loop             (the tour's spotlight froze; the
//                                          console was the only record)
//   an unhandled promise rejection        (every awaited supabase call that
//                                          rejects outside a try)
//   a failed dynamic import after a deploy
//   a throw inside a setTimeout/interval
//
// So the tab was not lying and it was not broken; it was wired to a fifth of
// the faults. `window.onerror` and `unhandledrejection` are the two events that
// see the rest, and they feed the SAME function, so a fault is one row on the
// panel whichever door it came through.
//
// WHAT THIS MUST NOT DO IS AMPLIFY A LOOP. A throw inside a rAF loop re-arms
// and throws again sixty times a second, so a naive handler would post sixty
// RPCs a second from a phone that is already in trouble. Two brakes, both
// client-side and both deliberately crude:
//
//   - a per-message key seen once is never sent again from this page load.
//     The database already folds repeats into one row with a count; a second
//     report of the same fault in the same session adds nothing.
//   - a hard ceiling on distinct faults per page load, because a page melting
//     down produces new messages as fast as it produces repeats.
// ---------------------------------------------------------------------------
const sent = new Set()
const MAX_PER_LOAD = 8

/** Test seam: forget what this page load has already reported. */
export function resetReportedForTests() { sent.clear() }

/** True the first time a given fault is seen in this page load, false after. */
function firstTime(key) {
  if (!key) return false
  if (sent.has(key)) return false
  if (sent.size >= MAX_PER_LOAD) return false
  sent.add(key)
  return true
}

/** Reasons never worth a row. Same list Sentry is given, applied to our own. */
function worthReporting(message) {
  const m = String(message || '')
  if (!m.trim()) return false
  return !IGNORE.some((ignore) => m.includes(ignore))
}

/**
 * Exported so the wiring can be tested. `initMonitoring` calls it, and it is
 * the half of crash reporting that had no coverage at all - which is how it
 * came to be missing entirely without a single test going red.
 */
export function installGlobalHandlers({ report = captureError } = {}) {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (e) => {
    // A RESOURCE THAT FAILED TO LOAD IS NOT AN EXCEPTION. An <img> or a
    // <script> that 404s fires this same event with no `error` on it, and a
    // creator on a flaky connection would otherwise fill the panel with them.
    if (!e?.error) return
    const msg = e.error.message || e.message
    if (!worthReporting(msg) || !firstTime(`error:${msg}`)) return
    // `where`, NOT `componentStack`. This is a FILE AND A LINE, and calling it
    // a component stack put a URL in the panel's "Component" box under a
    // heading promising the React tree - which is a label that actively misled
    // whoever read it.
    report(e.error, { where: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : null })
  })

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e?.reason
    // A rejection can be thrown with anything at all - a string, a DOMException,
    // a supabase error object, a minified class - so this must not assume an
    // Error. `describeReason` is what keeps whatever identity it had.
    const d = describeReason(reason)
    if (!worthReporting(d.message) || !firstTime(`reject:${d.message}`)) return

    // THE OLD LINE HERE THREW THE EVIDENCE AWAY, AND ONE OF THE TWO ERRORS ON
    // THE PANEL IS THE PROOF (12 Sep 2026).
    //
    // It was `report(reason instanceof Error ? reason : new Error(msg))`. For
    // anything that is not an Error - which is most rejections in a bundled app
    // - that CONSTRUCTS A FRESH ERROR HERE, so the stack it carries is this
    // file's own two frames and nothing else. The panel row reads:
    //
    //     message  Pa
    //     detail   @.../monitoring-DfA3rt1F.js:2:71865
    //              r@.../monitoring-DfA3rt1F.js:2:52195
    //
    // "Pa" is a minified identifier that leaked out as somebody's `.message`,
    // and both stack frames point at the REPORTER. There is not one fact in
    // that row about the thing that actually failed. Ethan: "the information
    // provided doesn't really help me" - it could not, because the reporter was
    // overwriting it.
    //
    // So the original is passed through untouched when it is an Error, and when
    // it is not, the synthesised one is given the reason's OWN type and any
    // stack the reason had, with the reporter's frames stripped.
    if (reason instanceof Error) { report(reason, { source: 'unhandled rejection' }); return }
    const synthetic = new Error(d.message)
    synthetic.name = d.name
    if (d.stack) synthetic.stack = d.stack
    report(synthetic, { source: 'unhandled rejection', reason: d.extra })
  })
}

/**
 * WHAT WAS ACTUALLY THROWN, WITHOUT ASSUMING IT WAS AN ERROR.
 *
 * A promise can reject with anything. In this app the four shapes that actually
 * turn up are an Error, a string, a supabase `PostgrestError` (which is a plain
 * object carrying `code`, `details` and `hint` and is NOT an Error), and a
 * DOMException. A reporter that only understands the first turns the other
 * three into "Unhandled promise rejection" with its own stack attached, which
 * is what made the panel unreadable.
 *
 * The `name` is kept because it is often the only identifying thing left:
 * `NotFoundError` and `QuotaExceededError` are both DOMExceptions and mean
 * completely different things. And a message that is a bare minified token
 * (`Pa`) gets the type prefixed to it, so the row at least says what KIND of
 * object arrived rather than printing two letters.
 */
export function describeReason(reason) {
  if (reason == null) return { name: 'Rejection', message: 'Unhandled promise rejection', stack: null, extra: null }
  if (typeof reason === 'string') return { name: 'Rejection', message: reason, stack: null, extra: null }

  const name = reason.name || reason.constructor?.name || 'Rejection'
  let message = reason.message || reason.error_description || reason.error || ''
  // A supabase error carries the useful half in fields nobody looks at.
  const extra = {}
  for (const k of ['code', 'details', 'hint', 'status', 'statusCode']) {
    if (reason[k] != null && reason[k] !== '') extra[k] = String(reason[k]).slice(0, 200)
  }
  if (!message) message = extra.details || extra.hint || 'Unhandled promise rejection'
  // "Pa" on its own says nothing. "Object: Pa" at least says a non-Error was
  // thrown, which is the first thing worth knowing about it.
  // `Object` is what `constructor.name` says about a plain `{}`, which names
  // nothing - "Object: Pa" is no better than "Pa". A type that means something
  // (DOMException, PostgrestError) is worth putting in front.
  const typed = name !== 'Error' && name !== 'Object' && name !== 'Rejection'
  if (/^[A-Za-z$_][\w$]{0,3}$/.test(message)) {
    message = typed ? `${name}: ${message}` : `Non-Error thrown: ${message}`
  }

  return {
    name,
    message: String(message).slice(0, 300),
    stack: typeof reason.stack === 'string' ? reason.stack : null,
    extra: Object.keys(extra).length ? extra : null,
  }
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
 * The browser, as a family and a major version.
 *
 * Order matters: Edge and Opera both put "Chrome" in their UA, and every iOS
 * browser puts "Safari" in it (they are all WebKit under the skin, which for a
 * rendering bug is the honest answer anyway). So the most specific token is
 * tested first and Safari is what is left.
 */
export function browserLabel() {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent || ''
  const ver = (re) => (ua.match(re)?.[1] || '').split('.')[0]
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
      : /Macintosh/.test(ua) ? 'macOS'
        : /Windows/.test(ua) ? 'Windows'
          : /Linux/.test(ua) ? 'Linux' : ''
  const name = /Edg\//.test(ua) ? `Edge ${ver(/Edg\/(\d+)/)}`
    : /OPR\//.test(ua) ? `Opera ${ver(/OPR\/(\d+)/)}`
      : /Firefox\//.test(ua) ? `Firefox ${ver(/Firefox\/(\d+)/)}`
        : /Chrome\//.test(ua) ? `Chrome ${ver(/Chrome\/(\d+)/)}`
          : /Safari\//.test(ua) ? `Safari ${ver(/Version\/(\d+)/)}`
            : 'Unknown browser'
  // Standalone matters: an installed app and a browser tab are different
  // environments (no push on an iOS tab, a different navigation stack), and
  // more than one bug here has only ever happened in one of them.
  const standalone = typeof window !== 'undefined'
    && (window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone)
  return [name.trim(), os, standalone ? 'installed app' : null].filter(Boolean).join(' / ').slice(0, 200)
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
/**
 * THE STATE OF THE APP AT THE MOMENT IT BROKE.
 *
 * Everything here is chosen because a real bug on this platform has turned on
 * it, and none of it is personal:
 *
 *   viewport      Half the layout bugs this codebase has shipped were one width
 *                 only, and the panel could not tell a phone from a laptop.
 *   installed     An installed PWA and a Safari tab are different environments -
 *                 different navigation stack, no push on an iOS tab, a
 *                 different keyboard inset. More than one bug has only ever
 *                 happened in one of them.
 *   online        A crash while offline is usually the network, not the code.
 *   pageAge       A throw eighteen minutes into a session is a different animal
 *                 from one on the first paint. It also separates "broken on
 *                 load" from "broke while they were using it", which is the
 *                 first question worth asking.
 *   reduceMotion  Animation code paths differ under it.
 *   lang          The translation layer is a live surface; a missing key throws.
 *
 * WHAT IS DELIBERATELY NOT HERE: the full user agent (a tracking surface with
 * no use on a community app - `browserLabel` reduces it to a family and a major
 * version, which is the reproduction hint), the URL's query string (a password
 * reset token lives there), and anything anybody typed.
 */
const bootedAt = Date.now()

export function errorContext() {
  if (typeof window === 'undefined') return {}
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone
  return {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    installed: !!standalone,
    online: typeof navigator !== 'undefined' ? navigator.onLine !== false : null,
    pageAge: `${Math.round((Date.now() - bootedAt) / 1000)}s`,
    reduceMotion: !!document.documentElement.getAttribute('data-reduce-motion'),
    lang: document.documentElement.getAttribute('lang') || null,
  }
}

// The delimiter the panel splits on. A marker rather than a second column
// because `client_errors` has no jsonb field to put this in and adding one is a
// migration; the transport is one text column and both ends agree on the shape.
// ErrorWatch parses it back out and draws it as facts, so nobody ever reads
// this line.
export const CONTEXT_MARK = '\n----- context -----\n'

/** The stack, then the context and the trail, in one 4000-character field. */
function buildDetail(error, context) {
  const frames = error?.stack ? String(error.stack).split('\n').slice(0, 14).join('\n') : ''
  const payload = {
    ...errorContext(),
    ...(context?.where ? { where: context.where } : {}),
    ...(context?.source ? { via: context.source } : {}),
    ...(context?.reason ? { reason: context.reason } : {}),
    // WHAT THEY WERE DOING. The one part of a crash report that does not
    // minify. See lib/breadcrumbs.
    trail: readTrail(),
  }
  let body = `${frames}${CONTEXT_MARK}${JSON.stringify(payload, null, 1)}`
  // The column is 4000 and truncates from the right, which would cut the
  // context off and leave twelve frames of minified noise - the exact opposite
  // of the trade worth making. The frames are what get shortened.
  if (body.length > 3900) {
    const tail = `${CONTEXT_MARK}${JSON.stringify(payload, null, 1)}`
    body = `${frames.slice(0, Math.max(0, 3900 - tail.length))}${tail}`
  }
  return body
}

export function captureError(error, context) {
  if (import.meta.env.DEV) { console.error('[captured]', error, context); return }
  try {
    Sentry.captureException(error, { extra: { ...(context || {}), ...errorContext(), trail: readTrail() } })
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
      // ENOUGH TO REPRODUCE IT, WHICH IS WHAT THE PANEL WAS MISSING (8 Sep 2026).
      // Ethan: "it should show what the errors were, like where they happened,
      // how to replicate them so I can fix it."
      //
      // The browser is the single most load-bearing fact after the route: half
      // the bugs this platform has shipped were one engine only (the iOS
      // keyboard inset, the HEIC decode, WebP encoding on Safari), and the
      // panel could not tell you which. `browserLabel` deliberately reduces a
      // 140-character UA string to a family and a major version - it is a
      // reproduction hint, not a fingerprint, and a full UA is a tracking
      // surface we have no use for on a community app with 16-year-olds on it.
      p_agent: browserLabel(),
      // THE STACK IS NO LONGER THE WHOLE OF IT. A production stack reads
      // `Fa@.../ui-BaIenqY-.js:4:29678` and names nothing without source maps
      // uploaded to Sentry - so the field now carries the state of the app and
      // the trail of what was pressed alongside it, which do not minify. See
      // `buildDetail`.
      p_detail: buildDetail(error, context),
    }).then(() => {}, () => {})
  } catch { /* the app is already broken; do not make it worse */ }
}
