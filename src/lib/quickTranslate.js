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
const engineLang = (l) => (l === 'pt' ? 'pt-PT' : l)

async function viaBrowser(text, target) {
  const paras = text.split('\n')
  const out = []
  let src = null
  for (const p of paras) {
    if (!p.trim()) { out.push(p); continue }
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${engineLang(target)}&dt=t&q=${encodeURIComponent(p.slice(0, 4500))}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`mt ${res.status}`)
    const data = await res.json()
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
  return r
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
  const available = !!text && !!text.trim() && locale !== DEFAULT_LOCALE
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
  const available = locale !== DEFAULT_LOCALE
  const patch = (id, v) => setState((cur) => { const n = new Map(cur); n.set(id, { ...(n.get(id) || {}), ...v }); return n })
  const toggle = useCallback(async (m) => {
    if (!m?.body) return
    const cur = state.get(m.id)
    if (cur?.on) { patch(m.id, { on: false }); return }
    if (cur?.value != null && cur.body === m.body) { patch(m.id, { on: true }); return }
    patch(m.id, { busy: true })
    const r = await translateNow(m.body, locale)
    patch(m.id, { busy: false, on: !r.failed, value: r.value, body: m.body, same: r.src === locale })
  }, [state, locale])
  return {
    available,
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
