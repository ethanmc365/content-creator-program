// NAMING A COUNTRY, AND NOTHING ELSE.
//
// This is the half of countryFacts.js that every map in the app actually
// needs: given whatever somebody typed, or whatever string the atlas handed
// us, which country is that? It is a couple of small lookup tables and two
// functions.
//
// IT LIVES IN ITS OWN FILE BECAUSE OF WHAT IT USED TO DRAG IN. `sameCountry`
// and `countryKey` sat in countryFacts.js next to the fact panel, and
// countryFacts.js imports the whole fact bank, all three clue sets of the
// geography game, the population/area tables and the timezone helpers. So
// CreatorMap, WorldMap and FlightMap - which want to compare two names and
// nothing more - were each pulling 229KB of quiz data into the first load.
// A stress test caught it on the critical path of the HOME page, which has no
// map on it at all.
//
// countryFacts.js re-exports both functions, so nothing that already imported
// them from there has to change.

import { COUNTRIES, normalize } from './countries'

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

const byName = (() => {
  const m = new Map()
  for (const c of COUNTRIES) {
    m.set(normalize(c.name), c)
    for (const a of c.aliases || []) m.set(normalize(a), c)
  }
  return m
})()

/** The countries.js row for a normalised name, or null. */
export function countryRow(key) {
  return byName.get(key) || null
}

/** ISO-2 for anything anybody might have typed or the map might have said. */
export function isoFor(key) {
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
