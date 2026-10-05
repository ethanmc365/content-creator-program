import { useSyncExternalStore } from 'react'

// IS THIS A SLOW CONNECTION? MEASURED, NOT GUESSED (1 Oct 2026).
//
// Ethan: "when on a slightly slower wifi connection, the entire platform
// becomes super laggy and almost unusable. I want you to really try improve
// this and ensure there's an optimised version for lower wifi signals too."
//
// The browser's own answer (`navigator.connection`) does not exist on an
// iPhone, which is where the report came from. So the answer is MEASURED from
// the requests the app is already making: every database read records how long
// it took, and a running average over the recent ones decides. Where the
// browser does say something (Android/Chrome: Save-Data, 2g/3g, a low downlink)
// that counts too.
//
// What "slow" changes is decided by the callers (see `useSlowNetwork`): no
// background prefetching competing with what you asked for, no decorative maps
// and globes that are a megabyte of geometry, longer polling. Nothing a creator
// can DO is switched off - only the things that spend bandwidth on their behalf.

// THE CONNECTION IS MEASURED WITH A PROBE, NOT BY TIMING THE APP'S OWN QUERIES (5 Oct 2026). Ethan: "the weak signal pop-up is still showing up
// even when my Wi-Fi is actually good." Every fix before this kept judging the line by how long a database READ took - and a read is slow for a
// dozen reasons that have nothing to do with the line: a heavy select, a cold database, an RLS policy walking a big table, an edge function waking
// up. A creator on perfect wifi opening a heavy page was "on a weak signal". So the verdict now comes from a tiny static file on our own origin
// (a few hundred bytes from a CDN edge): if THAT is slow or fails, the line is weak; if it is quick, nothing a query does can say otherwise.
const SLOW_MS = 1200 // a tiny CDN file taking longer than this, on average, is a slow connection
const FAST_MS = 500 // and quicker than this is a recovered one (a gap, so it does not flicker)
const MIN_SAMPLES = 3
const PROBE_URL = '/favicon.svg'
const PROBE_TIMEOUT_MS = 6000
// NOT AT LAUNCH. The first seconds of a launch are a dozen requests queued behind one fresh TLS connection and a token refresh.
const WARMUP_MS = 8000
const PROBE_EVERY_MS = 25000
const bootAt = typeof performance !== 'undefined' ? performance.now() : 0

let avg = null
let samples = 0
let slow = false
const listeners = new Set()

function hinted() {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null
  if (!c) return false
  // Only what the browser is SURE of. Chrome reports `3g` and a sub-1Mbps downlink on perfectly usable wifi
  // (both are rounded, privacy-bucketed estimates), which put good connections into slow mode on launch.
  return !!c.saveData || /(^|-)2g$/.test(c.effectiveType || '')
}

function set(next) {
  if (next === slow) return
  slow = next
  try { document.documentElement.toggleAttribute('data-slow-net', slow) } catch { /* no DOM */ }
  for (const fn of listeners) fn()
}

/** Record how long one read took. Called by the Supabase client's fetch. */
export function recordRequest(ms) {
  if (!Number.isFinite(ms) || ms < 0) return
  samples += 1
  // An average weighted to the last few requests, so a connection that gets
  // better is noticed within a handful of reads rather than never.
  avg = avg == null ? ms : avg * 0.7 + ms * 0.3
  if (samples < MIN_SAMPLES) return
  if (!slow && avg > SLOW_MS) set(true)
  else if (slow && avg < FAST_MS && !hinted()) set(false)
}

/** A request that never came back counts as a very slow one. */
export function recordTimeout() { recordRequest(SLOW_MS * 3) }

// ---------------------------------------------------------------------------
// THE PROBE. Three quick measurements once the app has settled, then one every ~25 seconds while the tab is visible, and again the moment the
// connection comes back or the tab is reopened. It is a GET of a static file with `no-store`, so it is a real round trip every time.
let probing = false
async function probeOnce() {
  if (probing || typeof fetch === 'undefined') return
  probing = true
  const started = performance.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(`${PROBE_URL}?p=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal })
    await res.arrayBuffer()
    recordRequest(performance.now() - started)
  } catch {
    // Offline is its own screen, not "weak signal"; only a probe that failed while the browser still thinks it is online counts.
    if (typeof navigator === 'undefined' || navigator.onLine !== false) recordRequest(PROBE_TIMEOUT_MS)
  } finally {
    clearTimeout(timer)
    probing = false
  }
}

let probeTimer = null
function scheduleProbe(ms) {
  clearTimeout(probeTimer)
  probeTimer = setTimeout(async () => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') await probeOnce()
    scheduleProbe(PROBE_EVERY_MS)
  }, ms)
}

/** Start measuring. Called once from the app shell; idempotent, returns a stop function. */
export function startNetProbe() {
  if (typeof window === 'undefined' || probeTimer) return () => {}
  const wait = Math.max(500, WARMUP_MS - (performance.now() - bootAt))
  // An initial burst so a genuinely weak line is noticed in seconds, not after three quiet intervals.
  const burst = setTimeout(async () => { await probeOnce(); await probeOnce(); await probeOnce() }, wait)
  scheduleProbe(wait + 6000)
  const kick = () => { if (document.visibilityState === 'visible' && performance.now() - bootAt > WARMUP_MS) probeOnce() }
  window.addEventListener('online', kick)
  document.addEventListener('visibilitychange', kick)
  return () => {
    clearTimeout(burst)
    clearTimeout(probeTimer); probeTimer = null
    window.removeEventListener('online', kick)
    document.removeEventListener('visibilitychange', kick)
  }
}

export function isSlowNetwork() { return slow || hinted() }

export function onSlowNetworkChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

if (typeof window !== 'undefined') {
  if (hinted()) set(true)
  try {
    navigator.connection?.addEventListener?.('change', () => { if (hinted()) set(true) })
  } catch { /* not supported */ }
}

/** React: true while the connection is slow. */
export function useSlowNetwork() {
  return useSyncExternalStore(onSlowNetworkChange, isSlowNetwork, () => false)
}

// ---------------------------------------------------------------------------
// THE FETCH THE SUPABASE CLIENT USES.
//
// On a weak connection a request can simply stall - no error, no answer - and
// the page that asked sits on its skeleton for ever. Reads now give up after a
// while and try ONCE more; anything that writes is left alone (a retried write
// can land twice), and so are uploads and edge functions, which are allowed to
// take as long as they take.
const READ_TIMEOUT_MS = 15000

function isRetryableRead(url, method) {
  if (method !== 'GET' && method !== 'HEAD') return false
  return url.includes('/rest/v1/')
}

function withTimeout(input, init, ms) {
  const ctrl = new AbortController()
  const outer = init?.signal
  if (outer) {
    if (outer.aborted) ctrl.abort(outer.reason)
    else outer.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true })
  }
  const timer = setTimeout(() => ctrl.abort(new DOMException('Timed out', 'TimeoutError')), ms)
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer))
}

export async function resilientFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || ''
  const method = (init.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase()
  if (!isRetryableRead(url, method)) return fetch(input, init)
  try {
    // How long a read took is NOT recorded: that is the database's time as much as the line's (see PROBE_URL above).
    return await withTimeout(input, init, READ_TIMEOUT_MS)
  } catch (err) {
    // The caller cancelled it: that is not the network's fault, and not ours to retry.
    if (init.signal?.aborted) throw err
    // Only a request that FAILED counts against the line, not one that was merely slow to be answered: a read that ran out its fifteen
    // seconds was most often a heavy query, and the probe is what judges the connection.
    if (!(err instanceof DOMException && err.name === 'TimeoutError')) recordTimeout()
    return withTimeout(input, init, READ_TIMEOUT_MS)
  }
}
