import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { getLocale, useLocale } from './i18n'
import { translateInBrowser } from './quickTranslate'

// WHAT A PERSON WROTE, IN THE READER'S LANGUAGE, WITHOUT A SECOND COPY OF IT.
//
// Ethan: briefs and the like should be readable in a creator's own language, and "keep
// same file". A challenge still holds ONE text - what its author wrote. This asks for
// what that text says in the reader's language, from a cache keyed on a hash of the
// exact words (`content_translations`, migration 281), and only calls the translator the
// first time anybody asks. The original is never altered and is one press away
// (`TranslatedText`).
//
// EVERY FAILURE IS THE ORIGINAL. Offline, a translator that is down, a table that has not
// been migrated: the reader gets exactly what the author wrote, unmarked. A translation
// layer that can take a brief away from somebody is worse than none.

export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const memo = new Map() // `${locale}\n${text}` -> row
const inflight = new Map() // `${locale}\n${text}` -> Promise<row | undefined>, while it is being fetched
const key = (locale, text) => `${locale}\n${text}`

// ONE CACHE LOOKUP PER PAGE, NOT ONE PER TEXT (7 Oct 2026). Every TranslatedText / ReaderText on a page
// used to send its own `content_translations` request - the busiest endpoint on the platform, ~9,000 a
// day, and the one at the front of the queue when the database ran out of room and the platform went
// down. Lookups asked for within the same 25ms are now merged into one request (chunked so the URL
// stays short), and a text already on its way is waited for rather than asked for again.
const LOOKUP_WAIT_MS = 25
const LOOKUP_CHUNK = 60
const lookups = new Map() // locale -> { hashes: Set, waiters: [{ resolve }], timer }

function lookupRows(locale, hashes) {
  return new Promise((resolve) => {
    let q = lookups.get(locale)
    if (!q) {
      q = { hashes: new Set(), waiters: [], timer: null }
      lookups.set(locale, q)
      q.timer = setTimeout(async () => {
        lookups.delete(locale)
        const all = [...q.hashes]
        const byHash = new Map()
        await Promise.all(Array.from({ length: Math.ceil(all.length / LOOKUP_CHUNK) }, async (_, i) => {
          try {
            const { data } = await supabase.from('content_translations')
              .select('source_hash, value, same, auto, src_lang').eq('locale', locale)
              .in('source_hash', all.slice(i * LOOKUP_CHUNK, (i + 1) * LOOKUP_CHUNK))
            for (const r of data || []) byHash.set(r.source_hash, r)
          } catch { /* a missing chunk is the original text */ }
        }))
        q.waiters.forEach((w) => w(byHash))
      }, LOOKUP_WAIT_MS)
    }
    hashes.forEach((h) => q.hashes.add(h))
    q.waiters.push(resolve)
  })
}

/** One row per text: { value, same, auto, src_lang } - or null if it could not be had. */
export async function translateTexts(texts, locale) {
  const wanted = [...new Set(texts.filter((t) => t && t.trim()))]
  const out = {}
  const need = []
  const waiting = []
  for (const t of wanted) {
    const hit = memo.get(key(locale, t))
    if (hit) out[t] = hit
    else if (inflight.has(key(locale, t))) waiting.push([t, inflight.get(key(locale, t))])
    else need.push(t)
  }
  if (need.length === 0 && waiting.length === 0) return out
  const work = need.length ? fetchTexts(need, locale) : Promise.resolve({})
  for (const t of need) inflight.set(key(locale, t), work.then((res) => res[t]))
  const [fetched, ...waited] = await Promise.all([work, ...waiting.map(([, p]) => p)])
  for (const t of need) inflight.delete(key(locale, t))
  Object.assign(out, fetched)
  waiting.forEach(([t], i) => { if (waited[i]) out[t] = waited[i] })
  return out
}

async function fetchTexts(need, locale) {
  const out = {}
  try {
    const hashes = await Promise.all(need.map((t) => sha256Hex(`${locale}\n${t}`)))
    const byHash = await lookupRows(locale, hashes)
    const missing = []
    need.forEach((t, i) => {
      const row = byHash.get(hashes[i])
      if (row) { memo.set(key(locale, t), row); out[t] = row } else missing.push(t)
    })
    // THE READER'S BROWSER FIRST (2 Oct 2026). The server's calls to the free engines are
    // rate-limited on Supabase's shared addresses (three in four failed in a day); from here the
    // same endpoint answers on the reader's own allowance. What it makes is kept in memory and in
    // the shared cache (`cache_content_translation`, migration 288). Anything it cannot do still
    // goes to the edge function, which tries its own engines.
    const viaServer = []
    await Promise.all(missing.map(async (t) => {
      try {
        const r = await translateInBrowser(t, locale)
        const same = r.src === locale || r.value.trim() === t.trim()
        const row = { value: same ? t : r.value, same, auto: true, src_lang: r.src }
        memo.set(key(locale, t), row)
        out[t] = row
        supabase.rpc('cache_content_translation', { p_locale: locale, p_source: t, p_value: r.value, p_src: r.src }).then(() => {}, () => {})
      } catch { viaServer.push(t) }
    }))
    // The batches go out together rather than one after another.
    const batches = []
    for (let i = 0; i < viaServer.length; i += 8) batches.push(viaServer.slice(i, i + 8))
    await Promise.all(batches.map(async (batch) => {
      const { data: res, error } = await supabase.functions.invoke('translate-text', { body: { target: locale, items: batch.map((text) => ({ text })) } })
      if (error) return
      for (const r of res?.results || []) {
        const row = { value: r.value, same: r.same, auto: r.auto, src_lang: r.src_lang }
        // A failed translation comes back as "same" with no language: do not remember it.
        if (r.src_lang) memo.set(key(locale, r.text), row)
        out[r.text] = row
      }
    }))
  } catch { /* the original is a complete answer */ }
  return out
}

/** Forget what is held for one text, after a lead corrects it. */
export function forgetTranslation(locale, text) { memo.delete(key(locale, text)) }

/**
 * The translation of one text for the current reader, plus the switch for the original.
 * `shown` is what to draw. `translated` is true only when it really differs from the
 * original, which is when the "translated automatically" note earns its place.
 */
export function useContentTranslation(text, { originalFirst = true } = {}) {
  const locale = useLocale()
  const [row, setRow] = useState(null)
  // ORIGINAL FIRST (1 Oct 2026). Ethan: "whenever I'm viewing in English, for example the Portugal challenge, the
  // prefix, etc., should always show in the language it was typed in first, not automatically be translated. Of
  // course, that toggle should still be there at the top." So what the author wrote is what opens, and the switch
  // (Original | Translated) is one press away once a translation exists.
  const [showOriginal, setShowOriginal] = useState(originalFirst)
  useEffect(() => {
    let alive = true
    setRow(null)
    if (!text || !text.trim()) return undefined
    translateTexts([text], getLocale()).then((res) => { if (alive) setRow(res[text] || null) })
    return () => { alive = false }
  }, [text, locale])
  const translated = !!row && !row.same && row.value !== text
  return {
    shown: translated && !showOriginal ? row.value : text,
    translated,
    auto: row?.auto !== false,
    srcLang: row?.src_lang || null,
    showOriginal,
    toggle: () => setShowOriginal((v) => !v),
    loading: !!text && text.trim() !== '' && row === null,
  }
}

/**
 * The same, for a LIST of short texts that share one switch (the bonus points on a challenge:
 * every label and question, one Translated | Original control). `pick(text)` returns what to draw.
 */
export function useContentTranslations(texts) {
  const locale = useLocale()
  const [map, setMap] = useState({})
  const [showOriginal, setShowOriginal] = useState(true) // original first, like useContentTranslation
  const key = (texts || []).filter((t) => t && t.trim()).join('\u0001')
  useEffect(() => {
    let alive = true
    if (!key) { setMap({}); return undefined }
    translateTexts(key.split('\u0001'), getLocale()).then((res) => { if (alive) setMap(res) })
    return () => { alive = false }
  }, [key, locale])
  const differs = (t) => { const r = map[t]; return !!r && !r.same && r.value && r.value !== t }
  const rows = Object.values(map)
  return {
    pick: (t) => (!showOriginal && differs(t) ? map[t].value : t),
    translated: (texts || []).some((t) => t && differs(t)),
    srcLang: rows.find((r) => r?.src_lang)?.src_lang || null,
    showOriginal,
    toggle: () => setShowOriginal((v) => !v),
  }
}
