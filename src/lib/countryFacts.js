import { COUNTRIES, normalize } from './countries'
import { PINPOINT_COUNTRIES } from './pinpoint'
import { flagForCountry, flagFromIso } from './flags'
import { COUNTRY_DATA, formatArea, formatPopulation } from './countryData'

// EVERY COUNTRY ON THE MAP GETS ITS FLAG.
//
// countries.js was written for the geography game, so it covers the places a
// quiz asks about - about a third of what the world-atlas TopoJSON actually
// draws. Tapping Sudan, Chad or Guernsey therefore produced a panel headed by a
// grey globe, which on a feature whose brief was "the country name and the
// flag" is the feature not working.
//
// So: the map's own 241 names, mapped to ISO 3166-1 alpha-2, used only as a
// fallback when countries.js has no row. Keyed by the EXACT strings the atlas
// uses ("S. Sudan", "Bosnia and Herz.", "Côte d'Ivoire"), because those are the
// strings a click hands us.
//
// Deliberately absent: Kosovo, Somaliland, N. Cyprus, Siachen Glacier and the
// unnamed Australian territories. They have no flag emoji (or no settled code),
// and a tofu box is worse than the globe we fall back to.
const ATLAS_ISO2 = {
  'Zimbabwe': 'ZW', 'Zambia': 'ZM', 'Yemen': 'YE', 'Vietnam': 'VN', 'Venezuela': 'VE',
  'Vatican': 'VA', 'Vanuatu': 'VU', 'Uzbekistan': 'UZ', 'Uruguay': 'UY', 'Micronesia': 'FM',
  'Marshall Is.': 'MH', 'N. Mariana Is.': 'MP', 'U.S. Virgin Is.': 'VI', 'Guam': 'GU',
  'American Samoa': 'AS', 'Puerto Rico': 'PR', 'United States of America': 'US',
  'S. Geo. and the Is.': 'GS', 'Br. Indian Ocean Ter.': 'IO', 'Saint Helena': 'SH',
  'Pitcairn Is.': 'PN', 'Anguilla': 'AI', 'Falkland Is.': 'FK', 'Cayman Is.': 'KY',
  'Bermuda': 'BM', 'British Virgin Is.': 'VG', 'Turks and Caicos Is.': 'TC', 'Montserrat': 'MS',
  'Jersey': 'JE', 'Guernsey': 'GG', 'Isle of Man': 'IM', 'United Kingdom': 'GB',
  'United Arab Emirates': 'AE', 'Ukraine': 'UA', 'Uganda': 'UG', 'Turkmenistan': 'TM',
  'Turkey': 'TR', 'Tunisia': 'TN', 'Trinidad and Tobago': 'TT', 'Tonga': 'TO', 'Togo': 'TG',
  'Timor-Leste': 'TL', 'Thailand': 'TH', 'Tanzania': 'TZ', 'Tajikistan': 'TJ', 'Taiwan': 'TW',
  'Syria': 'SY', 'Switzerland': 'CH', 'Sweden': 'SE', 'eSwatini': 'SZ', 'Suriname': 'SR',
  'S. Sudan': 'SS', 'Sudan': 'SD', 'Sri Lanka': 'LK', 'Spain': 'ES', 'South Korea': 'KR',
  'South Africa': 'ZA', 'Somalia': 'SO', 'Solomon Is.': 'SB', 'Slovakia': 'SK', 'Slovenia': 'SI',
  'Singapore': 'SG', 'Sierra Leone': 'SL', 'Seychelles': 'SC', 'Serbia': 'RS', 'Senegal': 'SN',
  'Saudi Arabia': 'SA', 'São Tomé and Principe': 'ST', 'San Marino': 'SM', 'Samoa': 'WS',
  'St. Vin. and Gren.': 'VC', 'Saint Lucia': 'LC', 'St. Kitts and Nevis': 'KN', 'Rwanda': 'RW',
  'Russia': 'RU', 'Romania': 'RO', 'Qatar': 'QA', 'Portugal': 'PT', 'Poland': 'PL',
  'Philippines': 'PH', 'Peru': 'PE', 'Paraguay': 'PY', 'Papua New Guinea': 'PG', 'Panama': 'PA',
  'Palau': 'PW', 'Pakistan': 'PK', 'Oman': 'OM', 'Norway': 'NO', 'North Korea': 'KP',
  'Nigeria': 'NG', 'Niger': 'NE', 'Nicaragua': 'NI', 'New Zealand': 'NZ', 'Niue': 'NU',
  'Cook Is.': 'CK', 'Netherlands': 'NL', 'Aruba': 'AW', 'Curaçao': 'CW', 'Nepal': 'NP',
  'Nauru': 'NR', 'Namibia': 'NA', 'Mozambique': 'MZ', 'Morocco': 'MA', 'W. Sahara': 'EH',
  'Montenegro': 'ME', 'Mongolia': 'MN', 'Moldova': 'MD', 'Monaco': 'MC', 'Mexico': 'MX',
  'Mauritius': 'MU', 'Mauritania': 'MR', 'Malta': 'MT', 'Mali': 'ML', 'Maldives': 'MV',
  'Malaysia': 'MY', 'Malawi': 'MW', 'Madagascar': 'MG', 'Macedonia': 'MK', 'Luxembourg': 'LU',
  'Lithuania': 'LT', 'Liechtenstein': 'LI', 'Libya': 'LY', 'Liberia': 'LR', 'Lesotho': 'LS',
  'Lebanon': 'LB', 'Latvia': 'LV', 'Laos': 'LA', 'Kyrgyzstan': 'KG', 'Kuwait': 'KW',
  'Kiribati': 'KI', 'Kenya': 'KE', 'Kazakhstan': 'KZ', 'Jordan': 'JO', 'Japan': 'JP',
  'Jamaica': 'JM', 'Italy': 'IT', 'Israel': 'IL', 'Palestine': 'PS', 'Ireland': 'IE',
  'Iraq': 'IQ', 'Iran': 'IR', 'Indonesia': 'ID', 'India': 'IN', 'Iceland': 'IS',
  'Hungary': 'HU', 'Honduras': 'HN', 'Haiti': 'HT', 'Guyana': 'GY', 'Guinea-Bissau': 'GW',
  'Guinea': 'GN', 'Guatemala': 'GT', 'Grenada': 'GD', 'Greece': 'GR', 'Ghana': 'GH',
  'Germany': 'DE', 'Georgia': 'GE', 'Gambia': 'GM', 'Gabon': 'GA', 'France': 'FR',
  'St. Pierre and Miquelon': 'PM', 'Wallis and Futuna Is.': 'WF', 'St-Martin': 'MF',
  'St-Barthélemy': 'BL', 'Fr. Polynesia': 'PF', 'New Caledonia': 'NC',
  'Fr. S. Antarctic Lands': 'TF', 'Åland': 'AX', 'Finland': 'FI', 'Fiji': 'FJ',
  'Ethiopia': 'ET', 'Estonia': 'EE', 'Eritrea': 'ER', 'Eq. Guinea': 'GQ', 'El Salvador': 'SV',
  'Egypt': 'EG', 'Ecuador': 'EC', 'Dominican Rep.': 'DO', 'Dominica': 'DM', 'Djibouti': 'DJ',
  'Greenland': 'GL', 'Faeroe Is.': 'FO', 'Denmark': 'DK', 'Czechia': 'CZ', 'Cyprus': 'CY',
  'Cuba': 'CU', 'Croatia': 'HR', "Côte d'Ivoire": 'CI', 'Costa Rica': 'CR',
  'Dem. Rep. Congo': 'CD', 'Congo': 'CG', 'Comoros': 'KM', 'Colombia': 'CO', 'China': 'CN',
  'Macao': 'MO', 'Hong Kong': 'HK', 'Chile': 'CL', 'Chad': 'TD', 'Central African Rep.': 'CF',
  'Cabo Verde': 'CV', 'Canada': 'CA', 'Cameroon': 'CM', 'Cambodia': 'KH', 'Myanmar': 'MM',
  'Burundi': 'BI', 'Burkina Faso': 'BF', 'Bulgaria': 'BG', 'Brunei': 'BN', 'Brazil': 'BR',
  'Botswana': 'BW', 'Bosnia and Herz.': 'BA', 'Bolivia': 'BO', 'Bhutan': 'BT', 'Benin': 'BJ',
  'Belize': 'BZ', 'Belgium': 'BE', 'Belarus': 'BY', 'Barbados': 'BB', 'Bangladesh': 'BD',
  'Bahrain': 'BH', 'Bahamas': 'BS', 'Azerbaijan': 'AZ', 'Austria': 'AT', 'Australia': 'AU',
  'Heard I. and McDonald Is.': 'HM', 'Norfolk Island': 'NF', 'Armenia': 'AM',
  'Argentina': 'AR', 'Antigua and Barb.': 'AG', 'Angola': 'AO', 'Andorra': 'AD',
  'Algeria': 'DZ', 'Albania': 'AL', 'Afghanistan': 'AF', 'Antarctica': 'AQ',
  'Sint Maarten': 'SX',
}
// WHAT PEOPLE ACTUALLY TYPE, which is not what a map calls a place.
//
// A creator writes "England" or "Scotland" in their profile; the map says
// "United Kingdom". They write "USA", "Holland", "UAE". None of those are in
// countries.js, because that file was written for a quiz where the answer is
// the country's own name. This is the bridge, and it lives HERE rather than in
// a component so the map's tinting, the country panel's "lives here" list and
// the "been there" match all agree - there were two of these tables and they
// had already started to differ.
const EXTRA_ALIASES = {
  england: 'GB', scotland: 'GB', wales: 'GB', northernireland: 'GB',
  greatbritain: 'GB', britain: 'GB', uk: 'GB',
  usa: 'US', us: 'US', unitedstates: 'US', america: 'US',
  holland: 'NL', uae: 'AE', southkorea: 'KR', northkorea: 'KP',
  czechrepublic: 'CZ', ivorycoast: 'CI', burma: 'MM', swaziland: 'SZ',
  macedonia: 'MK', northmacedonia: 'MK', capeverde: 'CV', eastimor: 'TL',
  vaticancity: 'VA', hollandnetherlands: 'NL',
}

const atlasByNorm = (() => {
  const m = new Map()
  for (const [name, iso] of Object.entries(ATLAS_ISO2)) m.set(normalize(name), iso)
  for (const [alias, iso] of Object.entries(EXTRA_ALIASES)) m.set(normalize(alias), iso)
  return m
})()

/** ISO-2 for anything anybody might have typed or the map might have said. */
function isoFor(key) {
  return byName.get(key)?.iso2 || atlasByNorm.get(key) || null
}

/**
 * A stable key for a country name, whoever wrote it.
 *
 * ISO-2 where we know it, the normalised name otherwise - so "USA", "United
 * States" and "United States of America" all land in the same bucket, and a
 * country we have never heard of still gets a consistent (if name-shaped) key
 * rather than being dropped. Used to join a creator's typed trip country to the
 * map's own centroid table.
 */
export function countryKey(name) {
  const k = normalize(name)
  return isoFor(k) || k
}

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

const byName = (() => {
  const m = new Map()
  for (const c of COUNTRIES) {
    m.set(normalize(c.name), c)
    for (const a of c.aliases || []) m.set(normalize(a), c)
  }
  return m
})()

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
  const c = byName.get(key) || null
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
    // The geography game's clue lists, kept as a fallback for a country we have
    // no written row for: better a handful of landmarks than an empty card.
    knownFor: knownFor(clues),
  }
}

/**
 * Does a creator's free-typed country ("England", "USA") mean this map name?
 * Uses the same alias table the geography game is scored on.
 */
export function sameCountry(typed, mapName) {
  if (!typed || !mapName) return false
  const ka = normalize(typed), kb = normalize(mapName)
  if (ka === kb) return true
  const a = isoFor(ka), b = isoFor(kb)
  return !!a && !!b && a === b
}
