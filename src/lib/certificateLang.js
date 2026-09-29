import { useEffect, useState } from 'react'
import { LOCALES, DEFAULT_LOCALE, loadLocale } from './i18n'
import { loadOverrides } from './translations'
import { translateTexts } from './contentTranslate'

// A CERTIFICATE IN THE LANGUAGE YOU SPEAK (30 Sep 2026).
//
// Ethan: creators should "choose to save it in English or their preferred language",
// only for languages they speak (English + Spanish => both, never German), and admins
// "can see all the language versions to review them ... on the language tool so admins
// can even change it."
//
// THE DESIGN STAYS ONE ROW. Nothing is stored per language. Two kinds of words:
//   * the design's own text (title, subtitle, body, footnote, signature role, preamble)
//     is TEMPLATE TEXT an admin wrote, so it goes through the same cached layer the
//     briefs use (`content_translations`) - which is exactly what the Languages editor's
//     "Briefs and content" tab lists, so a correction made there shows up on the next
//     certificate. Translated LINE BY LINE, with the {placeholders} still in, because
//     the design's drop-a-line-that-can't-be-filled rule works on lines and a translator
//     must not be allowed to merge two of them.
//   * the card's fixed words ("Awarded", "Certificate ID", "Verify at") are interface
//     strings, read from the ordinary dictionaries with `tIn`.

const LOCALE_TAG = { en: 'en-GB', es: 'es-ES', pt: 'pt-PT', de: 'de-DE', ro: 'ro-RO' }

/** Which languages this person may save a certificate in. English is always on the list. */
export function certificateLocales(profile, { all = false } = {}) {
  if (all) return LOCALES
  const spoken = new Set((profile?.languages || []).map((l) => String(l).trim().toLowerCase()))
  return LOCALES.filter((l) => l.code === DEFAULT_LOCALE
    || spoken.has(l.label.toLowerCase()) || spoken.has(l.native.toLowerCase())
    || (profile?.locale && profile.locale === l.code))
}

/** "1st" in the language: 1.º (es, pt), 1. (de), 1 (ro). */
export function ordinalIn(lang, n, en) {
  if (!lang || lang === DEFAULT_LOCALE) return en
  if (lang === 'es' || lang === 'pt') return `${n}.º`
  if (lang === 'de') return `${n}.`
  return String(n)
}

/** "30 September 2026" in the language. */
export function dateIn(lang, value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(LOCALE_TAG[lang] || 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const FIELDS = ['title', 'subtitle', 'body', 'footnote', 'signature_role']

// EVERY LANGUAGE IS READY BEFORE IT IS ASKED FOR (1 Oct 2026). Ethan: "the translations currently
// take quite a while. Can you have them all preloaded so they work instantly?" A translated design
// is kept here by its words and its language, and `prefetchCertificateDesign` fills it for every
// language in the background the moment a certificate is opened (or listed, for a creator). So
// pressing a language chip reads from memory instead of starting three round trips.
const translated = new Map() // designKey -> design
const inflight = new Map() // designKey -> promise
const designKey = (design, lang) => (design
  ? `${design.id || design.title}|${lang}|${FIELDS.map((f) => design[f] || '').join('¦')}|${design.options?.preamble || ''}`
  : null)

async function translateDesign(design, lang) {
  const k = designKey(design, lang)
  if (translated.has(k)) return translated.get(k)
  if (inflight.has(k)) return inflight.get(k)
  const job = (async () => {
    await Promise.all([loadLocale(lang), loadOverrides(lang)])
    const lines = new Set()
    const split = {}
    for (const f of FIELDS) {
      split[f] = String(design[f] || '').split('\n')
      split[f].forEach((l) => l.trim() && lines.add(l))
    }
    const custom = design.options?.preamble
    if (custom && custom !== 'This certifies that') lines.add(custom)
    const map = await translateTexts([...lines], lang)
    const tx = (l) => (l.trim() ? (map[l]?.value || l) : l)
    const next = { ...design }
    for (const f of FIELDS) next[f] = split[f].map(tx).join('\n')
    if (custom && custom !== 'This certifies that') next.options = { ...(design.options || {}), preamble: tx(custom) }
    // Only a complete answer is remembered; a line the translator could not reach is retried next time.
    if ([...lines].every((l) => map[l])) translated.set(k, next)
    return next
  })().finally(() => inflight.delete(k))
  inflight.set(k, job)
  return job
}

/** Translate a design into every language in `langs` (codes or LOCALES rows), in the background. */
export function prefetchCertificateDesign(design, langs = LOCALES) {
  if (!design) return
  for (const l of langs) {
    const code = typeof l === 'string' ? l : l.code
    if (code && code !== DEFAULT_LOCALE) translateDesign(design, code).catch(() => {})
  }
}

/**
 * The design with its words in `lang`, and whether that has finished. Until it has,
 * the original is returned so the card never flashes empty. Any failure is English.
 */
export function useCertificateDesign(design, lang) {
  const english = !lang || lang === DEFAULT_LOCALE
  const key = english ? null : designKey(design, lang)
  const [out, setOut] = useState({ key: null, design: null })
  useEffect(() => {
    if (english || !design || translated.has(key)) return undefined
    let alive = true
    translateDesign(design, lang)
      .then((next) => { if (alive) setOut({ key, design: next }) })
      .catch(() => { if (alive) setOut({ key, design }) })
    return () => { alive = false }
  }, [key, english, lang]) // eslint-disable-line react-hooks/exhaustive-deps
  if (english) return { design, ready: true }
  const cached = translated.get(key)
  if (cached) return { design: cached, ready: true }
  const ready = out.key === key
  return { design: ready ? out.design : design, ready }
}
