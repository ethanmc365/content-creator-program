// AN INTRODUCTION, AS DATA (24 Sep 2026).
//
// Ethan: "whenever they fill in the introduction, it just comes as [a block of
// text]. It doesn't structure it very well and doesn't look great. We're not
// actually getting that much information from them... You can pull out more
// stats from their profile... Make it colourful, show some icons like flags for
// places they've been to or they're interested in, and connect buttons right
// inside the chat."
//
// The room draws `messages.intro` (migration 262) as a card - see
// components/network/IntroCard. This file owns the SHAPE, so the form, the card
// and the plain-text copy in `body` cannot disagree, and it reads the intros
// posted before the card existed (a fixed set of "Label: value." lines) back
// into the same shape so the whole room looks the same.
//
//   {
//     v: 1,
//     first, city, country, iso,          who and where
//     makes: [..], wants: [..],           chips
//     next: { text, iso },                where they are headed
//     ask, fact,                          two lines in their own words
//     visited: [{ name, iso }],           from the profile's countries
//     dreams:  [{ name, iso }],           from the profile's bucket list
//     socials: { instagram, tiktok, youtube, facebook },
//     languages: [..],
//     stats: { countries, flights, videos, since }
//   }

import { isoForCountryName } from './markets'
import { COUNTRIES } from './countries'

export const INTRO_MAKES = [
  'City guides', 'Budget travel', 'Luxury stays', 'Food', 'Hotels', 'Solo travel',
  'Family travel', 'Adventure', 'Road trips', 'Hidden gems', 'Deals', 'Vlogs',
]

export const INTRO_WANTS = [
  'Collabs', 'Feedback on my videos', 'Meeting people near me',
  'Getting better at hooks', 'Paid briefs', 'Travel buddies',
]

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** The first country named anywhere in a sentence ("Lisbon in March" -> null,
 *  "Thailand in October" -> TH), for a flag beside the next trip. */
export function isoInText(text) {
  const t = clean(text).toLowerCase()
  if (!t) return null
  let best = null
  for (const c of COUNTRIES) {
    for (const n of [c.name, ...(c.aliases || [])]) {
      const k = n.toLowerCase()
      if (k.length < 3) continue // "us", "uk" are words in their own right
      const m = new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`).exec(t)
      if (m && (best == null || m.index < best.at)) best = { at: m.index, iso: c.iso2 }
    }
  }
  return best?.iso ?? null
}

const place = (name) => {
  const n = clean(name)
  return n ? { name: n, iso: isoForCountryName(n) } : null
}

/**
 * The intro to post, from the form and the profile.
 * @param {object} profile  the creator's profile row
 * @param {object} form     { where, makes, next, ask, fact, wants }
 * @param {object} extras   { flights, videos } counted by the caller
 */
export function buildIntro(profile = {}, form = {}, extras = {}) {
  const first = clean(profile.name).split(' ')[0] || 'Hi'
  const where = clean(form.where)
  const [cityPart, ...rest] = where.split(',')
  const country = clean(rest.join(',')) || clean(profile.country)
  const visited = (profile.countries_visited || []).map(place).filter(Boolean)
  const dreams = (Array.isArray(profile.bucket_list) ? profile.bucket_list : [])
    .map((b) => place(typeof b === 'string' ? b : (b?.country || b?.city)))
    .filter(Boolean)
  return {
    v: 1,
    first,
    city: clean(cityPart) || clean(profile.city),
    country,
    iso: isoForCountryName(country) || profile.country_code || null,
    makes: (form.makes || []).map(clean).filter(Boolean).slice(0, 6),
    wants: (form.wants || []).map(clean).filter(Boolean).slice(0, 4),
    next: clean(form.next) ? { text: clean(form.next), iso: isoInText(form.next) } : null,
    ask: clean(form.ask) || null,
    fact: clean(form.fact) || null,
    visited: visited.slice(0, 40),
    dreams: dreams.slice(0, 12),
    socials: {
      instagram: profile.instagram_url || null,
      tiktok: profile.tiktok_url || null,
      youtube: profile.youtube_url || null,
      facebook: profile.facebook_url || null,
    },
    languages: (profile.languages || []).slice(0, 5),
    stats: {
      countries: visited.length,
      flights: Number(extras.flights) || 0,
      videos: Number(extras.videos) || 0,
    },
  }
}

/** The plain-text copy that goes in `body`: search, notifications, old clients. */
export function introToText(intro) {
  if (!intro) return ''
  const lines = []
  const where = [intro.city, intro.country].filter(Boolean).join(', ')
  lines.push(`👋 ${intro.first} here${where ? `, based in ${where}` : ''}.`)
  if (intro.makes?.length) lines.push(`I make: ${intro.makes.join(', ')}.`)
  if (intro.next?.text) lines.push(`Next trip: ${intro.next.text}.`)
  if (intro.ask) lines.push(`Ask me about: ${intro.ask}.`)
  if (intro.fact) lines.push(`Fun fact: ${intro.fact}.`)
  if (intro.wants?.length) lines.push(`Hoping to find: ${intro.wants.join(', ')}.`)
  return lines.join('\n')
}

const LEGACY = /^👋\s*(.+?) here(?:, based in (.+?))?\.\s*$/u

/**
 * An intro posted before the card existed, read back into the same shape -
 * or null for any message that is not one. They were all written by one form,
 * so every line is "Label: value." and the first is "👋 Name here, based in X."
 */
export function parseLegacyIntro(body) {
  const lines = String(body || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const head = lines[0]?.match(LEGACY)
  if (!head) return null
  const take = (label) => {
    const l = lines.find((x) => x.toLowerCase().startsWith(`${label.toLowerCase()}:`))
    if (!l) return null
    return clean(l.slice(label.length + 1).replace(/\.\s*$/, ''))
  }
  const list = (label) => (take(label) || '').split(',').map(clean).filter(Boolean)
  const where = clean(head[2])
  const parts = where.split(',').map(clean).filter(Boolean)
  const country = parts.length > 1 ? parts[parts.length - 1] : parts[0] || ''
  const city = parts.length > 1 ? parts.slice(0, -1).join(', ') : ''
  const next = take('Next trip')
  return {
    v: 0,
    first: clean(head[1]),
    city,
    country,
    iso: isoForCountryName(country),
    makes: list('I make'),
    wants: list('Hoping to find'),
    next: next ? { text: next, iso: isoInText(next) } : null,
    ask: take('Ask me about'),
    fact: take('Fun fact'),
    visited: [],
    dreams: [],
    socials: {},
    languages: [],
    stats: null,
  }
}
