import { useEffect, useState } from 'react'
import { COUNTRIES, countryMatches } from './countries'
import { supabase } from './supabase'
import { useCommunity } from '../context/CommunityContext'

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

// ---------------------------------------------------------------------------

// THE LIST OF MARKETS, FOR PAGES THAT ARE NOT BEHIND THE PREVIEW FLAG.
//
// `useCommunity().chapters` is the obvious source and it is empty most of the
// time: CommunityContext is deliberately inert unless the network preview flag
// AND admin both hold, because it exists to power the new shell and must issue
// zero queries for the 45 creators on the live app.
//
// AdminEvents was already reading `chapters` from it. On the live site, with
// the flag off, that is an empty array - so the "Who sees this" picker offered
// exactly one option ("everyone") and the market scoping it was built for could
// never be used. It looked like a working control.
//
// So: prefer the context when it has something (no second round trip for
// anybody in preview) and fall back to one small query otherwise. Cached in a
// module promise like `loadMyScopes` - the answer cannot change inside a
// session, and three controls asking at once should be one request.
let cache = null

export function loadMarkets() {
  if (cache) return cache
  cache = supabase
    .from('communities')
    .select('id, slug, name, kind, is_active, retired_at')
    .eq('kind', 'chapter')
    .then(({ data, error }) => {
      if (error || !data) return []
      // Retired markets keep their history but must not be offered as a
      // destination for something new.
      return data
        .filter((c) => c.is_active && !c.retired_at)
        .sort((a, b) => a.name.localeCompare(b.name))
    })
  return cache
}

export function clearMarketCache() { cache = null }

export function useMarkets() {
  const { chapters } = useCommunity()
  const [rows, setRows] = useState(() => chapters ?? [])

  useEffect(() => {
    if (chapters?.length) { setRows(chapters); return undefined }
    let alive = true
    loadMarkets().then((m) => { if (alive) setRows(m) })
    return () => { alive = false }
  }, [chapters])

  return rows
}
