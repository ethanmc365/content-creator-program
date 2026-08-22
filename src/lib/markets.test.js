import { describe, it, expect, vi } from 'vitest'

// The module reaches for the Supabase client at import time for its other
// exports; the two functions under test here are pure and touch neither.
vi.mock('./supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({}) }) }) } }))

import { resolveMarket, isoForCountryName } from './markets'

// The six open markets, shaped exactly as `loadMarkets` returns them.
const MARKETS = [
  { slug: 'uk', name: 'UK & Ireland', country_codes: ['GB', 'IE'], is_active: true, retired_at: null },
  { slug: 'spain', name: 'Spain', country_codes: ['ES'], is_active: true, retired_at: null },
  { slug: 'portugal', name: 'Portugal', country_codes: ['PT'], is_active: true, retired_at: null },
  { slug: 'germany', name: 'Germany', country_codes: ['DE'], is_active: true, retired_at: null },
  { slug: 'romania', name: 'Romania', country_codes: ['RO'], is_active: true, retired_at: null },
  { slug: 'nordics', name: 'Nordics', country_codes: ['SE', 'NO', 'FI', 'DK'], is_active: true, retired_at: null },
]

describe('isoForCountryName', () => {
  it('handles the free text people actually type', () => {
    // This is the whole reason the picker exists. Every one of these was a real
    // shape of answer in the country column before onboarding was rebuilt.
    expect(isoForCountryName('United Kingdom')).toBe('GB')
    expect(isoForCountryName('uk')).toBe('GB')
    expect(isoForCountryName('  Great Britain ')).toBe('GB')
    expect(isoForCountryName('britain')).toBe('GB')
    expect(isoForCountryName('GB')).toBe('GB')
  })

  it('is null for something it cannot place, rather than a guess', () => {
    expect(isoForCountryName('Narnia')).toBeNull()
    expect(isoForCountryName('')).toBeNull()
    expect(isoForCountryName(null)).toBeNull()
  })
})

describe('resolveMarket', () => {
  it('assigns every country the six open markets cover', () => {
    const cases = [
      ['GB', 'uk'], ['IE', 'uk'],
      ['ES', 'spain'], ['PT', 'portugal'], ['DE', 'germany'], ['RO', 'romania'],
      ['SE', 'nordics'], ['NO', 'nordics'], ['FI', 'nordics'], ['DK', 'nordics'],
    ]
    for (const [code, slug] of cases) {
      const r = resolveMarket(code, MARKETS)
      expect(r.outcome).toBe('assigned')
      expect(r.market.slug).toBe(slug)
      expect(r.others).toEqual([])
    }
  })

  it('puts a creator nobody covers in the worldwide community, not in an error', () => {
    // France and the United States are the case the old flow forgot: it offered
    // them a market picker with nothing in it.
    for (const code of ['FR', 'US', 'JP', 'AU']) {
      const r = resolveMarket(code, MARKETS)
      expect(r.outcome).toBe('worldwide')
      expect(r.market).toBeNull()
    }
  })

  it('is unknown, not worldwide, when there is no country at all', () => {
    // These are different states and the flow says different things about them.
    expect(resolveMarket(null, MARKETS).outcome).toBe('unknown')
    expect(resolveMarket('', MARKETS).outcome).toBe('unknown')
  })

  it('normalises the case, because a stored code is not always upper', () => {
    expect(resolveMarket('gb', MARKETS).market.slug).toBe('uk')
    expect(resolveMarket(' pt ', MARKETS).market.slug).toBe('portugal')
  })

  it('never routes anybody into a closed or retired market', () => {
    const closed = [
      { slug: 'france', name: 'France', country_codes: ['FR'], is_active: false, retired_at: null },
      { slug: 'italy', name: 'Italy', country_codes: ['IT'], is_active: true, retired_at: '2026-01-01' },
    ]
    expect(resolveMarket('FR', [...MARKETS, ...closed]).outcome).toBe('worldwide')
    expect(resolveMarket('IT', [...MARKETS, ...closed]).outcome).toBe('worldwide')
  })

  it('reports a choice rather than silently picking one when lists overlap', () => {
    // Impossible today and one admin decision away from being possible, which
    // is exactly when a silent wrong answer would ship.
    const overlapping = [...MARKETS, { slug: 'ireland', name: 'Ireland', country_codes: ['IE'], is_active: true, retired_at: null }]
    const r = resolveMarket('IE', overlapping)
    expect(r.outcome).toBe('choice')
    expect(r.others).toHaveLength(1)
  })

  it('survives a market row with no country list', () => {
    const r = resolveMarket('GB', [{ slug: 'x', name: 'X', is_active: true, retired_at: null }])
    expect(r.outcome).toBe('worldwide')
  })

  it('is worldwide when the markets have not loaded yet', () => {
    // The flow renders before the query lands, and must not claim anything.
    expect(resolveMarket('GB', []).outcome).toBe('worldwide')
  })
})
