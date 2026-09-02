import { useEffect, useState } from 'react'
import { COUNTRIES, countryMatches } from './countries'
import { supabase } from './supabase'
import { useCommunity } from '../context/CommunityContext'
import { t } from './i18n'

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

// WHICH MARKET A CREATOR BELONGS TO, DECIDED RATHER THAN ASKED.
//
// Every open market has `join_policy = 'country'` and a list of ISO-2 codes,
// and those lists do not overlap: GB and IE are UK & Ireland, ES is Spain, PT
// Portugal, DE Germany, RO Romania, and SE/NO/FI/DK are the Nordics. So for any
// creator there is exactly ONE answer or NONE, and `join_market()` in the
// database enforces precisely that rule before it will let anybody in.
//
// Which means the old onboarding step asking a creator to pick their market was
// a question with one possible answer, three screens after we already knew it.
// This resolves it instead, and both the flow and the Testing Centre's resolver
// call this same function, so what the demo says is what a creator gets.
//
// Returns { code, market, others, outcome }:
//   outcome 'assigned'  one market covers them
//   outcome 'choice'    more than one does (impossible today, handled anyway:
//                       overlapping country lists are a thing an admin could
//                       create tomorrow and a silent wrong answer is worse)
//   outcome 'worldwide' no market covers their country yet, which is fine
//   outcome 'unknown'   we could not turn what they typed into a country
export function resolveMarket(countryCode, markets = []) {
  const code = (countryCode || '').trim().toUpperCase() || null
  if (!code) return { code: null, market: null, others: [], outcome: 'unknown' }
  const hits = markets.filter(
    (m) => m.is_active && !m.retired_at && (m.country_codes || []).includes(code),
  )
  if (hits.length === 0) return { code, market: null, others: [], outcome: 'worldwide' }
  if (hits.length === 1) return { code, market: hits[0], others: [], outcome: 'assigned' }
  return { code, market: hits[0], others: hits.slice(1), outcome: 'choice' }
}

/** The same answer starting from whatever free text somebody typed. */
export function resolveMarketForCountryName(name, markets = []) {
  return resolveMarket(isoForCountryName(name), markets)
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
    .select('id, slug, name, kind, is_active, retired_at, country_codes, currency, timezone, tagline')
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

// A MARKET'S NAME, IN THE READER'S LANGUAGE (2 Sep 2026).
//
// Ethan: "the worldwide tab - UK, Ireland, Spain, Portugal, Germany - it's
// still in English. They should have the Spanish names for the countries as
// well, obviously."
//
// This is the ONE exception to "nothing a person wrote is ever translated" (see
// the note at the top of lib/i18n), and it is worth stating why it is not a
// hole in that rule. A market's name is not user content: there are seven of
// them, we chose all seven, they are the names of countries, and a Spanish
// creator being shown a place called "UK & Ireland" in a Spanish interface is
// the product half-translated rather than the product respecting somebody's
// words. A creator's name, a challenge title or a message body is content, and
// none of those go anywhere near this.
//
// A name with no entry in the dictionary renders unchanged, so opening a new
// market needs no code at all - and a market manager can add the translation
// themselves from /admin/languages the day it opens.
export function marketName(name) {
  return name ? t(name) : name
}
