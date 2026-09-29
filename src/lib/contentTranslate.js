import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { getLocale, useLocale } from './i18n'

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

const memo = new Map() // `${locale}\n${text}` -> row | 'pending' promise
const key = (locale, text) => `${locale}\n${text}`

/** One row per text: { value, same, auto, src_lang } - or null if it could not be had. */
export async function translateTexts(texts, locale) {
  const wanted = [...new Set(texts.filter((t) => t && t.trim()))]
  const out = {}
  const need = []
  for (const t of wanted) {
    const hit = memo.get(key(locale, t))
    if (hit && !(hit instanceof Promise)) out[t] = hit
    else need.push(t)
  }
  if (need.length === 0) return out
  try {
    const hashes = await Promise.all(need.map((t) => sha256Hex(`${locale}\n${t}`)))
    const { data } = await supabase.from('content_translations')
      .select('source_hash, value, same, auto, src_lang').eq('locale', locale).in('source_hash', hashes)
    const byHash = new Map((data || []).map((r) => [r.source_hash, r]))
    const missing = []
    need.forEach((t, i) => {
      const row = byHash.get(hashes[i])
      if (row) { memo.set(key(locale, t), row); out[t] = row } else missing.push(t)
    })
    for (let i = 0; i < missing.length; i += 8) {
      const batch = missing.slice(i, i + 8)
      const { data: res, error } = await supabase.functions.invoke('translate-text', { body: { target: locale, items: batch.map((text) => ({ text })) } })
      if (error) continue
      for (const r of res?.results || []) {
        const row = { value: r.value, same: r.same, auto: r.auto, src_lang: r.src_lang }
        // A failed translation comes back as "same" with no language: do not remember it.
        if (r.src_lang) memo.set(key(locale, r.text), row)
        out[r.text] = row
      }
    }
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
export function useContentTranslation(text) {
  const locale = useLocale()
  const [row, setRow] = useState(null)
  const [showOriginal, setShowOriginal] = useState(false)
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
  const [showOriginal, setShowOriginal] = useState(false)
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
