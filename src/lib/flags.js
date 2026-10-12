import { ALL_COUNTRIES } from './allCountries'

// THE MAP'S OWN SHORT NAMES (12 Oct 2026). The world atlas abbreviates ("Dem. Rep. Congo", "Bosnia and Herz.") and
// `COUNTRIES` (the geography game's 83) only lists aliases for the countries it plays, so hovering about 150 countries
// on a creator's travel map showed a name with no flag. Every country now resolves: the pickers' full list (every
// country with a dialling code) plus these spellings.
const ATLAS_ALIASES = {
  'marshall is.': 'MH', 'n. mariana is.': 'MP', 'u.s. virgin is.': 'VI', 's. geo. and the is.': 'GS',
  'br. indian ocean ter.': 'IO', 'pitcairn is.': 'PN', 'falkland is.': 'FK', 'cayman is.': 'KY', 'british virgin is.': 'VG',
  'turks and caicos is.': 'TC', 'solomon is.': 'SB', 's. sudan': 'SS', 'esvatini': 'SZ', 'eswatini': 'SZ', 'somaliland': 'SO',
  'são tomé and principe': 'ST', 'st. vin. and gren.': 'VC', 'st. kitts and nevis': 'KN', 'cook is.': 'CK', 'w. sahara': 'EH',
  'macedonia': 'MK', 'kosovo': 'XK', 'st. pierre and miquelon': 'PM', 'wallis and futuna is.': 'WF', 'st-martin': 'MF',
  'st-barthélemy': 'BL', 'fr. polynesia': 'PF', 'fr. s. antarctic lands': 'TF', 'åland': 'AX', 'eq. guinea': 'GQ',
  'faeroe is.': 'FO', 'n. cyprus': 'CY', "côte d'ivoire": 'CI', 'dem. rep. congo': 'CD', 'congo': 'CG', 'macao': 'MO',
  'central african rep.': 'CF', 'cabo verde': 'CV', 'bosnia and herz.': 'BA', 'indian ocean ter.': 'CX',
  'heard i. and mcdonald is.': 'HM', 'norfolk island': 'NF', 'ashmore and cartier is.': 'AU', 'antigua and barb.': 'AG',
  'siachen glacier': 'IN', 'sint maarten': 'SX', 'vatican': 'VA', 'micronesia': 'FM', 'timor-leste': 'TL', 'palestine': 'PS',
  'north korea': 'KP', 'laos': 'LA', 'syria': 'SY', 'brunei': 'BN', 'curaçao': 'CW', 'saint helena': 'SH',
}

// Map a country name (including the world-atlas map names, which are listed as
// aliases in countries.js) to its ISO2, then to a flag emoji. Returns '' if we
// don't have the country in our list (caller falls back to a pin icon).
const iso2ByName = (() => {
  const m = new Map()
  for (const [k, v] of Object.entries(ATLAS_ALIASES)) m.set(k, v)
  for (const c of ALL_COUNTRIES) {
    m.set(c.name.toLowerCase(), c.iso2)
    for (const a of c.aliases || []) m.set(String(a).toLowerCase(), c.iso2)
  }
  return m
})()

// ISO-2 straight to a flag emoji, with no country-name lookup in between.
//
// It lives HERE rather than beside the market components that use it most, and
// that placement is load-bearing. It was exported from PlaceSwitcher, which
// imports `motion`; onboarding needs a flag next to a suggested market and is
// NOT lazily routed, so that one import dragged the whole motion runtime into
// the initial bundle every creator downloads. A pure function belongs in a pure
// module.
export function flagFromIso(iso) {
  if (!iso || iso.length !== 2) return ''
  return iso.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65))
}

export function flagForCountry(name) {
  if (!name) return ''
  const iso = iso2ByName.get(String(name).trim().toLowerCase())
  if (!iso) return ''
  return iso.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65))
}
