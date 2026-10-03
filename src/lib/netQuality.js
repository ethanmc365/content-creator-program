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

const SLOW_MS = 1800 // a database read slower than this, on average, is a slow connection
const FAST_MS = 800 // and faster than this is a recovered one (a gap, so it does not flicker)
const MIN_SAMPLES = 5
// NOT AT LAUNCH, AND NOT IN A CROWD (3 Oct 2026). Ethan: "even if I open the app with a strong signal, it still
// shows up that low Wi-Fi thing." The first seconds of a launch are a dozen reads queued behind one fresh TLS
// connection and a token refresh, so each one LOOKED slow on perfect wifi and three of them were enough to call
// the line weak. A read now only counts once the app has been open for a few seconds and when it was not one of a
// burst - its time then measures the connection, not the queue in front of it.
const WARMUP_MS = 6000
const CROWD = 3
let inflight = 0
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
  const started = performance.now()
  const counts = started - bootAt > WARMUP_MS && inflight < CROWD
  inflight += 1
  try {
    const res = await withTimeout(input, init, READ_TIMEOUT_MS)
    if (counts) recordRequest(performance.now() - started)
    return res
  } catch (err) {
    // The caller cancelled it: that is not the network's fault, and not ours to retry.
    if (init.signal?.aborted) throw err
    recordTimeout()
    return withTimeout(input, init, READ_TIMEOUT_MS)
  } finally {
    inflight -= 1
  }
}
