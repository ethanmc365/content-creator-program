import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { getLocale, useLocale, DEFAULT_LOCALE } from './i18n'

// TRANSLATE THIS, ON REQUEST (2 Oct 2026).
//
// Ethan: chat messages (and a hook) should "always start with the original and just have the ability
// to translate", shown "only if you're viewing the page in another language", and done "for free ...
// by connecting it with Google".
//
// So unlike a challenge brief (lib/contentTranslate, translated for every reader and cached in the
// database), nothing here happens until somebody presses Translate, and nothing is stored: a chat
// message is somebody's words in a conversation, not content to be kept a second copy of.
//
// THE ENGINE IS GOOGLE'S FREE ENDPOINT, CALLED FROM THE READER'S OWN BROWSER. It needs no key and
// costs nothing, and because each reader asks from their own address the limit Google puts on one
// address is never shared (the edge function's shared egress is what gets 429'd). When the browser
// call fails, the edge function's `ephemeral` draft mode is the second door, which also falls back
// to MyMemory. Every failure leaves the original on screen.

const memo = new Map() // `${locale}\n${text}` -> { value, src }

// ENGLISH READERS CAN TRANSLATE TOO (1 Oct 2026). Ethan: "if I'm on the main English language but a message is sent
// in Spanish, I should be able to translate it ... even if a language is not on the platform. If someone sends a
// Chinese message, we could translate it because Google can just detect it and translate."
//
// Google detects the language itself, so any language works. What a reader on English needs is for the button to
// appear on the messages that are NOT English and stay out of the way on the ones that are. This is the cheap guess
// that decides it before anything is sent anywhere: another script, accented letters, or a run of words with almost
// none of the everyday English ones. A wrong guess costs nothing - the reader on English just does not see the button
// on that one message, and anyone on another language always does.
const EN_WORDS = new Set(('the and is are was were be been to of in on at for with you your i me my we our it its this that these those '
  + 'a an or but not no yes so if as by from have has had do does did will would can could should just very really thanks thank '
  + 'hi hello hey ok okay please what when where who how why which there here they them he she his her us all any some more most').split(' '))
export function looksNonEnglish(text) {
  const t = String(text || '').trim()
  if (t.length < 2) return false
  if (/[^\s\u0020-\u024F\u2000-\u206F\u20A0-\u20CF\u{1F000}-\u{1FFFF}\u2600-\u27BF]/u.test(t)) return true // another script
  if (/[àáâãäåæçèéêëìíîïñòóôõöøùúûüýÿœßąćęłńśźżăîșț]/i.test(t)) return true
  const words = t.toLowerCase().match(/[a-z']+/g) || []
  if (words.length < 3) return false
  const hits = words.filter((w) => EN_WORDS.has(w)).length
  return hits / words.length < 0.12
}
const engineLang = (l) => (l === 'pt' ? 'pt-PT' : l)

// NOT RATE-LIMITED, AND FAST THE SECOND TIME (30 Sep 2026). Ethan: "properly set it up so that we don't
// get rate-limited and we receive no errors. If there is a rate limit error, just show a simple error"
// and chat translations "take a little while to load".
//   - ONE REQUEST PER TEXT, not one per paragraph (a five-line message was five calls).
//   - A QUEUE: at most two calls in flight and ~150ms between starts, so opening a busy room and
//     translating a run of messages never bursts at Google.
//   - A 429 or 5xx is retried twice with backoff; a 429 also starts a two-minute cool-down during
//     which requests go straight to the server fallback instead of hammering the endpoint.
//   - Results are remembered in this browser (localStorage, newest 400), so a message translated
//     yesterday is instant today.
//   - Any failure after all that returns `failed`, and the UI says "This message can't be translated
//     right now." rather than an error.
const STORE = 'tryp_mt_cache_v1'
const STORE_MAX = 400
function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || '[]')
    for (const [k, v] of raw) memo.set(k, v)
  } catch { /* private mode or corrupt: start empty */ }
}
let storeTimer = null
function saveStore() {
  clearTimeout(storeTimer)
  storeTimer = setTimeout(() => {
    try { localStorage.setItem(STORE, JSON.stringify([...memo.entries()].slice(-STORE_MAX))) } catch { /* full or blocked */ }
  }, 400)
}
if (typeof window !== 'undefined') loadStore()

const MAX_IN_FLIGHT = 2
const GAP_MS = 150
let inFlight = 0
let lastStart = 0
const waiting = []
let coolUntil = 0
function pump() {
  if (inFlight >= MAX_IN_FLIGHT || waiting.length === 0) return
  const wait = Math.max(0, lastStart + GAP_MS - Date.now())
  if (wait > 0) { setTimeout(pump, wait); return }
  const job = waiting.shift()
  inFlight += 1
  lastStart = Date.now()
  job.run().then(job.resolve, job.reject).finally(() => { inFlight -= 1; pump() })
  pump()
}
function queued(run) {
  return new Promise((resolve, reject) => { waiting.push({ run, resolve, reject }); pump() })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const TRANSLATE_FAILED_TEXT = "This message can't be translated right now."

// {placeholders} ("for winning {challenge}") must come back exactly as they went in, so they are
// swapped for inert tokens first and put back after. If the engine ate one, it is a failure.
function protect(text) {
  const found = []
  const masked = text.replace(/\{(\w+)\}/g, (m) => { found.push(m); return `QX${found.length - 1}XQ` })
  return {
    text: masked,
    back: (t) => {
      let out = t
      for (let i = 0; i < found.length; i += 1) {
        const re = new RegExp(`QX\\s?${i}\\s?XQ`, 'i')
        if (!re.test(out)) return null
        out = out.replace(re, found[i])
      }
      return out
    },
  }
}

/** Google's free endpoint from this browser, placeholders kept. Throws on any failure. */
export async function translateInBrowser(text, target) {
  const g = protect(text)
  const r = await viaBrowser(g.text, target)
  const value = g.back(r.value)
  if (value == null) throw new Error('placeholder lost')
  return { value, src: r.src }
}

async function oneCall(text, target) {
  if (Date.now() < coolUntil) throw new Error('cooling down')
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${engineLang(target)}&dt=t&q=${encodeURIComponent(text)}`
  for (let attempt = 0; ; attempt += 1) {
    const res = await queued(() => fetch(url))
    if (res.ok) return res.json()
    const retryable = res.status === 429 || res.status >= 500
    if (res.status === 429) coolUntil = Date.now() + 120000
    if (!retryable || attempt >= 2) throw new Error(`mt ${res.status}`)
    await sleep(700 * (attempt + 1) + Math.random() * 300)
  }
}

async function viaBrowser(text, target) {
  // The whole text in one call (Google keeps the line breaks); only a very long one is split.
  const chunks = []
  let cur = ''
  for (const line of text.split('\n')) {
    if (cur && (cur.length + line.length + 1) > 4000) { chunks.push(cur); cur = line } else cur = cur ? `${cur}\n${line}` : line
  }
  chunks.push(cur)
  const out = []
  let src = null
  for (const c of chunks) {
    if (!c.trim()) { out.push(c); continue }
    const data = await oneCall(c.slice(0, 4500), target)
    out.push((data[0] || []).map((x) => String(x?.[0] ?? '')).join(''))
    if (!src && typeof data[2] === 'string') src = data[2].toLowerCase().slice(0, 2)
  }
  return { value: out.join('\n').replace(/\*\*\s*([^*\n]+?)\s*\*\*/g, '**$1**').replace(/@\s+(\w)/g, '@$1'), src }
}

async function viaServer(text, target) {
  const { data, error } = await supabase.functions.invoke('translate-text', { body: { target, ephemeral: true, items: [{ text }] } })
  if (error) throw error
  const r = data?.results?.[0]
  if (!r || !r.value) throw new Error('no translation')
  return { value: r.value, src: r.src_lang || null }
}

/** The text in `target` (the reader's language by default). Resolves to the original on failure. */
export async function translateNow(text, target = getLocale()) {
  const k = `${target}\n${text}`
  if (memo.has(k)) return memo.get(k)
  let r
  try { r = await viaBrowser(text, target) } catch {
    try { r = await viaServer(text, target) } catch { return { value: text, src: null, failed: true } }
  }
  memo.set(k, r)
  saveStore()
  return r
}

/** Already translated (this session or a previous one), so it can be shown with no wait. */
export function cachedTranslation(text, target = getLocale()) {
  return memo.get(`${target}\n${text}`) || null
}

/**
 * One piece of text with a Translate button. `shown` is what to draw. Starts on the ORIGINAL.
 * `available` is false when the reader is on English (nothing to offer) or there is no text.
 */
export function useTranslateOnDemand(text) {
  const locale = useLocale()
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const seq = useRef(0)
  // A new text (the next hook) or a new language starts on the original again.
  useEffect(() => { setOn(false); setResult(null); setBusy(false) }, [text, locale])
  const available = !!text && !!text.trim() && (locale !== DEFAULT_LOCALE || looksNonEnglish(text))
  const toggle = useCallback(async () => {
    if (on) { setOn(false); return }
    if (result) { setOn(true); return }
    const mine = ++seq.current
    setBusy(true)
    const r = await translateNow(text, locale)
    if (mine !== seq.current) return
    setBusy(false)
    setResult(r)
    setOn(!r.failed)
  }, [on, result, text, locale])
  const same = !!result && (result.src === locale || result.value.trim() === String(text).trim())
  return {
    available,
    on,
    busy,
    same,
    failed: !!result?.failed,
    shown: on && result ? result.value : text,
    toggle,
  }
}

/**
 * Translation for the messages in a thread, one message at a time. The page holds one of these;
 * `toggle(m)` translates a message (or puts it back), `textFor(m)` is what its bubble draws, and
 * `isOn(m)` says whether the bubble is showing a translation. Everything starts as the original.
 */
export function useMessageTranslations() {
  const locale = useLocale()
  const [state, setState] = useState(() => new Map()) // id -> { on, busy, value }
  useEffect(() => { setState(new Map()) }, [locale])
  const available = true
  const patch = (id, v) => setState((cur) => { const n = new Map(cur); n.set(id, { ...(n.get(id) || {}), ...v }); return n })
  const toggle = useCallback(async (m) => {
    if (!m?.body) return
    const cur = state.get(m.id)
    if (cur?.on) { patch(m.id, { on: false }); return }
    if (cur?.value != null && cur.body === m.body) { patch(m.id, { on: true }); return }
    patch(m.id, { busy: true })
    const r = await translateNow(m.body, locale)
    patch(m.id, { busy: false, on: !r.failed, failed: !!r.failed, value: r.value, body: m.body, same: r.src === locale })
    // The failure note clears itself after a few seconds, so it never sits on a message for good.
    if (r.failed) setTimeout(() => patch(m.id, { failed: false }), 6000)
  }, [state, locale])
  return {
    available,
    // Whether to offer the button on this message: always for a reader on another language, and for a reader
    // on English only where the message does not look English.
    canFor: (m) => !!m?.body && (locale !== DEFAULT_LOCALE || looksNonEnglish(m.body)),
    isFailed: (m) => !!state.get(m.id)?.failed,
    isOn: (m) => !!state.get(m.id)?.on && state.get(m.id)?.body === m.body,
    isBusy: (m) => !!state.get(m.id)?.busy,
    isSame: (m) => !!state.get(m.id)?.same,
    textFor: (m) => {
      const s = state.get(m.id)
      return s?.on && s.body === m.body ? s.value : m.body
    },
    toggle,
  }
}
