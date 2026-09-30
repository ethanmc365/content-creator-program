import { useMemo } from 'react'
import { DEFAULT_LOCALE, useLocale } from './i18n'

// COUNTRY AND LANGUAGE NAMES, IN THE READER'S LANGUAGE (2 Oct 2026).
//
// Ethan: creators must be able to "sign up in their own language, everything works correctly, and it is
// translated". The country list, the languages-you-speak picker and the travel map all print English
// names ("Spain", "Portuguese"), and a hand-typed dictionary of two hundred countries and every language
// in four languages is exactly the kind of table that is wrong somewhere. The browser already knows
// every one of them, correctly, in every language we ship: `Intl.DisplayNames`.
//
// WHAT IS STORED IS NEVER TRANSLATED. `profiles.country`, `profiles.languages` and
// `countries_visited` keep the ENGLISH name - it is the key the map, the market rules and the filters
// match on. These helpers only change what is DRAWN. A name we cannot place (a language somebody typed
// themselves, a country the browser spells differently) comes back unchanged, which is English and
// readable rather than wrong.

// English name -> ISO 3166 region, built once from the browser's own English list, plus the few names
// the world map and our own list spell differently from CLDR.
let REGION_BY_NAME = null
const EXTRA_REGIONS = {
  'united states of america': 'US', 'usa': 'US', 'uk': 'GB', 'england': 'GB', 'scotland': 'GB', 'wales': 'GB',
  'czech republic': 'CZ', 'bosnia and herz.': 'BA', 'dem. rep. congo': 'CD', 'congo': 'CG', 'central african rep.': 'CF',
  'dominican rep.': 'DO', 'eq. guinea': 'GQ', 'eswatini': 'SZ', 'swaziland': 'SZ', 'macedonia': 'MK',
  'north macedonia': 'MK', 'myanmar': 'MM', 'burma': 'MM', 'cabo verde': 'CV', 'cape verde': 'CV',
  "côte d'ivoire": 'CI', 'ivory coast': 'CI', 's. sudan': 'SS', 'solomon is.': 'SB', 'w. sahara': 'EH',
  'falkland is.': 'FK', 'fr. s. antarctic lands': 'TF', 'n. cyprus': 'CY', 'timor-leste': 'TL', 'east timor': 'TL',
  'turkey': 'TR', 'türkiye': 'TR', 'south korea': 'KR', 'north korea': 'KP', 'russia': 'RU', 'vatican city': 'VA',
  'the bahamas': 'BS', 'bahamas': 'BS', 'the gambia': 'GM', 'gambia': 'GM', 'hong kong': 'HK', 'macau': 'MO',
  'palestine': 'PS', 'kosovo': 'XK', 'taiwan': 'TW', 'laos': 'LA', 'vietnam': 'VN', 'syria': 'SY', 'iran': 'IR',
  'moldova': 'MD', 'tanzania': 'TZ', 'bolivia': 'BO', 'venezuela': 'VE', 'brunei': 'BN', 'uae': 'AE',
}

function regionIndex() {
  if (REGION_BY_NAME) return REGION_BY_NAME
  REGION_BY_NAME = new Map(Object.entries(EXTRA_REGIONS))
  try {
    const en = new Intl.DisplayNames(['en'], { type: 'region' })
    const A = 'A'.charCodeAt(0)
    for (let i = 0; i < 26; i += 1) {
      for (let j = 0; j < 26; j += 1) {
        const code = String.fromCharCode(A + i) + String.fromCharCode(A + j)
        let name
        try { name = en.of(code) } catch { name = null }
        if (name && name !== code) REGION_BY_NAME.set(name.toLowerCase(), code)
      }
    }
  } catch { /* no Intl.DisplayNames: every name stays English */ }
  return REGION_BY_NAME
}

// The languages the picker offers, by the code the browser knows them under.
const LANGUAGE_CODES = {
  english: 'en', irish: 'ga', french: 'fr', spanish: 'es', portuguese: 'pt', italian: 'it', german: 'de',
  dutch: 'nl', polish: 'pl', welsh: 'cy', 'scottish gaelic': 'gd', hindi: 'hi', punjabi: 'pa', urdu: 'ur',
  arabic: 'ar', mandarin: 'zh-Hans', cantonese: 'yue', japanese: 'ja', korean: 'ko', turkish: 'tr', greek: 'el',
  romanian: 'ro', ukrainian: 'uk', russian: 'ru', swedish: 'sv', norwegian: 'no', danish: 'da',
  finnish: 'fi', czech: 'cs', hungarian: 'hu', bulgarian: 'bg', croatian: 'hr', serbian: 'sr', hebrew: 'he',
  thai: 'th', vietnamese: 'vi', indonesian: 'id', malay: 'ms', tagalog: 'tl', swahili: 'sw', bengali: 'bn',
  tamil: 'ta', persian: 'fa', catalan: 'ca', basque: 'eu', galician: 'gl', slovak: 'sk', slovenian: 'sl',
  lithuanian: 'lt', latvian: 'lv', estonian: 'et', icelandic: 'is', afrikaans: 'af', albanian: 'sq',
}

const sentenceCase = (s, locale) => (s ? s.charAt(0).toLocaleUpperCase(locale) + s.slice(1) : s)

/** A country's name in `locale`. Unknown names come back as they were given. */
export function countryLabel(name, locale) {
  if (!name || !locale || locale === DEFAULT_LOCALE) return name
  try {
    const iso = regionIndex().get(String(name).trim().toLowerCase())
    if (!iso) return name
    const out = new Intl.DisplayNames([locale], { type: 'region' }).of(iso)
    return out && out !== iso ? out : name
  } catch { return name }
}

/** A language's name in `locale`. A language somebody typed themselves comes back unchanged. */
export function languageLabel(name, locale) {
  if (!name || !locale || locale === DEFAULT_LOCALE) return name
  try {
    const code = LANGUAGE_CODES[String(name).trim().toLowerCase()]
    if (!code) return name
    const out = new Intl.DisplayNames([locale], { type: 'language' }).of(code)
    return out && out !== code ? sentenceCase(out, locale) : name
  } catch { return name }
}

/** `countryLabel` and `languageLabel` bound to the language on screen, re-rendering when it changes. */
export function usePlaceNames() {
  const locale = useLocale()
  return useMemo(() => ({
    country: (n) => countryLabel(n, locale),
    language: (n) => languageLabel(n, locale),
    locale,
  }), [locale])
}
