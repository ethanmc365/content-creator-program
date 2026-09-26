// LINKS INTO TRYP.COM, IN THE CREATOR'S OWN LANGUAGE (26 Sep 2026).
//
// Ethan: "a link directly to the Tryp.com website that's going to show the best
// deals ... it should probably bring them to their own correct language and
// from their correct country." tryp.com serves each language under its own
// first path segment (/es, /pt, /de ... measured 26 Sep: /nb, /en-gb and
// friends 404, so only these exact codes). The country a creator gave us
// decides it; failing that, the browser's language; failing that, English.

export const TRYP_SITE = 'https://www.tryp.com'

const SUPPORTED = ['en', 'es', 'pt', 'de', 'ro', 'sv', 'da', 'no', 'fi', 'fr', 'it', 'nl', 'pl']

const BY_COUNTRY = {
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es',
  PT: 'pt', BR: 'pt',
  DE: 'de', AT: 'de', CH: 'de',
  RO: 'ro', MD: 'ro',
  SE: 'sv', DK: 'da', NO: 'no', FI: 'fi',
  FR: 'fr', IT: 'it', NL: 'nl', BE: 'nl', PL: 'pl',
}

const BY_NAME = {
  spain: 'es', portugal: 'pt', brazil: 'pt', germany: 'de', austria: 'de', switzerland: 'de',
  romania: 'ro', moldova: 'ro', sweden: 'sv', denmark: 'da', norway: 'no', finland: 'fi',
  france: 'fr', italy: 'it', netherlands: 'nl', belgium: 'nl', poland: 'pl',
}

export function trypLocale(profile, navLanguages = (typeof navigator !== 'undefined' ? (navigator.languages || [navigator.language]) : [])) {
  const code = String(profile?.country_code || '').trim().toUpperCase()
  if (BY_COUNTRY[code]) return BY_COUNTRY[code]
  const name = String(profile?.country || '').trim().toLowerCase()
  if (BY_NAME[name]) return BY_NAME[name]
  if (code || name) return 'en'
  for (const tag of navLanguages || []) {
    const base = String(tag || '').slice(0, 2).toLowerCase()
    if (base === 'nb' || base === 'nn') return 'no'
    if (SUPPORTED.includes(base)) return base
  }
  return 'en'
}

export const trypHome = (locale = 'en') => `${TRYP_SITE}/${locale}`
export const trypTrips = (locale, kind) => `${TRYP_SITE}/${locale}/trips/${kind}`

// The themed trip pages tryp.com runs, each a ready-made deal list.
export const TRIP_KINDS = [
  { kind: 'weekend', label: 'Weekend breaks', icon: 'calendar' },
  { kind: 'beach', label: 'Beach', icon: 'sun' },
  { kind: 'multi-city', label: 'Multi-city', icon: 'pin' },
  { kind: 'hidden-gems', label: 'Hidden gems', icon: 'sparkles' },
  { kind: 'christmas', label: 'Christmas', icon: 'star' },
  { kind: 'snow', label: 'Snow', icon: 'snowflake' },
  { kind: 'single-city', label: 'City breaks', icon: 'flag' },
  { kind: 'intercontinental', label: 'Long haul', icon: 'globe' },
]
