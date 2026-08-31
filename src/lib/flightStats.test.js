import { describe, it, expect } from 'vitest'
import {
  decorate, totals, airlineLoyalty, byYear, travelStreak, records,
  buildFlightStats, aircraftSeen, humanHours, tripsFromFlights,
} from './flightStats'

// A flight, as the database hands one over. Only the columns the maths reads.
const f = (from, to, on, extra = {}) => ({
  id: `${from}${to}${on}`, from_iata: from, to_iata: to, flown_on: on, ...extra,
})

describe('decorate', () => {
  it('keeps a flight whose airport code is not in the table', () => {
    // THE REGRESSION THIS GUARDS. The old version ended `.filter(r => r.from &&
    // r.to)`, so a row with an unrecognised code vanished from the distance,
    // the hours and every year bar - a flight somebody logged disappearing from
    // their own totals with no explanation.
    const [row] = decorate([f('ZZZ', 'LIS', '2026-03-04', { distance_km: 1234 })])
    expect(row.placeable).toBe(false)
    expect(row.dist).toBe(1234)
    expect(row.from.iata).toBe('ZZZ')
  })

  it('falls back to the great-circle distance when the row has none', () => {
    const [row] = decorate([f('LIS', 'LHR', '2026-03-04')])
    expect(row.dist).toBeGreaterThan(1500)
    expect(row.dist).toBeLessThan(1800)
    expect(row.placeable).toBe(true)
  })

  it('works out the clock change from the two airports', () => {
    const [row] = decorate([f('LIS', 'LHR', '2026-03-04')])
    expect(row.shift).toBe(0) // Lisbon and London keep the same clock
  })
})

describe('totals', () => {
  const list = decorate([
    f('LIS', 'LHR', '2026-03-04', { airline: 'TAP Air Portugal', aircraft: 'Airbus A320' }),
    f('LHR', 'JFK', '2026-04-01', { airline: 'British Airways', aircraft: 'Boeing 777-300ER' }),
    f('JFK', 'LHR', '2026-04-09', { airline: 'british airways' }),
  ])

  it('counts airports and countries as sets, not as rows', () => {
    const t = totals(list)
    expect(t.flights).toBe(3)
    expect(t.airports).toBe(3)
    expect(t.countries).toBe(3)
  })

  it('treats an airline named in two cases as one airline', () => {
    expect(totals(list).airlines).toBe(2)
  })

  it('adds up the hours of clock change rather than counting zones', () => {
    const t = totals(list)
    // London to New York and back is five hours each way at any time of year.
    expect(t.zonesCrossed).toBeGreaterThanOrEqual(8)
    expect(t.zoneFlights).toBe(3)
  })
})

describe('airlineLoyalty', () => {
  it('ranks by how often you fly them, not by how far', () => {
    const list = decorate([
      f('LIS', 'MAD', '2026-01-04', { airline: 'Iberia' }),
      f('MAD', 'LIS', '2026-01-09', { airline: 'Iberia' }),
      f('LIS', 'MAD', '2026-02-04', { airline: 'Iberia' }),
      f('LHR', 'SYD', '2026-03-04', { airline: 'Qantas' }),
    ])
    const out = airlineLoyalty(list)
    expect(out[0].name).toBe('Iberia')
    expect(out[0].flights).toBe(3)
    // One route flown three times is one route.
    expect(out[0].routes).toBe(1)
    // Qantas covers far more ground and still comes second.
    expect(out[1].distance).toBeGreaterThan(out[0].distance)
  })

  it('ignores flights with no airline on them', () => {
    expect(airlineLoyalty(decorate([f('LIS', 'MAD', '2026-01-04')]))).toEqual([])
  })
})

describe('byYear', () => {
  it('groups newest first and totals each year on its own', () => {
    const out = byYear(decorate([
      f('LIS', 'MAD', '2024-01-04'),
      f('LIS', 'MAD', '2026-01-04'),
      f('MAD', 'LIS', '2026-02-04'),
    ]))
    expect(out.map((y) => y.year)).toEqual(['2026', '2024'])
    expect(out[0].flights).toBe(2)
    expect(out[1].flights).toBe(1)
  })
})

describe('travelStreak', () => {
  it('counts consecutive months, not days', () => {
    const list = decorate([
      f('LIS', 'MAD', '2026-01-04'),
      f('LIS', 'MAD', '2026-02-20'),
      f('LIS', 'MAD', '2026-03-01'),
    ])
    const s = travelStreak(list, '2026-03-15')
    expect(s.current).toBe(3)
    expect(s.best).toBe(3)
    expect(s.since).toBe('2026-01')
  })

  it('does not break the streak just because this month has no flight yet', () => {
    // The 3rd of April and nothing logged yet is not a broken streak, it is a
    // Tuesday. Last month still counts.
    const list = decorate([f('LIS', 'MAD', '2026-02-04'), f('LIS', 'MAD', '2026-03-04')])
    expect(travelStreak(list, '2026-04-03').current).toBe(2)
  })

  it('does break once a whole month has gone by with nothing in it', () => {
    const list = decorate([f('LIS', 'MAD', '2026-01-04')])
    expect(travelStreak(list, '2026-04-03').current).toBe(0)
  })

  it('remembers the best run even after it ends', () => {
    const list = decorate([
      f('LIS', 'MAD', '2025-01-04'),
      f('LIS', 'MAD', '2025-02-04'),
      f('LIS', 'MAD', '2025-03-04'),
      f('LIS', 'MAD', '2026-01-04'),
    ])
    const s = travelStreak(list, '2026-06-01')
    expect(s.best).toBe(3)
    expect(s.current).toBe(0)
  })

  it('says nothing at all about an empty log', () => {
    expect(travelStreak([], '2026-06-01')).toEqual({ current: 0, best: 0, since: null, lastMonth: null })
  })
})

describe('records', () => {
  const list = decorate([
    f('LIS', 'LHR', '2026-01-04'),
    f('LHR', 'SYD', '2026-01-05'),
    f('LIS', 'OPO', '2026-05-11'),
    f('LIS', 'OPO', '2026-05-12'),
    f('LIS', 'OPO', '2026-05-13'),
  ])

  it('finds the longest and the shortest', () => {
    const r = records(list)
    expect(r.longest.to.iata).toBe('SYD')
    expect(r.shortest.to.iata).toBe('OPO')
  })

  it('calls two flights on consecutive days a one day turnaround', () => {
    expect(records(list).turnaround.days).toBe(1)
  })

  it('picks the month with the most flights in it', () => {
    expect(records(list).busiestMonth.key).toBe('2026-05')
  })

  it('only names a busiest day when more than one flight was on it', () => {
    expect(records(list).busiestDay).toBeNull()
    const two = decorate([f('LIS', 'MAD', '2026-01-04'), f('MAD', 'BCN', '2026-01-04')])
    expect(records(two).busiestDay.flights).toBe(2)
  })

  it('has nothing to say about an empty log rather than saying zero', () => {
    expect(records([])).toEqual({})
  })
})

describe('aircraftSeen', () => {
  it('matches a type back to the fleet table by name', () => {
    const out = aircraftSeen(decorate([
      f('LIS', 'LHR', '2026-01-04', { aircraft: 'Airbus A320', airline: 'TAP Air Portugal' }),
      f('LHR', 'LIS', '2026-01-09', { aircraft: 'airbus a320', airline: 'TAP Air Portugal' }),
    ]))
    expect(out).toHaveLength(1)
    expect(out[0].flights).toBe(2)
    expect(out[0].type.key).toBe('a320')
    expect(out[0].airlines).toEqual(['TAP Air Portugal'])
  })

  it('adds up distance from an undecorated row', () => {
    // THE REGRESSION THIS GUARDS. The collection page reads six columns out of
    // the table and never calls `decorate`, so `f.dist` was undefined and every
    // card on that page read "NaN km".
    const out = aircraftSeen([
      { aircraft: 'Airbus A320', flown_on: '2026-01-04', distance_km: 1585 },
      { aircraft: 'Airbus A320', flown_on: '2026-01-09', distance_km: 1585 },
    ])
    expect(out[0].distance).toBe(3170)
  })

  it('keeps a type nobody has a drawing for', () => {
    const out = aircraftSeen(decorate([f('LIS', 'LHR', '2026-01-04', { aircraft: 'Concorde' })]))
    expect(out[0].type).toBeNull()
    expect(out[0].name).toBe('Concorde')
  })
})

describe('buildFlightStats', () => {
  it('draws one route per pair of airports however often it was flown', () => {
    const s = buildFlightStats([
      f('LIS', 'MAD', '2026-01-04'),
      f('MAD', 'LIS', '2026-01-09'),
      f('LIS', 'MAD', '2026-02-04'),
    ], '2026-03-01')
    expect(s.routes).toHaveLength(1)
    expect(s.routes[0].flights).toHaveLength(3)
    expect(s.topRoute.n).toBe(3)
  })

  it('averages over the years actually flown, not the calendar span', () => {
    // Two years in the log with a gap between them averages over TWO, not four.
    // Dividing by the span would read as a criticism of the years off.
    const s = buildFlightStats([
      f('LIS', 'MAD', '2023-01-04'),
      f('LIS', 'MAD', '2026-01-04'),
    ], '2026-03-01')
    expect(s.activeYears).toBe(2)
    expect(s.avgKmPerYear).toBeCloseTo(s.distance / 2, 5)
  })

  it('survives an empty log', () => {
    const s = buildFlightStats([], '2026-03-01')
    expect(s.flights).toBe(0)
    expect(s.routes).toEqual([])
    expect(s.streak.best).toBe(0)
  })
})

describe('humanHours', () => {
  it('switches to days once hours stop meaning anything', () => {
    expect(humanHours(90)).toBe('1h 30m')
    expect(humanHours(60 * 50)).toBe('2d 2h')
  })
})

// ---------------------------------------------------------------- upcoming
//
// A LOG THAT COUNTS INTENTIONS IS NOT A LOG. The log holds flights that have
// not happened yet (see migration 104 for why there is no `is_upcoming`
// column), so the one thing that must never regress is that a future row is
// invisible to every total, record and average on the page.
describe('buildFlightStats and flights that have not happened yet', () => {
  const flown = {
    id: 'a', from_iata: 'LIS', to_iata: 'LHR', flown_on: '2026-01-10', distance_km: 1600,
  }
  const later = {
    id: 'b', from_iata: 'LHR', to_iata: 'NRT', flown_on: '2027-03-04', distance_km: 9500,
  }

  it('leaves an upcoming flight out of every total', () => {
    const s = buildFlightStats([flown, later], '2026-08-16')
    expect(s.flights).toBe(1)
    expect(Math.round(s.distance)).toBe(1600)
    expect(s.list).toHaveLength(1)
  })

  it('returns the upcoming ones separately, soonest first', () => {
    const sooner = { ...later, id: 'c', flown_on: '2026-09-01' }
    const s = buildFlightStats([flown, later, sooner], '2026-08-16')
    expect(s.upcoming.map((f) => f.id)).toEqual(['c', 'b'])
  })

  it('keeps an upcoming flight off the map and out of the records', () => {
    const s = buildFlightStats([flown, later], '2026-08-16')
    expect(s.routes).toHaveLength(1)
    // The Tokyo leg is by far the longest; it must not be the record.
    expect(s.records.longest.id).toBe('a')
  })

  it('says nothing is coming up when nothing is', () => {
    expect(buildFlightStats([flown], '2026-08-16').upcoming).toEqual([])
  })
})

// ONE TRIP PER ROW. A return is a second `flights` row pointing at the first,
// which is right for the data and wrong for the log: a week away showed up as
// two entries, the second photo-less and captioned "Return".
describe('tripsFromFlights', () => {
  const f = (id, over = {}) => ({
    id, flown_on: '2026-06-01', dist: 1000, mins: 120, photo_url: null, return_of: null, ...over,
  })

  it('pairs a return with its outbound and sums the legs', () => {
    const trips = tripsFromFlights([
      f('out', { dist: 1500, mins: 150, photo_url: 'a.jpg' }),
      f('back', { return_of: 'out', dist: 1500, mins: 155, flown_on: '2026-06-08' }),
    ])
    expect(trips).toHaveLength(1)
    expect(trips[0].legs).toHaveLength(2)
    expect(trips[0].dist).toBe(3000)
    expect(trips[0].mins).toBe(305)
    expect(trips[0].photo_url).toBe('a.jpg')
  })

  it('takes the photo off whichever leg has one', () => {
    const trips = tripsFromFlights([
      f('out'),
      f('back', { return_of: 'out', photo_url: 'b.jpg' }),
    ])
    expect(trips[0].photo_url).toBe('b.jpg')
  })

  it('leaves a one-way alone', () => {
    const trips = tripsFromFlights([f('solo')])
    expect(trips).toHaveLength(1)
    expect(trips[0].back).toBeNull()
    expect(trips[0].legs).toHaveLength(1)
  })

  // The row that would otherwise disappear: a return whose outbound has been
  // deleted still points at an id, and it has to stand on its own.
  it('keeps an orphaned return', () => {
    const trips = tripsFromFlights([f('back', { return_of: 'gone-away' })])
    expect(trips).toHaveLength(1)
    expect(trips[0].out.id).toBe('back')
  })

  it('never drops or duplicates a flight', () => {
    const list = [
      f('a'), f('a-back', { return_of: 'a' }),
      f('b'),
      f('c'), f('c-back', { return_of: 'c' }),
      f('d-back', { return_of: 'missing' }),
    ]
    const trips = tripsFromFlights(list)
    const ids = trips.flatMap((t) => t.legs.map((l) => l.id)).sort()
    expect(ids).toEqual(list.map((x) => x.id).sort())
  })
})
