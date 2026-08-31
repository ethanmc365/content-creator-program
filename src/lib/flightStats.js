import { airport, distanceKm, estimateMinutes, co2Kg } from './airports'
import { airlineByName, aircraftTypeByName } from './airlines'
import { timezoneFor, offsetMinutes } from './localTime'

// EVERY NUMBER ON THE FLIGHT LOG, WORKED OUT IN ONE PLACE.
//
// WHY THIS IS A LIBRARY AND NOT A `useMemo` IN THE PAGE. It started as one, and
// then the page grew a records wall, an airline ranking, a year-on-year
// comparison, a streak and a lifetime time-zone total - at which point the
// component was six hundred lines of arithmetic with some JSX at the bottom,
// and none of the arithmetic could be tested without rendering a page. Pulled
// out here it is pure functions over an array of rows: the page decides what to
// SAY, this decides what is TRUE, and the tests can read the second without
// touching the first.
//
// WHY IT IS ALL COMPUTED IN THE BROWSER. Every figure is a fold over the
// reader's own rows, which is at most a few hundred. The alternative is a round
// trip and a set of RPCs that would have to be kept in step with the front
// end's idea of what a kilometre is. `distance_km` IS stored per row (migration
// 098) so the aggregate versions - the community totals, the leaderboard - can
// be a `sum()` on the server without any of this having to move.

const DAY = 86400000

// A ZONE OFFSET IS EXPENSIVE, AND IT IS ASKED FOR TWICE PER FLIGHT.
//
// `offsetMinutes` builds two Dates through `toLocaleString` on every call, so a
// three-hundred-flight log would run it six hundred times to add up one number.
// The answer only changes with the zone and the month (that is what summer time
// is), so it is cached on exactly that.
const offsetCache = new Map()
function offsetFor(zone, dateStr) {
  if (!zone) return null
  const key = `${zone}|${dateStr.slice(0, 7)}`
  if (offsetCache.has(key)) return offsetCache.get(key)
  const v = offsetMinutes(zone, new Date(`${dateStr}T12:00:00Z`))
  offsetCache.set(key, v)
  return v
}

/** How many hours the clock moves on this flight, or null if we cannot say. */
export function clockShift(from, to, dateStr) {
  if (!from?.country || !to?.country) return null
  const zFrom = timezoneFor({ country_code: from.country, city_lng: from.lng })
  const zTo = timezoneFor({ country_code: to.country, city_lng: to.lng })
  if (!zFrom || !zTo) return null
  const a = offsetFor(zFrom, dateStr)
  const b = offsetFor(zTo, dateStr)
  if (a == null || b == null) return null
  return Math.round((b - a) / 60)
}

/** Hours and minutes, said the way a person says them. */
export function humanHours(minutes) {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h < 48) return `${h}h ${m}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** The row, with everything that follows from its two airport codes attached.
 *
 * AN AIRPORT WE CANNOT RESOLVE MUST NOT DELETE THE FLIGHT. This used to end
 * `.filter((r) => r.from && r.to)`, which silently dropped any row whose IATA
 * code is not in lib/airports - out of the distance, out of the hours, out of
 * everything. The stored `distance_km` is the row's own answer and needs no
 * table, so a row with an unknown code still counts towards every figure
 * measured in kilometres; `placeable` is what marks the ones that cannot go on
 * a map.
 */
export function decorate(rows) {
  return (rows ?? []).map((r) => {
    const from = airport(r.from_iata)
    const to = airport(r.to_iata)
    const dist = Number(r.distance_km) || (from && to ? distanceKm(from, to) : 0)
    return {
      ...r,
      from: from || { iata: r.from_iata, city: r.from_iata, country: null },
      to: to || { iata: r.to_iata, city: r.to_iata, country: null },
      placeable: !!(from && to),
      dist,
      mins: estimateMinutes(dist),
      shift: from && to ? clockShift(from, to, r.flown_on) : null,
    }
  })
}

/** Totals over any slice of the log. Used for the whole log and for one year. */
export function totals(list) {
  const airports = new Set()
  const countries = new Set()
  const airlines = new Set()
  const aircraft = new Set()
  let distance = 0
  let minutes = 0
  let carbon = 0
  let zones = 0
  let zoneKnown = 0
  for (const f of list) {
    distance += f.dist
    minutes += f.mins
    carbon += co2Kg(f.dist)
    for (const a of [f.from, f.to]) {
      airports.add(a.iata)
      if (a.country) countries.add(a.country)
    }
    if (f.airline?.trim()) airlines.add(f.airline.trim().toLowerCase())
    if (f.aircraft?.trim()) aircraft.add(f.aircraft.trim().toLowerCase())
    if (f.shift != null) { zones += Math.abs(f.shift); zoneKnown += 1 }
  }
  return {
    flights: list.length,
    distance,
    minutes,
    co2: carbon,
    airports: airports.size,
    countries: countries.size,
    countrySet: countries,
    airlines: airlines.size,
    aircraft: aircraft.size,
    // TIME ZONES CROSSED, LIFETIME. Not distinct zones VISITED - that is a much
    // smaller and much less interesting number, and it is not what anybody
    // means by it. It is how many hours of clock change you have flown through,
    // added up, which is the thing that actually costs you something.
    zonesCrossed: zones,
    // How many flights that total could be worked out for. Where a country has
    // several zones and the airport does not say which (see lib/localTime) the
    // honest answer is nothing, so the page can say what the figure is over.
    zoneFlights: zoneKnown,
  }
}

/** Airlines ranked by how much you actually fly them.
 *
 * RANKED BY FLIGHTS, NOT BY DISTANCE. Loyalty is a habit, and the airline you
 * have taken thirty times to Madrid is the one you are loyal to even though a
 * single Sydney flight on somebody else covers four times the ground. Distance
 * rides along because it is the thing that decides the tier.
 */
export function airlineLoyalty(list) {
  const by = new Map()
  for (const f of list) {
    const name = f.airline?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    const cur = by.get(key) || { name, flights: 0, distance: 0, last: '', routes: new Set(), aircraft: new Set() }
    cur.flights += 1
    cur.distance += f.dist
    if (f.flown_on > cur.last) cur.last = f.flown_on
    cur.routes.add([f.from.iata, f.to.iata].sort().join('-'))
    if (f.aircraft?.trim()) cur.aircraft.add(f.aircraft.trim())
    by.set(key, cur)
  }
  return [...by.values()]
    // The flight row stores the airline's NAME (that is what the chips write),
    // so the code has to be looked back up - the loyalty list is where the tail
    // mark is drawn, and a fin needs a code on it. An airline typed by hand
    // that matches nothing in the table keeps its row and gets the neutral mark.
    .map((a) => ({
      ...a,
      iata: airlineByName(a.name)?.iata ?? '',
      routes: a.routes.size,
      aircraft: a.aircraft.size,
    }))
    .sort((a, b) => b.flights - a.flights || b.distance - a.distance)
}

/** Every year you have flown, newest first, with its own totals. */
export function byYear(list) {
  const years = new Map()
  for (const f of list) {
    const y = f.flown_on.slice(0, 4)
    if (!years.has(y)) years.set(y, [])
    years.get(y).push(f)
  }
  return [...years.entries()]
    .map(([year, rows]) => ({ year, rows, ...totals(rows) }))
    .sort((a, b) => b.year.localeCompare(a.year))
}

/** Every month with a flight in it, oldest first, as `YYYY-MM`. */
function flownMonths(list) {
  return [...new Set(list.map((f) => f.flown_on.slice(0, 7)))].sort()
}

const monthIndex = (ym) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1

/** A TRAVEL STREAK IS MONTHS IN A ROW WITH A FLIGHT IN THEM.
 *
 * WHY MONTHS AND NOT DAYS OR WEEKS. A daily streak is a game mechanic; nobody
 * flies daily and a streak that resets on Tuesday because you were at home is a
 * streak that punishes having a life. A month is the unit people already think
 * about their travel in ("I was away every month last year"), it is long enough
 * that keeping one is a real statement, and it is short enough that losing one
 * means something.
 *
 * THE CURRENT MONTH DOES NOT BREAK IT. A streak is only broken by a month that
 * has finished with nothing in it - it is the 3rd and you have not flown yet is
 * not a broken streak, it is a Tuesday. So the run is counted back from the
 * current month if you have flown in it, and from LAST month if you have not.
 */
export function travelStreak(list, todayStr) {
  const months = flownMonths(list)
  if (months.length === 0) return { current: 0, best: 0, since: null, lastMonth: null }

  let best = 1
  let run = 1
  for (let i = 1; i < months.length; i++) {
    run = monthIndex(months[i]) - monthIndex(months[i - 1]) === 1 ? run + 1 : 1
    if (run > best) best = run
  }

  const now = monthIndex(todayStr.slice(0, 7))
  const last = monthIndex(months[months.length - 1])
  let current = 0
  let since = null
  if (last === now || last === now - 1) {
    current = 1
    since = months[months.length - 1]
    for (let i = months.length - 1; i > 0; i--) {
      if (monthIndex(months[i]) - monthIndex(months[i - 1]) !== 1) break
      current += 1
      since = months[i - 1]
    }
  }
  return { current, best, since, lastMonth: months[months.length - 1] }
}

/** THE RECORDS WALL.
 *
 * Every one of these is a superlative the log already knows and nothing was
 * asking it. They are deliberately a mix of the impressive and the daft - the
 * longest flight is a boast and the fastest turnaround is a war story, and a
 * wall with only boasts on it is a CV.
 *
 * Each returns null rather than a zero when there is nothing to say. A records
 * wall with "Shortest flight: 0 km" on it is a page admitting it has no data,
 * and the page can simply not draw a card it has no record for.
 */
export function records(list) {
  if (list.length === 0) return {}
  const byDate = [...list].sort((a, b) => a.flown_on.localeCompare(b.flown_on))

  const longest = list.reduce((b, f) => (!b || f.dist > b.dist ? f : b), null)
  const shortest = list.reduce((b, f) => (!b || (f.dist > 0 && f.dist < b.dist) ? f : b), null)
  const longestTime = list.reduce((b, f) => (!b || f.mins > b.mins ? f : b), null)
  const biggestShift = list.reduce(
    (b, f) => (f.shift != null && (!b || Math.abs(f.shift) > Math.abs(b.shift)) ? f : b), null,
  )

  // THE FASTEST TURNAROUND is the shortest gap between two consecutive flights.
  // The log stores a DATE and not a time, so the honest unit is days and a gap
  // of zero means "both on the same day" - a connection, or a day trip - which
  // is exactly the thing worth boasting about anyway.
  let turnaround = null
  for (let i = 1; i < byDate.length; i++) {
    const gap = Math.round(
      (new Date(`${byDate[i].flown_on}T12:00:00Z`) - new Date(`${byDate[i - 1].flown_on}T12:00:00Z`)) / DAY,
    )
    if (turnaround == null || gap < turnaround.days) {
      turnaround = { days: gap, first: byDate[i - 1], second: byDate[i] }
    }
  }

  // The busiest month, the busiest single day, and the biggest year.
  const months = new Map()
  const days = new Map()
  for (const f of list) {
    const m = f.flown_on.slice(0, 7)
    const cur = months.get(m) || { key: m, flights: 0, distance: 0 }
    cur.flights += 1
    cur.distance += f.dist
    months.set(m, cur)
    days.set(f.flown_on, (days.get(f.flown_on) || 0) + 1)
  }
  const busiestMonth = [...months.values()].sort((a, b) => b.flights - a.flights || b.distance - a.distance)[0] || null
  const busiestDay = [...days.entries()].sort((a, b) => b[1] - a[1])[0] || null

  const years = byYear(list)
  const biggestYear = [...years].sort((a, b) => b.distance - a.distance)[0] || null

  // The two ends of the whole log, which is the one record that is about the
  // log rather than about a flight.
  const first = byDate[0]
  const latest = byDate[byDate.length - 1]

  return {
    longest,
    shortest: shortest && shortest.dist > 0 ? shortest : null,
    longestTime,
    biggestShift,
    turnaround,
    busiestMonth,
    busiestDay: busiestDay && busiestDay[1] > 1 ? { date: busiestDay[0], flights: busiestDay[1] } : null,
    biggestYear: years.length > 1 ? biggestYear : null,
    first,
    latest,
  }
}

/** Everything the page needs, from the rows and today's date.
 *
 * A FLIGHT YOU HAVE NOT TAKEN YET IS NOT PART OF ANY TOTAL.
 *
 * The log now holds upcoming flights as well as flown ones - the same table,
 * the same row, and no `is_upcoming` column, because whether a flight is
 * upcoming is a fact about TODAY and the date already in the row (a boolean
 * saying the same thing is wrong the morning after the flight and stays wrong).
 * See migration 104.
 *
 * That makes exactly one thing important here: every figure on the page is
 * computed over the FLOWN rows only. Distance, hours, countries, records, the
 * streak, the year-by-year bars, the map, the aircraft collection - all of them
 * would otherwise credit somebody with a trip to Tokyo they have not made, and
 * a log that counts intentions is not a log. The upcoming rows come back
 * separately, soonest first, for the one section that is about them.
 */
export function buildFlightStats(rows, todayStr) {
  const all = decorate(rows)
  const list = all.filter((f) => f.flown_on <= todayStr)
  const upcoming = all
    .filter((f) => f.flown_on > todayStr)
    .sort((a, b) => a.flown_on.localeCompare(b.flown_on))
  const t = totals(list)
  const years = byYear(list)

  // The map wants one line per DISTINCT pair, not one per flight: eighty
  // London-Lisbon hops are one arc drawn eighty times otherwise. It carries the
  // flights themselves so tapping a line can say when you flew it.
  const byPair = new Map()
  const airportCount = new Map()
  for (const f of list) {
    for (const a of [f.from, f.to]) airportCount.set(a.iata, (airportCount.get(a.iata) || 0) + 1)
    if (!f.placeable) continue
    const pair = [f.from.iata, f.to.iata].sort().join('-')
    const cur = byPair.get(pair)
    if (cur) { cur.flights.push(f); continue }
    byPair.set(pair, { key: pair, from: f.from, to: f.to, flights: [f] })
  }
  const routes = [...byPair.values()].map((r) => ({
    ...r,
    // Newest first: tapping a line should open with the trip you remember.
    flights: r.flights.slice().sort((a, b) => b.flown_on.localeCompare(a.flown_on)),
  }))

  const topAirport = [...airportCount.entries()].sort((a, b) => b[1] - a[1])[0]
  const topRoute = [...byPair.values()].sort((a, b) => b.flights.length - a.flights.length)[0]

  // AVERAGE TIME TRAVELLING PER YEAR, over the years you have actually flown.
  // Dividing by the calendar span instead would mean a year you did not fly at
  // all drags the average down, which reads as a criticism rather than as a
  // fact - and a log that starts in 2019 with a gap for the obvious reason
  // would say something quite unfair about its owner.
  const activeYears = years.length || 1

  return {
    list,
    upcoming,
    ...t,
    routes,
    years,
    pins: [...airportCount.entries()]
      .map(([iata, weight]) => ({ ...airport(iata), weight }))
      .filter((a) => a.iata),
    topAirport: topAirport
      ? { ...(airport(topAirport[0]) || { iata: topAirport[0], city: topAirport[0] }), n: topAirport[1] }
      : null,
    topRoute: topRoute
      ? { pair: `${topRoute.from.iata} ↔ ${topRoute.to.iata}`, n: topRoute.flights.length, route: topRoute }
      : null,
    loyalty: airlineLoyalty(list),
    records: records(list),
    streak: travelStreak(list, todayStr),
    avgMinutesPerYear: t.minutes / activeYears,
    avgKmPerYear: t.distance / activeYears,
    activeYears,
    aircraftSeen: aircraftSeen(list),
  }
}

/** WHICH TYPES YOU HAVE ACTUALLY BEEN ON.
 *
 * Matched back to the fleet table by name, because that is what the form wrote:
 * picking "Airbus A350-900" off the chips stores the name, not the key. A type
 * somebody typed by hand that matches nothing in the table is still counted -
 * it is a real aircraft they were really on - it simply has no silhouette to
 * draw, and the collection page says so rather than dropping it.
 */
export function aircraftSeen(list) {
  const wanted = new Map()
  for (const f of list) {
    const name = f.aircraft?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    const cur = wanted.get(key) || { name, flights: 0, distance: 0, last: '', airlines: new Set() }
    cur.flights += 1
    // TAKES DECORATED ROWS OR RAW ONES.
    // THE BUG THIS FIXES: the collection page reads a handful of columns
    // straight out of the table and hands them here without going through
    // `decorate`, so `f.dist` was undefined and every card on it said
    // "NaN km". This function needs nothing else from the decoration, so
    // rather than making the caller do work it does not need, it accepts the
    // stored column as well.
    cur.distance += Number(f.dist ?? f.distance_km) || 0
    if (f.flown_on > cur.last) cur.last = f.flown_on
    if (f.airline?.trim()) cur.airlines.add(f.airline.trim())
    wanted.set(key, cur)
  }
  return [...wanted.values()]
    .map((a) => ({ ...a, airlines: [...a.airlines], type: aircraftTypeByName(a.name) }))
    .sort((a, b) => b.flights - a.flights || a.name.localeCompare(b.name))
}

/**
 * ONE TRIP PER ROW, NOT ONE FLIGHT.
 *
 * A return is stored as a second `flights` row pointing at the first through
 * `return_of`, which is right for the data and wrong for the log: a week in
 * Madrid showed up as two entries, the second of them DUB-less, photo-less and
 * captioned "Return" - Ethan: "return trips should be one entry, not two, the
 * second has no photo and looks broken."
 *
 * So the list is grouped before it is drawn. An outbound with a return becomes
 * one trip carrying both legs, the summed distance and time, and whichever leg
 * actually has the photograph. A one-way stays a one-leg trip, and a return
 * whose outbound has been deleted is a one-leg trip too rather than vanishing.
 *
 * Pure, and exported for the tests: the pairing is the kind of thing that looks
 * obviously right and silently drops a row.
 *
 * @param list decorated flights, newest-first order preserved
 * @returns [{ id, out, back|null, legs, dist, mins, photo_url, flown_on }]
 */
export function tripsFromFlights(list) {
  const byId = new Map(list.map((f) => [f.id, f]))
  // Only pair with a return whose outbound is actually in this list. A return
  // pointing at a deleted flight has to stand on its own or it disappears.
  const returnFor = new Map()
  for (const f of list) {
    if (f.return_of && byId.has(f.return_of)) returnFor.set(f.return_of, f)
  }
  const consumed = new Set([...returnFor.values()].map((f) => f.id))

  const trips = []
  for (const f of list) {
    if (consumed.has(f.id)) continue
    const back = returnFor.get(f.id) || null
    trips.push({
      id: f.id,
      out: f,
      back,
      legs: back ? [f, back] : [f],
      dist: (f.dist || 0) + (back?.dist || 0),
      mins: (f.mins || 0) + (back?.mins || 0),
      // Either leg's photograph. The return is the one people forget to add
      // one to, so falling back the other way round would be the common case.
      photo_url: f.photo_url || back?.photo_url || null,
      flown_on: f.flown_on,
    })
  }
  return trips
}
