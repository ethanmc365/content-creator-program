import { normalize } from './countries'
import { isoFor, countryRow, countryKey, sameCountry } from './countryKey'
import { PINPOINT_COUNTRIES } from './pinpoint'
import { flagForCountry, flagFromIso } from './flags'
import { COUNTRY_DATA, COUNTRY_LANGUAGES, formatArea, formatPopulation, languageList } from './countryData'
import { FACT_BANK } from './countryFactBank'
import { clockIn, timezoneFor } from './localTime'

// What we can say about a country WITHOUT a network call.
//
// Every map in this app is drawn from the world-atlas TopoJSON, so a tap gives
// us a map NAME ("United Kingdom", "Czechia") and nothing else. Two datasets we
// already ship can answer "tell me about this place":
//
//   * countries.js  - iso2 (so: a flag), continent, currency + symbol. Written
//     for the geography game, correct because the game is scored on it.
//   * pinpoint.js   - three sets of five clues per country, ordered subtle ->
//     giveaway, i.e. a hand-written list of what a country is known for. The
//     LAST clue of a set is the giveaway (usually the capital or the single
//     most famous thing), so it leads; the rest follow.
//
// Deliberately no API. A popup that has to wait on a third party is a popup
// that is empty for the first 400ms of every tap, and this is a map you tap a
// lot. Everything here is a synchronous lookup over data already in the bundle.
//
// Nothing here is required: a country we have no row for still gets its name,
// and the caller renders the parts that came back.

const cluesByName = (() => {
  const m = new Map()
  for (const c of PINPOINT_COUNTRIES) {
    m.set(normalize(c.name), c)
    for (const a of c.aliases || []) m.set(normalize(a), c)
  }
  return m
})()

// The giveaway clue first, then the subtler ones, de-duplicated across the
// three sets. Reads as "known for: Rome, Colosseum, Pasta…" rather than as a
// puzzle, which is what the same strings were written for.
function knownFor(entry, limit = 6) {
  if (!entry?.sets?.length) return []
  const out = []
  const seen = new Set()
  for (const set of entry.sets) {
    for (const clue of [...set].reverse()) {
      const k = normalize(clue)
      if (!k || seen.has(k)) continue
      seen.add(k)
      out.push(clue)
      if (out.length >= limit) return out
    }
  }
  return out
}

/**
 * Facts for a country, keyed by the name a map click gives us.
 * Always returns an object; the fields we have no data for are null/empty.
 */
export function countryFacts(mapName) {
  const key = normalize(mapName)
  const c = countryRow(key)
  const clues = cluesByName.get(key) || null
  const iso2 = isoFor(key)
  const [capital, population, areaKm2, fact] = COUNTRY_DATA[iso2] || []
  return {
    name: mapName,
    iso2,
    flag: flagForCountry(mapName) || (iso2 ? flagFromIso(iso2) : ''),
    continent: c?.continent || null,
    currency: c?.currency || null,
    symbol: c?.symbol || null,
    capital: capital || null,
    population: population || null,
    populationLabel: formatPopulation(population),
    areaKm2: areaKm2 || null,
    areaLabel: formatArea(areaKm2),
    fact: fact || null,
    languages: iso2 ? (COUNTRY_LANGUAGES[iso2] || null) : null,
    languageLabel: iso2 ? languageList(iso2) : null,
    // Everything the panel's "New fact" button can cycle through.
    facts: buildFacts(iso2, { capital, population, areaKm2, fact, continent: c?.continent, currency: c?.currency }),
    // The geography game's clue lists, kept as a fallback for a country we have
    // no written row for: better a handful of landmarks than an empty card.
    knownFor: knownFor(clues),
  }
}

// A COUNTRY THE READER CAN KEEP ASKING ABOUT.
//
// Written facts first, in the order they were written, because those are the
// good ones and the first tap should get the best answer. Derived facts follow
// and exist so that a country with a two-line entry still has something to say
// on the fifth press instead of starting again.
//
// Every derived line has to survive the same test as a written one: could you
// repeat it to somebody. "The capital is Vienna" fails - it is already in the
// table two rows above. "It is about four times the size of Belgium" passes,
// because it turns a number nobody can picture into one they can.
const SIZE_YARDSTICKS = [
  ['GB', 'the United Kingdom', 242495],
  ['PT', 'Portugal', 92212],
  ['BE', 'Belgium', 30528],
  ['FR', 'France', 551695],
]

function sizeFact(areaKm2, iso2) {
  if (!areaKm2 || areaKm2 < 200) return null
  // Compare against the nearest yardstick that is not the country itself, and
  // only when the ratio is worth saying (a country 1.05x the size of France is
  // just France).
  for (const [code, name, km2] of SIZE_YARDSTICKS) {
    if (code === iso2) continue
    const r = areaKm2 / km2
    if (r >= 1.4 && r <= 40) return `At ${Math.round(areaKm2).toLocaleString('en-GB')} km² it is about ${r < 3 ? r.toFixed(1) : Math.round(r)} times the size of ${name}.`
    if (r <= 0.7 && r >= 0.02) return `At ${Math.round(areaKm2).toLocaleString('en-GB')} km² you could fit about ${r < 0.34 ? Math.round(1 / r) : (1 / r).toFixed(1)} of it inside ${name}.`
  }
  return null
}

function densityFact(population, areaKm2) {
  if (!population || !areaKm2 || areaKm2 < 50) return null
  const d = population / areaKm2
  if (d < 3) return `Fewer than three people live in the average square kilometre, which makes it one of the emptiest places on earth.`
  if (d > 400) return `Around ${Math.round(d).toLocaleString('en-GB')} people share every square kilometre, which is denser than almost anywhere in Europe.`
  return null
}

function clockFact(iso2) {
  const zone = timezoneFor({ country_code: iso2 })
  if (!zone) return null
  // Noon in London, expressed there. A real anchor rather than "+2", which
  // nobody converts in their head correctly on the first go.
  const noonUtcish = new Date(Date.UTC(2026, 0, 15, 12, 0, 0))
  const there = clockIn(zone, noonUtcish)
  if (!there) return null
  if (there === '12:00pm') return 'It keeps the same clock as London through the winter.'
  // "12:00am" is a form nobody says out loud, and it is the one the far side of
  // the date line lands on.
  const said = there === '12:00am' ? 'already tomorrow, just past midnight,' : `${there}`
  return `When it is midday in London in January, it is ${said} here.`
}

function buildFacts(iso2, { capital, population, areaKm2, fact, currency } = {}) {
  const out = []
  const push = (s) => { if (s && !out.includes(s)) out.push(s) }

  if (fact) push(fact)
  for (const f of FACT_BANK[iso2] || []) push(f)

  // Derived, in descending order of how much they are worth reading.
  push(sizeFact(areaKm2, iso2))
  const langs = iso2 ? languageList(iso2) : null
  if (langs) {
    const n = COUNTRY_LANGUAGES[iso2]?.length || 1
    push(n > 1 ? `You will hear ${langs} here.` : `${langs} is what you will hear here.`)
  }
  push(clockFact(iso2))
  push(densityFact(population, areaKm2))
  // Not lowercased: "romanian leu" and "swiss franc" are wrong, and half the
  // currency names in countries.js carry a country in them.
  if (currency) push(`It pays in the ${currency}.`)
  if (capital && population) {
    push(`Roughly ${formatPopulation(population)} people live here, governed from ${capital}.`)
  }
  return out
}

// Re-exported so the many call sites that already ask countryFacts.js for these
// keep working. The implementations moved to countryKey.js so that a map can
// import them WITHOUT the fact bank and the three clue sets coming along.
export { countryKey, sameCountry }
