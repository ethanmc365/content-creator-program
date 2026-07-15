// Country data for the geography game.
//   name      - what we show the player and accept when typing
//   iso2      - ISO 3166-1 alpha-2, used to render the flag emoji
//   continent - used for the per-continent game modes
//   aliases   - extra accepted spellings AND the world-atlas map name(s) so
//               the "find on map" mode can match a clicked country reliably
//   currency  - the country's currency (display name) for the currencies mode
//   symbol    - the currency's symbol, shown big on the question card
//
// Flags are emoji (free, built in). Map matching is tolerant (normalised).
// Currencies use precise names ("Indian rupee", not "rupee") so the game can
// guarantee the five wrong choices never share the right answer's currency.
export const CONTINENTS = ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania']

export const COUNTRIES = [
  // ---- Europe ----
  { name: 'Ireland', iso2: 'IE', continent: 'Europe', currency: 'Euro', symbol: '€' },
  { name: 'United Kingdom', iso2: 'GB', continent: 'Europe', aliases: ['uk', 'great britain', 'britain'], currency: 'Pound sterling', symbol: '£' },
  { name: 'France', iso2: 'FR', continent: 'Europe', currency: 'Euro', symbol: '€' },
  { name: 'Spain', iso2: 'ES', continent: 'Europe', currency: 'Euro', symbol: '€' },
  { name: 'Portugal', iso2: 'PT', continent: 'Europe', currency: 'Euro', symbol: '€' },
  { name: 'Germany', iso2: 'DE', continent: 'Europe', currency: 'Euro', symbol: '€' },
  { name: 'Italy', iso2: 'IT', continent: 'Europe', currency: 'Euro', symbol: '€' },
  { name: 'Netherlands', iso2: 'NL', continent: 'Europe', aliases: ['holland'], currency: 'Euro', symbol: '€' },
  { name: 'Belgium', iso2: 'BE', continent: 'Europe', currency: 'Euro', symbol: '€' },
  { name: 'Switzerland', iso2: 'CH', continent: 'Europe', currency: 'Swiss franc', symbol: 'CHF' },
  { name: 'Austria', iso2: 'AT', continent: 'Europe', currency: 'Euro', symbol: '€' },
  { name: 'Poland', iso2: 'PL', continent: 'Europe', currency: 'Złoty', symbol: 'zł' },
  { name: 'Greece', iso2: 'GR', continent: 'Europe', currency: 'Euro', symbol: '€' },
  { name: 'Sweden', iso2: 'SE', continent: 'Europe', currency: 'Swedish krona', symbol: 'kr' },
  { name: 'Norway', iso2: 'NO', continent: 'Europe', currency: 'Norwegian krone', symbol: 'kr' },
  { name: 'Denmark', iso2: 'DK', continent: 'Europe', currency: 'Danish krone', symbol: 'kr' },
  { name: 'Finland', iso2: 'FI', continent: 'Europe', currency: 'Euro', symbol: '€' },
  { name: 'Iceland', iso2: 'IS', continent: 'Europe', currency: 'Icelandic króna', symbol: 'kr' },
  { name: 'Croatia', iso2: 'HR', continent: 'Europe', currency: 'Euro', symbol: '€' },
  { name: 'Czechia', iso2: 'CZ', continent: 'Europe', aliases: ['czech republic'], currency: 'Czech koruna', symbol: 'Kč' },
  { name: 'Hungary', iso2: 'HU', continent: 'Europe', currency: 'Forint', symbol: 'Ft' },
  { name: 'Romania', iso2: 'RO', continent: 'Europe', currency: 'Romanian leu', symbol: 'lei' },
  { name: 'Ukraine', iso2: 'UA', continent: 'Europe', currency: 'Hryvnia', symbol: '₴' },
  { name: 'Russia', iso2: 'RU', continent: 'Europe', aliases: ['russian federation'], currency: 'Russian ruble', symbol: '₽' },
  { name: 'Turkey', iso2: 'TR', continent: 'Europe', aliases: ['türkiye', 'turkiye'], currency: 'Turkish lira', symbol: '₺' },

  // ---- Asia ----
  { name: 'China', iso2: 'CN', continent: 'Asia', currency: 'Yuan (renminbi)', symbol: '¥' },
  { name: 'Japan', iso2: 'JP', continent: 'Asia', currency: 'Yen', symbol: '¥' },
  { name: 'South Korea', iso2: 'KR', continent: 'Asia', aliases: ['korea', 'republic of korea'], currency: 'Won', symbol: '₩' },
  { name: 'India', iso2: 'IN', continent: 'Asia', currency: 'Indian rupee', symbol: '₹' },
  { name: 'Thailand', iso2: 'TH', continent: 'Asia', currency: 'Baht', symbol: '฿' },
  { name: 'Vietnam', iso2: 'VN', continent: 'Asia', currency: 'Đồng', symbol: '₫' },
  { name: 'Indonesia', iso2: 'ID', continent: 'Asia', currency: 'Rupiah', symbol: 'Rp' },
  { name: 'Malaysia', iso2: 'MY', continent: 'Asia', currency: 'Ringgit', symbol: 'RM' },
  { name: 'Philippines', iso2: 'PH', continent: 'Asia', currency: 'Philippine peso', symbol: '₱' },
  { name: 'Singapore', iso2: 'SG', continent: 'Asia', currency: 'Singapore dollar', symbol: 'S$' },
  { name: 'Pakistan', iso2: 'PK', continent: 'Asia', currency: 'Pakistani rupee', symbol: '₨' },
  { name: 'Saudi Arabia', iso2: 'SA', continent: 'Asia', currency: 'Saudi riyal', symbol: '﷼' },
  { name: 'United Arab Emirates', iso2: 'AE', continent: 'Asia', aliases: ['uae'], currency: 'UAE dirham', symbol: 'د.إ' },
  { name: 'Israel', iso2: 'IL', continent: 'Asia', currency: 'Shekel', symbol: '₪' },
  { name: 'Kazakhstan', iso2: 'KZ', continent: 'Asia', currency: 'Tenge', symbol: '₸' },
  { name: 'Sri Lanka', iso2: 'LK', continent: 'Asia', currency: 'Sri Lankan rupee', symbol: '₨' },
  { name: 'Nepal', iso2: 'NP', continent: 'Asia', currency: 'Nepalese rupee', symbol: '₨' },

  // ---- Africa ----
  { name: 'Egypt', iso2: 'EG', continent: 'Africa', currency: 'Egyptian pound', symbol: 'E£' },
  { name: 'Morocco', iso2: 'MA', continent: 'Africa', currency: 'Moroccan dirham', symbol: 'DH' },
  { name: 'South Africa', iso2: 'ZA', continent: 'Africa', currency: 'Rand', symbol: 'R' },
  { name: 'Nigeria', iso2: 'NG', continent: 'Africa', currency: 'Naira', symbol: '₦' },
  { name: 'Kenya', iso2: 'KE', continent: 'Africa', currency: 'Kenyan shilling', symbol: 'KSh' },
  { name: 'Ghana', iso2: 'GH', continent: 'Africa', currency: 'Cedi', symbol: '₵' },
  { name: 'Ethiopia', iso2: 'ET', continent: 'Africa', currency: 'Birr', symbol: 'Br' },
  { name: 'Tanzania', iso2: 'TZ', continent: 'Africa', aliases: ['united republic of tanzania'], currency: 'Tanzanian shilling', symbol: 'TSh' },
  { name: 'Algeria', iso2: 'DZ', continent: 'Africa', currency: 'Algerian dinar', symbol: 'DA' },
  { name: 'Tunisia', iso2: 'TN', continent: 'Africa', currency: 'Tunisian dinar', symbol: 'DT' },
  { name: 'Senegal', iso2: 'SN', continent: 'Africa', currency: 'West African CFA franc', symbol: 'CFA' },
  { name: 'Uganda', iso2: 'UG', continent: 'Africa', currency: 'Ugandan shilling', symbol: 'USh' },
  { name: 'Zimbabwe', iso2: 'ZW', continent: 'Africa' }, // multi-currency economy, left out of the currencies mode
  { name: 'Namibia', iso2: 'NA', continent: 'Africa', currency: 'Namibian dollar', symbol: 'N$' },
  { name: 'Botswana', iso2: 'BW', continent: 'Africa', currency: 'Pula', symbol: 'P' },
  { name: 'Mozambique', iso2: 'MZ', continent: 'Africa', currency: 'Metical', symbol: 'MT' },
  { name: 'Madagascar', iso2: 'MG', continent: 'Africa', currency: 'Ariary', symbol: 'Ar' },

  // ---- North America ----
  { name: 'United States', iso2: 'US', continent: 'North America', aliases: ['usa', 'united states of america', 'america'], currency: 'US dollar', symbol: '$' },
  { name: 'Canada', iso2: 'CA', continent: 'North America', currency: 'Canadian dollar', symbol: 'C$' },
  { name: 'Mexico', iso2: 'MX', continent: 'North America', currency: 'Mexican peso', symbol: '$' },
  { name: 'Cuba', iso2: 'CU', continent: 'North America', currency: 'Cuban peso', symbol: '$' },
  { name: 'Guatemala', iso2: 'GT', continent: 'North America', currency: 'Quetzal', symbol: 'Q' },
  { name: 'Panama', iso2: 'PA', continent: 'North America', currency: 'Balboa', symbol: 'B/.' },
  { name: 'Costa Rica', iso2: 'CR', continent: 'North America', currency: 'Colón', symbol: '₡' },
  { name: 'Dominican Republic', iso2: 'DO', continent: 'North America', aliases: ['dominican rep.'], currency: 'Dominican peso', symbol: '$' },
  { name: 'Honduras', iso2: 'HN', continent: 'North America', currency: 'Lempira', symbol: 'L' },
  { name: 'Jamaica', iso2: 'JM', continent: 'North America', currency: 'Jamaican dollar', symbol: 'J$' },

  // ---- South America ----
  { name: 'Brazil', iso2: 'BR', continent: 'South America', currency: 'Real', symbol: 'R$' },
  { name: 'Argentina', iso2: 'AR', continent: 'South America', currency: 'Argentine peso', symbol: '$' },
  { name: 'Chile', iso2: 'CL', continent: 'South America', currency: 'Chilean peso', symbol: '$' },
  { name: 'Peru', iso2: 'PE', continent: 'South America', currency: 'Sol', symbol: 'S/' },
  { name: 'Colombia', iso2: 'CO', continent: 'South America', currency: 'Colombian peso', symbol: '$' },
  { name: 'Venezuela', iso2: 'VE', continent: 'South America', currency: 'Bolívar', symbol: 'Bs.' },
  // Fun one: Ecuador really does use the US dollar (since 2000).
  { name: 'Ecuador', iso2: 'EC', continent: 'South America', currency: 'US dollar', symbol: '$' },
  { name: 'Bolivia', iso2: 'BO', continent: 'South America', currency: 'Boliviano', symbol: 'Bs' },
  { name: 'Uruguay', iso2: 'UY', continent: 'South America', currency: 'Uruguayan peso', symbol: '$' },
  { name: 'Paraguay', iso2: 'PY', continent: 'South America', currency: 'Guaraní', symbol: '₲' },

  // ---- Oceania ----
  { name: 'Australia', iso2: 'AU', continent: 'Oceania', currency: 'Australian dollar', symbol: 'A$' },
  { name: 'New Zealand', iso2: 'NZ', continent: 'Oceania', currency: 'New Zealand dollar', symbol: 'NZ$' },
  { name: 'Papua New Guinea', iso2: 'PG', continent: 'Oceania', currency: 'Kina', symbol: 'K' },
  { name: 'Fiji', iso2: 'FJ', continent: 'Oceania', currency: 'Fijian dollar', symbol: 'FJ$' },
]

// Major airports for the flight-themed mode: show the IATA code, guess the city.
//   code - IATA code   city - answer (aliases accepted)   region - continent
export const AIRPORTS = [
  { code: 'DUB', city: 'Dublin', region: 'Europe' },
  { code: 'LHR', city: 'London', region: 'Europe', aliases: ['london heathrow'] },
  { code: 'LGW', city: 'London', region: 'Europe', aliases: ['london gatwick'] },
  { code: 'CDG', city: 'Paris', region: 'Europe' },
  { code: 'AMS', city: 'Amsterdam', region: 'Europe' },
  { code: 'MAD', city: 'Madrid', region: 'Europe' },
  { code: 'BCN', city: 'Barcelona', region: 'Europe' },
  { code: 'FCO', city: 'Rome', region: 'Europe' },
  { code: 'LIS', city: 'Lisbon', region: 'Europe' },
  { code: 'FRA', city: 'Frankfurt', region: 'Europe' },
  { code: 'BER', city: 'Berlin', region: 'Europe' },
  { code: 'MUC', city: 'Munich', region: 'Europe' },
  { code: 'ATH', city: 'Athens', region: 'Europe' },
  { code: 'IST', city: 'Istanbul', region: 'Europe' },
  { code: 'CPH', city: 'Copenhagen', region: 'Europe' },
  { code: 'EDI', city: 'Edinburgh', region: 'Europe' },
  { code: 'JFK', city: 'New York', region: 'North America', aliases: ['new york city', 'nyc'] },
  { code: 'LAX', city: 'Los Angeles', region: 'North America' },
  { code: 'MIA', city: 'Miami', region: 'North America' },
  { code: 'SFO', city: 'San Francisco', region: 'North America' },
  { code: 'YYZ', city: 'Toronto', region: 'North America' },
  { code: 'CUN', city: 'Cancun', region: 'North America', aliases: ['cancún'] },
  { code: 'DXB', city: 'Dubai', region: 'Asia' },
  { code: 'SIN', city: 'Singapore', region: 'Asia' },
  { code: 'HND', city: 'Tokyo', region: 'Asia', aliases: ['tokyo haneda'] },
  { code: 'NRT', city: 'Tokyo', region: 'Asia', aliases: ['tokyo narita'] },
  { code: 'BKK', city: 'Bangkok', region: 'Asia' },
  { code: 'HKG', city: 'Hong Kong', region: 'Asia' },
  { code: 'DEL', city: 'Delhi', region: 'Asia', aliases: ['new delhi'] },
  { code: 'DPS', city: 'Bali', region: 'Asia', aliases: ['denpasar'] },
  { code: 'SYD', city: 'Sydney', region: 'Oceania' },
  { code: 'MEL', city: 'Melbourne', region: 'Oceania' },
  { code: 'AKL', city: 'Auckland', region: 'Oceania' },
  { code: 'JNB', city: 'Johannesburg', region: 'Africa' },
  { code: 'CPT', city: 'Cape Town', region: 'Africa' },
  { code: 'CAI', city: 'Cairo', region: 'Africa' },
  { code: 'GRU', city: 'São Paulo', region: 'South America', aliases: ['sao paulo'] },
  { code: 'EZE', city: 'Buenos Aires', region: 'South America' },
  { code: 'BOG', city: 'Bogotá', region: 'South America', aliases: ['bogota'] },
  { code: 'LIM', city: 'Lima', region: 'South America' },
]

export function airportsForRegion(region) {
  return region === 'World' ? AIRPORTS : AIRPORTS.filter((a) => a.region === region)
}

/** Does a typed answer match this airport's city (name or alias)? */
export function airportMatches(airport, candidate) {
  const n = normalize(candidate)
  if (!n) return false
  if (normalize(airport.city) === n) return true
  return (airport.aliases || []).some((a) => normalize(a) === n)
}

/** ISO alpha-2 → flag emoji (🇮🇪). */
export function flagEmoji(iso2) {
  return [...iso2.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('')
}

/** Normalise a name for tolerant matching (lowercase, no accents/punctuation). */
export function normalize(s = '') {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z\s]/g, '') // drop punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

/** Does a typed/clicked name match this country (by name or any alias)? */
export function countryMatches(country, candidate) {
  const n = normalize(candidate)
  if (!n) return false
  if (normalize(country.name) === n) return true
  return (country.aliases || []).some((a) => normalize(a) === n)
}

/** Countries for a given region ('World' or a continent). */
export function countriesForRegion(region) {
  return region === 'World' ? COUNTRIES : COUNTRIES.filter((c) => c.continent === region)
}

/** Countries eligible for the currencies mode in a region. */
export function currencyCountriesForRegion(region) {
  return countriesForRegion(region).filter((c) => c.currency)
}

/**
 * Build one currencies question for a target country: the target plus five
 * countries that do NOT use the target's currency, shuffled. Distractors are
 * drawn from the region first, topped up from the whole world when a continent
 * doesn't have six eligible countries (e.g. Oceania).
 */
export function currencyChoices(target, region) {
  const usable = (list) => list.filter((c) => c.name !== target.name && c.currency !== target.currency)
  const local = shuffle(usable(currencyCountriesForRegion(region)))
  const world = shuffle(usable(COUNTRIES.filter((c) => c.currency && !local.includes(c))))
  const distractors = [...local, ...world].slice(0, 5)
  return shuffle([target, ...distractors])
}

/** Fisher-Yates shuffle (returns a new array). */
export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
