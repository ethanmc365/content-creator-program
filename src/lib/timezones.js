// The zones a market can run on.
//
// NOT the full IANA list. There are around 400 of those and a market picker
// offering all of them is a worse control than one offering the twenty this
// programme could plausibly use - every extra row is another thing to scroll
// past to reach Madrid. The list grows when a market opens somewhere it does
// not cover; it is not trying to be complete.
//
// Ordered west to east so the list reads like a map rather than an alphabet,
// which is how somebody picking a market's clock actually thinks about it.
export const COMMON_ZONES = [
  { value: 'America/Los_Angeles', label: 'Los Angeles' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'America/Sao_Paulo', label: 'São Paulo' },
  { value: 'Atlantic/Reykjavik', label: 'Reykjavík' },
  { value: 'Europe/Lisbon', label: 'Lisbon' },
  { value: 'Europe/Dublin', label: 'Dublin' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Madrid', label: 'Madrid' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Rome', label: 'Rome' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam' },
  { value: 'Europe/Copenhagen', label: 'Copenhagen' },
  { value: 'Europe/Oslo', label: 'Oslo' },
  { value: 'Europe/Stockholm', label: 'Stockholm' },
  { value: 'Europe/Warsaw', label: 'Warsaw' },
  { value: 'Europe/Helsinki', label: 'Helsinki' },
  { value: 'Europe/Bucharest', label: 'Bucharest' },
  { value: 'Europe/Athens', label: 'Athens' },
  { value: 'Europe/Istanbul', label: 'Istanbul' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Bangkok', label: 'Bangkok' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Pacific/Auckland', label: 'Auckland' },
  { value: 'UTC', label: 'UTC' },
]

// The zone a country most likely runs on, so opening a market fills the clock
// in rather than asking. Only the countries a market could open in today; an
// unknown country falls back to whatever the network default is, which is a
// question the admin can still answer for themselves.
const BY_COUNTRY = {
  GB: 'Europe/London', IE: 'Europe/Dublin', ES: 'Europe/Madrid',
  PT: 'Europe/Lisbon', DE: 'Europe/Berlin', RO: 'Europe/Bucharest',
  SE: 'Europe/Stockholm', NO: 'Europe/Oslo', FI: 'Europe/Helsinki',
  DK: 'Europe/Copenhagen', FR: 'Europe/Paris', IT: 'Europe/Rome',
  NL: 'Europe/Amsterdam', PL: 'Europe/Warsaw', GR: 'Europe/Athens',
  TR: 'Europe/Istanbul', IS: 'Atlantic/Reykjavik',
  US: 'America/New_York', BR: 'America/Sao_Paulo',
  AE: 'Asia/Dubai', TH: 'Asia/Bangkok', SG: 'Asia/Singapore',
  JP: 'Asia/Tokyo', AU: 'Australia/Sydney', NZ: 'Pacific/Auckland',
}

/**
 * The clock a market covering these countries should start on.
 * The FIRST country listed wins: a market spanning several zones (the Nordics)
 * has to pick one, and the one it was defined by is the least surprising.
 */
export function zoneForCountries(codes = []) {
  for (const raw of codes) {
    const hit = BY_COUNTRY[String(raw || '').toUpperCase()]
    if (hit) return hit
  }
  return null
}

/** The same currency question, and there are only two answers for now. */
export const CURRENCIES = [
  { value: 'EUR', label: 'Euro (€)' },
  { value: 'GBP', label: 'Pound (£)' },
]

const CURRENCY_BY_COUNTRY = {
  GB: 'GBP',
  IE: 'EUR', ES: 'EUR', PT: 'EUR', DE: 'EUR', FR: 'EUR', IT: 'EUR',
  NL: 'EUR', GR: 'EUR', FI: 'EUR',
}

/** Euro unless the market is clearly a sterling one. */
export function currencyForCountries(codes = []) {
  for (const raw of codes) {
    const hit = CURRENCY_BY_COUNTRY[String(raw || '').toUpperCase()]
    if (hit) return hit
  }
  return 'EUR'
}
