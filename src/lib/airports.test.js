import { describe, it, expect } from 'vitest'
import { AIRPORTS, airport, searchAirports, distanceKm, estimateMinutes } from './airports'

// The flight log's every number comes out of these three functions, so they get
// the tests. A stats page that is subtly wrong is worse than no stats page:
// nobody checks arithmetic they were shown, they just stop believing it later.

describe('the airport table', () => {
  it('has no duplicate IATA codes', () => {
    const seen = new Set()
    const dupes = []
    for (const a of AIRPORTS) {
      if (seen.has(a.iata)) dupes.push(a.iata)
      seen.add(a.iata)
    }
    expect(dupes).toEqual([])
  })

  it('gives every row a plausible coordinate and a three letter code', () => {
    for (const a of AIRPORTS) {
      expect(a.iata).toMatch(/^[A-Z]{3}$/)
      expect(a.country).toMatch(/^[A-Z]{2}$/)
      expect(Math.abs(a.lat)).toBeLessThanOrEqual(90)
      expect(Math.abs(a.lng)).toBeLessThanOrEqual(180)
      // 0,0 is in the Atlantic and is what an unfilled coordinate looks like.
      expect(Math.abs(a.lat) + Math.abs(a.lng)).toBeGreaterThan(0)
    }
  })

  it('looks an airport up by code, case insensitively', () => {
    expect(airport('lhr').city).toBe('London')
    expect(airport('LHR').iata).toBe('LHR')
    expect(airport('ZZZ')).toBeNull()
    expect(airport('')).toBeNull()
  })
})

describe('searching', () => {
  it('puts the exact code first', () => {
    expect(searchAirports('lis')[0].iata).toBe('LIS')
    expect(searchAirports('bcn')[0].iata).toBe('BCN')
  })

  it('finds an airport by city name', () => {
    const hits = searchAirports('lisbon')
    expect(hits.map((a) => a.iata)).toContain('LIS')
  })

  it('says nothing until there is something to go on', () => {
    expect(searchAirports('l')).toEqual([])
    expect(searchAirports(' ')).toEqual([])
  })
})

describe('distance', () => {
  // Published great-circle distances, to the nearest ten kilometres. The
  // tolerance is the difference between airport-to-airport and city-to-city
  // figures, not slack in the formula.
  const cases = [
    ['LHR', 'JFK', 5555],
    ['LHR', 'CDG', 348],
    ['LIS', 'GRU', 7930],
    ['SYD', 'LHR', 16990],
    ['MAD', 'BCN', 483],
  ]

  it.each(cases)('%s to %s is about %i km', (from, to, expected) => {
    const d = distanceKm(airport(from), airport(to))
    expect(Math.abs(d - expected)).toBeLessThan(expected * 0.02 + 15)
  })

  it('is symmetric and zero for a place to itself', () => {
    const a = airport('LHR')
    const b = airport('DXB')
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 6)
    expect(distanceKm(a, a)).toBeCloseTo(0, 6)
  })

  it('never throws on a missing airport', () => {
    expect(distanceKm(null, airport('LHR'))).toBe(0)
    expect(distanceKm(airport('LHR'), undefined)).toBe(0)
  })
})

describe('estimated block time', () => {
  it('lands near the published schedule on a long haul', () => {
    // LHR-JFK is scheduled at about 8 hours.
    const mins = estimateMinutes(distanceKm(airport('LHR'), airport('JFK')))
    expect(mins).toBeGreaterThan(420)
    expect(mins).toBeLessThan(520)
  })

  it('keeps a short hop above the taxi-and-climb floor', () => {
    // LHR-CDG is scheduled at about 1h15 despite being only 350km.
    const mins = estimateMinutes(distanceKm(airport('LHR'), airport('CDG')))
    expect(mins).toBeGreaterThan(50)
    expect(mins).toBeLessThan(90)
  })

  it('is zero for no distance', () => {
    expect(estimateMinutes(0)).toBe(0)
  })
})
