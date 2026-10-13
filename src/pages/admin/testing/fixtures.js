// SYNTHETIC DATA FOR THE ADMIN TESTING CENTRE.
//
// Every value in this file is invented. Nothing here is read from Supabase and
// nothing built on top of it is ever written back, which is the entire point of
// the Testing Centre: the platform can be demonstrated end to end - an invoice
// raised, approved, rendered and downloaded; an onboarding walked through; a
// challenge closed and its podium published - without a real creator's name,
// bank details or inbox being anywhere near it.
//
// EVERY PERSON HERE IS CALLED "TEST" AND THAT IS THE POINT.
//
// James Test, Emily Test, Sofia Test. Not because it is pretty, but because
// these names appear on a rendered invoice, in a notification, in an email
// preview and on a podium - and somebody watching a demonstration should never
// have to wonder for even a second whether they are looking at a real
// creator's bank details. A plausible name in a sandbox is a liability. The
// towns and countries stay real so the six markets all have somebody in them.

// Dates are stored as OFFSETS IN DAYS, resolved against a clock the lab passes
// in. Two reasons: a fixture written as a hard date rots, and the lint rules
// here ban Date.now() inside render, so a lab captures its own `now` once and
// hands it down. BOOT is the fallback, read once at import - never in a render.
export const BOOT = Date.now()
export const DAY = 86400000

export const at = (days, now = BOOT) => new Date(now + days * DAY)
export const iso = (days, now = BOOT) => at(days, now).toISOString()
export const dateOnly = (days, now = BOOT) => iso(days, now).slice(0, 10)

// ---------------------------------------------------------------- people ----

export const CREATORS = [
  {
    id: 'demo-c1', name: 'James Test', email: 'james.test@example.com',
    city: 'London', country: 'United Kingdom', country_code: 'GB',
    bio: 'London based travel creator chasing cheap flights and good coffee.',
    platform: 'TikTok', followers: 128000, market: 'uk', joinedDaysAgo: -412,
    languages: ['English', 'French'], countries: 34,
  },
  {
    id: 'demo-c2', name: 'Miguel Test', email: 'miguel.test@example.com',
    city: 'Lisbon', country: 'Portugal', country_code: 'PT',
    bio: 'Surf, seafood and the slow way round Portugal.',
    platform: 'Instagram', followers: 74500, market: 'portugal', joinedDaysAgo: -260,
    languages: ['Portuguese', 'English', 'Spanish'], countries: 21,
  },
  {
    id: 'demo-c3', name: 'Sofia Test', email: 'sofia.test@example.com',
    city: 'Barcelona', country: 'Spain', country_code: 'ES',
    bio: 'City guides for people with two days and no plan.',
    platform: 'TikTok', followers: 61200, market: 'spain', joinedDaysAgo: -180,
    languages: ['Spanish', 'Catalan', 'English'], countries: 29,
  },
  {
    id: 'demo-c4', name: 'Lukas Test', email: 'lukas.test@example.com',
    city: 'Berlin', country: 'Germany', country_code: 'DE',
    bio: 'Rail routes across Europe, no flights required.',
    platform: 'YouTube', followers: 42800, market: 'germany', joinedDaysAgo: -96,
    languages: ['German', 'English'], countries: 18,
  },
  {
    id: 'demo-c5', name: 'Emily Test', email: 'emily.test@example.com',
    city: 'Dublin', country: 'Ireland', country_code: 'IE',
    bio: 'Weekend trips from Dublin for under two hundred euro.',
    platform: 'Instagram', followers: 33900, market: 'uk', joinedDaysAgo: -64,
    languages: ['English', 'Irish'], countries: 15,
  },
  {
    id: 'demo-c6', name: 'Ana Test', email: 'ana.test@example.com',
    city: 'Bucharest', country: 'Romania', country_code: 'RO',
    bio: 'Mountains, monasteries and the trains that get you there.',
    platform: 'TikTok', followers: 27400, market: 'romania', joinedDaysAgo: -38,
    languages: ['Romanian', 'English'], countries: 12,
  },
  {
    id: 'demo-c7', name: 'Freja Test', email: 'freja.test@example.com',
    city: 'Copenhagen', country: 'Denmark', country_code: 'DK',
    bio: 'Nordic design, cold water and very long summer evenings.',
    platform: 'Instagram', followers: 19600, market: 'nordics', joinedDaysAgo: -21,
    languages: ['Danish', 'English', 'Swedish'], countries: 11,
  },
  {
    id: 'demo-c8', name: 'Owen Test', email: 'owen.test@example.com',
    city: 'Manchester', country: 'United Kingdom', country_code: 'GB',
    bio: 'Northern city breaks and the food worth the trip.',
    platform: 'TikTok', followers: 8900, market: 'uk', joinedDaysAgo: -4,
    languages: ['English'], countries: 7,
  },
]

export const byId = (id) => CREATORS.find((c) => c.id === id) || CREATORS[0]

export const MARKETS = [
  { slug: 'uk', name: 'UK & Ireland', codes: ['GB', 'IE'], timezone: 'Europe/London', members: 21 },
  { slug: 'spain', name: 'Spain', codes: ['ES'], timezone: 'Europe/Madrid', members: 9 },
  { slug: 'portugal', name: 'Portugal', codes: ['PT'], timezone: 'Europe/Lisbon', members: 7 },
  { slug: 'germany', name: 'Germany', codes: ['DE'], timezone: 'Europe/Berlin', members: 5 },
  { slug: 'romania', name: 'Romania', codes: ['RO'], timezone: 'Europe/Bucharest', members: 4 },
  { slug: 'nordics', name: 'Nordics', codes: ['DK', 'SE', 'NO', 'FI'], timezone: 'Europe/Copenhagen', members: 3 },
]

export const marketName = (slug) => MARKETS.find((m) => m.slug === slug)?.name || 'Worldwide'

// ------------------------------------------------------------ challenges ----

export const CHALLENGE = {
  id: 'demo-ch1',
  title: 'One perfect day in your city',
  brief: 'Film the day you would give a friend who has twenty four hours and no plan. Show us where you eat, what you skip, and the one thing nobody tells them about.',
  status: 'active',
  scoring: 'best_video',
  market: 'uk',
  startsInDays: -12,
  endsInDays: 3,
  winners_count: 3,
  cpm_target: 0.5,
  prize_currency: 'GBP',
  prize_structure: [
    { place: 1, prize: '£250 cash' },
    { place: 2, prize: '£150 cash' },
    { place: 3, prize: '£100 cash' },
  ],
  participation_threshold: 5000,
  participation_prize: '£10 Tryp.com voucher',
}

export const PAYEE_GBP = {
  label: 'Test account, pounds',
  currency: 'GBP',
  name: 'James Test',
  bank: 'Test Bank UK',
  sortCode: '123456',
  accountNumber: '12345678',
  iban: '',
  bic: '',
  address: '14 Sample Street\nLondon\nE1 6AN\nUnited Kingdom',
}

export const PAYEE_EUR = {
  label: 'Test account, euros',
  currency: 'EUR',
  name: 'Miguel Test',
  bank: 'Banco Teste',
  sortCode: '',
  accountNumber: '',
  iban: 'PT50000201231234567890154',
  bic: 'BCOMPTPL',
  address: 'Rua do Exemplo 22\n1100-001 Lisboa\nPortugal',
}

// A payee with nothing filled in, so the lab can show what the invoice
// automation does when a creator has never entered their bank details.
export const PAYEE_EMPTY = {
  label: 'Test account, nothing on file',
  currency: '', name: '', bank: '', sortCode: '', accountNumber: '', iban: '', bic: '', address: '',
}

// ------------------------------------------------------------------ misc ----

/** A stable pseudo-random number for a key, so labs look alive without
 *  Math.random() (which the lint rules ban in render and in some handlers). */
export function jitter(key, spread = 1) {
  let h = 2166136261
  const s = String(key)
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 1000) / 1000 * spread
}
