import { COUNTRIES } from './countries'

// Map a country name (including the world-atlas map names, which are listed as
// aliases in countries.js) to its ISO2, then to a flag emoji. Returns '' if we
// don't have the country in our list (caller falls back to a pin icon).
const iso2ByName = (() => {
  const m = new Map()
  for (const c of COUNTRIES) {
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
