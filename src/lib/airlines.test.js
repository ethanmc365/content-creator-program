import { describe, it, expect } from 'vitest'
import { airport, distanceKm } from './airports'
import { AIRLINES, AIRCRAFT, routeAirlines, aircraftFor, anyAircraftFor, airlineByName } from './airlines'

// The route suggester is a heuristic, so the tests assert the PROPERTIES that
// make it trustworthy rather than an exact list: never suggest a flight the
// aircraft cannot make, always find the obvious carrier, and stay stable.

const between = (a, b) => distanceKm(airport(a), airport(b))
const names = (a, b) => routeAirlines(airport(a), airport(b), between(a, b)).map((r) => r.airline.name)

describe('the tables themselves', () => {
  it('every airline flies aircraft that exist', () => {
    for (const a of AIRLINES) {
      expect(a.fleet.length, `${a.name} has no known aircraft`).toBeGreaterThan(0)
      for (const f of a.fleet) expect(AIRCRAFT[f.key]).toBeDefined()
    }
  })

  it('has no duplicate airline codes', () => {
    const seen = new Set()
    for (const a of AIRLINES) {
      expect(seen.has(a.iata), `${a.iata} twice`).toBe(false)
      seen.add(a.iata)
    }
  })

  it('gives every aircraft a range, a cruise speed and a cabin size', () => {
    for (const [key, f] of Object.entries(AIRCRAFT)) {
      expect(f.range, key).toBeGreaterThan(500)
      expect(f.cruise, key).toBeGreaterThan(300)
      // TEN, NOT THIRTY. The floor used to be thirty seats, which was fine when
      // the table only held aircraft an airline would put on a scheduled route
      // between two cities. The collection needs the ones that actually get a
      // travel creator to an island - a Twin Otter is nineteen seats and a
      // Caravan is twelve, and both are real aircraft real people have really
      // been on. What the floor is guarding against is a typo, and a
      // single-figure cabin would still be one.
      expect(f.seats, key).toBeGreaterThan(10)
    }
  })
})

describe('routeAirlines', () => {
  it('finds the carriers that really do fly Dublin to Oslo', () => {
    const found = names('DUB', 'OSL')
    // Ryanair and Norwegian are the two that actually operate it, and both are
    // based at one end - so a heuristic built on bases has to find them.
    expect(found).toContain('Ryanair')
    expect(found).toContain('Norwegian')
    expect(found).toContain('Aer Lingus')
  })

  it('puts a carrier based at BOTH ends first', () => {
    const ranked = routeAirlines(airport('LIS'), airport('OPO'), between('LIS', 'OPO'))
    expect(ranked[0].airline.name).toBe('TAP Air Portugal')
    expect(ranked[0].score).toBeGreaterThanOrEqual(3)
  })

  it('never suggests an airline whose aircraft cannot reach', () => {
    const far = between('LHR', 'SYD')
    for (const { airline } of routeAirlines(airport('LHR'), airport('SYD'), far)) {
      expect(airline.maxRange, `${airline.name} cannot fly ${Math.round(far)}km`).toBeGreaterThanOrEqual(far)
    }
    // Specifically: the all-737 and all-A320 low-cost carriers must be absent.
    expect(names('LHR', 'SYD')).not.toContain('Ryanair')
    expect(names('LHR', 'SYD')).not.toContain('easyJet')
  })

  it('keeps a regional carrier on its own continent', () => {
    expect(names('STN', 'BCN')).toContain('Ryanair')
    expect(names('JFK', 'LAX')).not.toContain('Ryanair')
  })

  it('keeps a domestic carrier inside its own country', () => {
    expect(names('LPA', 'TFN')).toContain('Binter Canarias')
    expect(names('LPA', 'LIS')).not.toContain('Binter Canarias')
  })

  it('finds a long-haul answer for a transatlantic route', () => {
    const found = names('LHR', 'JFK')
    expect(found).toContain('British Airways')
    expect(found).toContain('American Airlines')
    expect(found.length).toBeGreaterThan(2)
  })

  it('is stable: the same route gives the same order twice', () => {
    expect(names('DUB', 'OSL')).toEqual(names('DUB', 'OSL'))
  })

  it('returns nothing rather than guessing when an airport is missing', () => {
    expect(routeAirlines(null, airport('DUB'), 500)).toEqual([])
    expect(routeAirlines(airport('DUB'), undefined, 500)).toEqual([])
  })
})

describe('aircraftFor', () => {
  it('offers the smallest aircraft that can do the job first', () => {
    const fr = airlineByName('Ryanair')
    const list = aircraftFor(fr, between('DUB', 'OSL'))
    expect(list.length).toBeGreaterThan(0)
    for (let i = 1; i < list.length; i++) expect(list[i].range).toBeGreaterThanOrEqual(list[i - 1].range)
  })

  it('never offers an aircraft that cannot reach', () => {
    const ba = airlineByName('British Airways')
    const far = between('LHR', 'SYD')
    for (const f of aircraftFor(ba, far)) expect(f.range).toBeGreaterThanOrEqual(far)
  })

  it('offers nothing for an airline that cannot make the distance at all', () => {
    expect(aircraftFor(airlineByName('Ryanair'), between('LHR', 'SYD'))).toEqual([])
  })

  it('is empty rather than throwing with no airline', () => {
    expect(aircraftFor(null, 1000)).toEqual([])
  })
})

describe('anyAircraftFor', () => {
  it('narrows as the distance grows', () => {
    const short = anyAircraftFor(500).length
    const long = anyAircraftFor(12000).length
    expect(short).toBeGreaterThan(long)
    expect(long).toBeGreaterThan(0)
  })

  it('drops the turboprops off a medium-haul route', () => {
    const keys = anyAircraftFor(3000).map((f) => f.key)
    expect(keys).not.toContain('atr72')
    expect(keys).not.toContain('q400')
  })
})
