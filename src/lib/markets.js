import { COUNTRIES, countryMatches } from './countries'
import { supabase } from './supabase'

// Turning what a creator typed into something the network can route on.
//
// `profiles.country` is free text and always has been ("UK", "united kingdom",
// "England"). `profiles.country_code` is the ISO-2 the market system matches on.
// Migration 070 backfilled the existing 46 rows and then nothing kept it in
// sync, so every creator who signed up after it had a null code and could never
// be suggested a market. This is where the two are joined up, using the same
// country list the rest of the app searches against.
export function isoForCountryName(name) {
  const raw = (name || '').trim()
  if (!raw) return null
  // Already an ISO-2.
  if (/^[A-Za-z]{2}$/.test(raw)) {
    const direct = COUNTRIES.find((c) => c.iso2.toLowerCase() === raw.toLowerCase())
    if (direct) return direct.iso2
  }
  const hit = COUNTRIES.find((c) => countryMatches(c, raw))
  return hit ? hit.iso2 : null
}

// Open markets that cover this country. Returns [] rather than throwing when
// the network tables are unreadable: a creator finishing onboarding must never
// be blocked by a market suggestion failing to load.
export async function suggestMarkets(countryCode) {
  if (!countryCode) return []
  const { data, error } = await supabase
    .from('communities')
    .select('id, slug, name, tagline, country_codes, currency, kind, is_active')
    .eq('kind', 'chapter')
    .eq('is_active', true)
  if (error || !data) return []
  return data.filter((c) => (c.country_codes || []).includes(countryCode))
}
