// Country data for the geography game.
//   name      — what we show the player and accept when typing
//   iso2      — ISO 3166-1 alpha-2, used to render the flag emoji
//   continent — used for the per-continent game modes
//   aliases   — extra accepted spellings AND the world-atlas map name(s) so
//               the "find on map" mode can match a clicked country reliably
//
// Flags are emoji (free, built in). Map matching is tolerant (normalised).
export const CONTINENTS = ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania']

export const COUNTRIES = [
  // ---- Europe ----
  { name: 'Ireland', iso2: 'IE', continent: 'Europe' },
  { name: 'United Kingdom', iso2: 'GB', continent: 'Europe', aliases: ['uk', 'great britain', 'britain'] },
  { name: 'France', iso2: 'FR', continent: 'Europe' },
  { name: 'Spain', iso2: 'ES', continent: 'Europe' },
  { name: 'Portugal', iso2: 'PT', continent: 'Europe' },
  { name: 'Germany', iso2: 'DE', continent: 'Europe' },
  { name: 'Italy', iso2: 'IT', continent: 'Europe' },
  { name: 'Netherlands', iso2: 'NL', continent: 'Europe', aliases: ['holland'] },
  { name: 'Belgium', iso2: 'BE', continent: 'Europe' },
  { name: 'Switzerland', iso2: 'CH', continent: 'Europe' },
  { name: 'Austria', iso2: 'AT', continent: 'Europe' },
  { name: 'Poland', iso2: 'PL', continent: 'Europe' },
  { name: 'Greece', iso2: 'GR', continent: 'Europe' },
  { name: 'Sweden', iso2: 'SE', continent: 'Europe' },
  { name: 'Norway', iso2: 'NO', continent: 'Europe' },
  { name: 'Denmark', iso2: 'DK', continent: 'Europe' },
  { name: 'Finland', iso2: 'FI', continent: 'Europe' },
  { name: 'Iceland', iso2: 'IS', continent: 'Europe' },
  { name: 'Croatia', iso2: 'HR', continent: 'Europe' },
  { name: 'Czechia', iso2: 'CZ', continent: 'Europe', aliases: ['czech republic'] },
  { name: 'Hungary', iso2: 'HU', continent: 'Europe' },
  { name: 'Romania', iso2: 'RO', continent: 'Europe' },
  { name: 'Ukraine', iso2: 'UA', continent: 'Europe' },
  { name: 'Russia', iso2: 'RU', continent: 'Europe', aliases: ['russian federation'] },
  { name: 'Turkey', iso2: 'TR', continent: 'Europe', aliases: ['türkiye', 'turkiye'] },

  // ---- Asia ----
  { name: 'China', iso2: 'CN', continent: 'Asia' },
  { name: 'Japan', iso2: 'JP', continent: 'Asia' },
  { name: 'South Korea', iso2: 'KR', continent: 'Asia', aliases: ['korea', 'republic of korea'] },
  { name: 'India', iso2: 'IN', continent: 'Asia' },
  { name: 'Thailand', iso2: 'TH', continent: 'Asia' },
  { name: 'Vietnam', iso2: 'VN', continent: 'Asia' },
  { name: 'Indonesia', iso2: 'ID', continent: 'Asia' },
  { name: 'Malaysia', iso2: 'MY', continent: 'Asia' },
  { name: 'Philippines', iso2: 'PH', continent: 'Asia' },
  { name: 'Singapore', iso2: 'SG', continent: 'Asia' },
  { name: 'Pakistan', iso2: 'PK', continent: 'Asia' },
  { name: 'Saudi Arabia', iso2: 'SA', continent: 'Asia' },
  { name: 'United Arab Emirates', iso2: 'AE', continent: 'Asia', aliases: ['uae'] },
  { name: 'Israel', iso2: 'IL', continent: 'Asia' },
  { name: 'Kazakhstan', iso2: 'KZ', continent: 'Asia' },
  { name: 'Sri Lanka', iso2: 'LK', continent: 'Asia' },
  { name: 'Nepal', iso2: 'NP', continent: 'Asia' },

  // ---- Africa ----
  { name: 'Egypt', iso2: 'EG', continent: 'Africa' },
  { name: 'Morocco', iso2: 'MA', continent: 'Africa' },
  { name: 'South Africa', iso2: 'ZA', continent: 'Africa' },
  { name: 'Nigeria', iso2: 'NG', continent: 'Africa' },
  { name: 'Kenya', iso2: 'KE', continent: 'Africa' },
  { name: 'Ghana', iso2: 'GH', continent: 'Africa' },
  { name: 'Ethiopia', iso2: 'ET', continent: 'Africa' },
  { name: 'Tanzania', iso2: 'TZ', continent: 'Africa', aliases: ['united republic of tanzania'] },
  { name: 'Algeria', iso2: 'DZ', continent: 'Africa' },
  { name: 'Tunisia', iso2: 'TN', continent: 'Africa' },
  { name: 'Senegal', iso2: 'SN', continent: 'Africa' },
  { name: 'Uganda', iso2: 'UG', continent: 'Africa' },
  { name: 'Zimbabwe', iso2: 'ZW', continent: 'Africa' },
  { name: 'Namibia', iso2: 'NA', continent: 'Africa' },
  { name: 'Botswana', iso2: 'BW', continent: 'Africa' },
  { name: 'Mozambique', iso2: 'MZ', continent: 'Africa' },
  { name: 'Madagascar', iso2: 'MG', continent: 'Africa' },

  // ---- North America ----
  { name: 'United States', iso2: 'US', continent: 'North America', aliases: ['usa', 'united states of america', 'america'] },
  { name: 'Canada', iso2: 'CA', continent: 'North America' },
  { name: 'Mexico', iso2: 'MX', continent: 'North America' },
  { name: 'Cuba', iso2: 'CU', continent: 'North America' },
  { name: 'Guatemala', iso2: 'GT', continent: 'North America' },
  { name: 'Panama', iso2: 'PA', continent: 'North America' },
  { name: 'Costa Rica', iso2: 'CR', continent: 'North America' },
  { name: 'Dominican Republic', iso2: 'DO', continent: 'North America', aliases: ['dominican rep.'] },
  { name: 'Honduras', iso2: 'HN', continent: 'North America' },
  { name: 'Jamaica', iso2: 'JM', continent: 'North America' },

  // ---- South America ----
  { name: 'Brazil', iso2: 'BR', continent: 'South America' },
  { name: 'Argentina', iso2: 'AR', continent: 'South America' },
  { name: 'Chile', iso2: 'CL', continent: 'South America' },
  { name: 'Peru', iso2: 'PE', continent: 'South America' },
  { name: 'Colombia', iso2: 'CO', continent: 'South America' },
  { name: 'Venezuela', iso2: 'VE', continent: 'South America' },
  { name: 'Ecuador', iso2: 'EC', continent: 'South America' },
  { name: 'Bolivia', iso2: 'BO', continent: 'South America' },
  { name: 'Uruguay', iso2: 'UY', continent: 'South America' },
  { name: 'Paraguay', iso2: 'PY', continent: 'South America' },

  // ---- Oceania ----
  { name: 'Australia', iso2: 'AU', continent: 'Oceania' },
  { name: 'New Zealand', iso2: 'NZ', continent: 'Oceania' },
  { name: 'Papua New Guinea', iso2: 'PG', continent: 'Oceania' },
  { name: 'Fiji', iso2: 'FJ', continent: 'Oceania' },
]

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

/** Fisher-Yates shuffle (returns a new array). */
export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
