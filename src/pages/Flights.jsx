import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Badge, EmptyState, Modal, PageHeader, Skeleton, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import Reveal from '../components/network/Reveal'
import { CountUp } from '../components/network/Motion'
import WhenVisible from '../components/WhenVisible'
import FlightMap from '../components/network/FlightMap'
import { confirm, notice } from '../lib/confirm'
import { airport, searchAirports, distanceKm, estimateMinutes, bearing, compass, haul, co2Kg } from '../lib/airports'
import { routeAirlines, aircraftFor, anyAircraftFor, airlineByName, continentOf } from '../lib/airlines'
import { timezoneFor, offsetMinutes } from '../lib/localTime'
import { flagFromIso } from '../lib/flags'
import { cx } from '../lib/utils'

// THE FLIGHT LOG.
//
// The idea is Flighty's and it is a good one: a flight is a thing that happened
// to you, and a list of them is a biography. What makes those apps work is not
// the logging, it is the ARITHMETIC - nobody knows they have flown far enough
// to have gone round the world twice until something tells them, and then they
// tell everyone else. So the log is the input and the numbers are the product.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not track live flights, and it
// does not import from a booking inbox. Both need a paid data feed and a mail
// scope, and neither is the thing being asked for here: this is a record you
// keep, on the way to feeding the travel map on a profile and the collab board.
//
// WHY THE NUMBERS ARE COMPUTED IN THE BROWSER. Every one of them is a fold over
// the reader's own rows, which is at most a few hundred - so the alternative is
// a round trip and a set of RPCs that would have to be kept in step with the
// front end's idea of what a kilometre is. The distance IS stored per row
// (migration 098) precisely so the aggregate versions can be written later
// without touching this page.

const EARTH_CIRCUMFERENCE_KM = 40075
const MOON_KM = 384400

// THE CABIN PICKER IS GONE.
// Ethan asked for it removed, and he is right that it did not belong: it is the
// one field on this form that is neither derivable nor interesting. Nothing on
// the page counted it, no statistic used it, and it made a five-second job into
// a six-field one. The `cabin` COLUMN is left in place and simply unwritten -
// dropping a column to remove a control would throw away whatever anybody has
// already logged, for no gain.

// Why the trip happened. Six options and no more: the value of this field is
// that it can be counted, and a taxonomy nobody can hold in their head is a
// taxonomy that gets filled in inconsistently and then cannot be counted.
// `creator` is the one that justifies the field existing on THIS platform.
const PURPOSES = [
  { key: 'creator', label: 'Creator trip' },
  { key: 'leisure', label: 'Holiday' },
  { key: 'work', label: 'Work' },
  { key: 'family', label: 'Family' },
  { key: 'commute', label: 'Commute' },
  { key: 'other', label: 'Other' },
]
const PURPOSE_LABEL = Object.fromEntries(PURPOSES.map((p) => [p.key, p.label]))

// One shape, declared once. `save` resets to it and the modal's Cancel does
// too, so there is no list of fields to keep in step in three places - which is
// how `seat` would have ended up surviving between two flights.
const BLANK_FORM = {
  from_iata: '', to_iata: '', flown_on: '', airline: '', flight_number: '',
  aircraft: '', note: '', seat: '', purpose: '', rating: 0,
  round_trip: false, return_on: '',
}

const km = (n) => Math.round(n).toLocaleString('en-GB')
const miles = (n) => Math.round(n * 0.621371).toLocaleString('en-GB')

// Hours, said the way a person says them. "127h" is a number you have to
// convert; "5 days 7 hours" is a fact about your life.
function humanHours(minutes) {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h < 48) return `${h}h ${m}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ------------------------------------------------------------- airport field

// A TYPE-AHEAD, NOT A `<select>` OF THREE HUNDRED AIRPORTS.
//
// A native select renders as the OS roller on a phone and cannot be typed into,
// which is the same reason PeoplePicker replaced one on the market pages. This
// is what a boarding pass gives you - a three letter code - with the city
// beside it so you can also get there by typing "Lisbon".
function AirportField({ id, label, value, onChange, autoFocus = false }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const chosen = airport(value)

  const hits = useMemo(() => searchAirports(query), [query])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  if (chosen) {
    return (
      <div>
        <p className="label">{label}</p>
        <button
          type="button"
          onClick={() => { onChange(''); setQuery(''); setOpen(true) }}
          className="flex w-full items-center gap-3 rounded-xl border border-brand/40 bg-brand-tint/30 px-3.5 py-2.5 text-left transition-colors hover:border-brand"
        >
          <span className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold tracking-wider text-brand">
            {chosen.iata}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{chosen.city}</span>
            <span className="block truncate text-xs text-smoke">{chosen.name}</span>
          </span>
          <Icon name="close" className="h-4 w-4 shrink-0 text-smoke" />
        </button>
      </div>
    )
  }

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor={id} className="label">{label}</label>
      <input
        id={id}
        value={query}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Code or city, e.g. LIS or Lisbon"
        className="input w-full"
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto overscroll-contain rounded-card border border-gray-100 bg-white shadow-lift">
          {hits.map((a) => (
            <li key={a.iata}>
              <button
                type="button"
                onClick={() => { onChange(a.iata); setOpen(false); setQuery('') }}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-cloud"
              >
                <span className="w-11 shrink-0 text-xs font-bold tracking-wider text-brand">{a.iata}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.city}</span>
                  <span className="block truncate text-xs text-smoke">{a.name}</span>
                </span>
                <span aria-hidden className="shrink-0 text-sm">{flagFromIso(a.country) || ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim().length >= 2 && hits.length === 0 && (
        <p className="absolute z-30 mt-1 w-full rounded-card border border-gray-100 bg-white px-3.5 py-2.5 text-xs text-smoke shadow-lift">
          No airport matches that. Try the three letter code from your boarding pass.
        </p>
      )}
    </div>
  )
}

// ------------------------------------------------------------- the date field
//
// A TYPED DATE, WITHOUT THE NATIVE CONTROL.
//
// `<input type="date">` is three segments the browser owns. Typing into it
// works, but every segment you land on is painted with the OS selection
// highlight - a blue block that flashes across the field as you type, which is
// what Ethan is describing: "entering the dates by typing is what I want but it
// shouldn't have to show up the blue highlight". You cannot style that. It is
// UA shadow DOM and `::selection` does not reach it.
//
// So this is three ordinary numeric inputs that behave the way the native one
// behaves and nothing more: type two digits and the caret moves on by itself,
// backspace at the start of a box moves back, and paste of a whole date fills
// all three. The rest of the app's `.input` styling wraps the group so it still
// looks like one field.
//
// "dd should change to 00 when I'm typing there": the placeholder is the
// LETTERS when the box is at rest and ZEROS while it has focus. Resting on
// letters says what the box is for; switching to zeros the moment you land on
// it says how many digits it wants, which is the thing you need at exactly the
// moment you are about to type.
function DatePart({ id, label, value, onChange, onOverflow, onBack, width, max, inputRef }) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      id={id}
      ref={inputRef}
      aria-label={label}
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onFocus={(e) => { setFocused(true); e.target.select() }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, max)
        onChange(digits)
        if (digits.length === max) onOverflow?.()
      }}
      onKeyDown={(e) => {
        // Backspace on an empty box steps back to the previous one, which is
        // the one behaviour people expect from a segmented field and the one
        // that is annoying to be without.
        if (e.key === 'Backspace' && !value) { e.preventDefault(); onBack?.() }
      }}
      placeholder={focused ? '0'.repeat(max) : label}
      className={cx(
        'bg-transparent text-center text-sm tabular-nums text-ink outline-none placeholder:text-gray-300',
        width,
      )}
    />
  )
}

function DateField({ id, label, value, onChange, max, hint }) {
  // The three parts are LOCAL state, not derived from `value` on every render.
  // A controlled field that reformats mid-typing is a field you cannot type "1"
  // into, because the moment you do it becomes "01" and the caret jumps.
  const [d, setD] = useState(() => (value ? value.slice(8, 10) : ''))
  const [m, setM] = useState(() => (value ? value.slice(5, 7) : ''))
  const [y, setY] = useState(() => (value ? value.slice(0, 4) : ''))
  const mRef = useRef(null)
  const yRef = useRef(null)
  const dRef = useRef(null)

  // The parent can clear the field (saving resets the form). Only ever pull
  // FROM the parent when it has genuinely gone somewhere this component did not
  // put it, or every keystroke fights the round trip.
  useEffect(() => {
    if (value) return
    if (d || m || y) { setD(''); setM(''); setY('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Push up only when all three are complete and the result is a real date.
  // 31/02 is three complete boxes and not a day, and a form that accepts it
  // and fails on save is worse than one that simply waits.
  useEffect(() => {
    if (d.length === 2 && m.length === 2 && y.length === 4) {
      const iso = `${y}-${m}-${d}`
      const dt = new Date(`${iso}T12:00:00Z`)
      const ok = !Number.isNaN(dt.getTime())
        && dt.getUTCDate() === Number(d) && dt.getUTCMonth() + 1 === Number(m)
      onChange(ok ? iso : '')
    } else {
      onChange('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, m, y])

  const future = value && max && value > max

  return (
    <div>
      <label htmlFor={`${id}-d`} className="label">{label}</label>
      <div
        className={cx(
          'flex w-full items-center gap-0.5 rounded-xl border bg-white px-3.5 py-2.5 transition-colors focus-within:border-brand',
          future ? 'border-red-300' : 'border-gray-200',
        )}
      >
        <DatePart id={`${id}-d`} inputRef={dRef} label="DD" max={2} width="w-7" value={d}
          onChange={setD} onOverflow={() => mRef.current?.focus()} />
        <span className="text-gray-300">/</span>
        <DatePart id={`${id}-m`} inputRef={mRef} label="MM" max={2} width="w-8" value={m}
          onChange={setM} onOverflow={() => yRef.current?.focus()} onBack={() => dRef.current?.focus()} />
        <span className="text-gray-300">/</span>
        <DatePart id={`${id}-y`} inputRef={yRef} label="YYYY" max={4} width="w-12" value={y}
          onChange={setY} onBack={() => mRef.current?.focus()} />
      </div>
      {future
        ? <p className="mt-1 text-[11px] text-red-500">That is in the future. Log it after you fly.</p>
        : hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  )
}

// ------------------------------------------------- what the route already knows
//
// EVERYTHING HERE IS DERIVED FROM TWO AIRPORT CODES AND A DATE. Nothing is
// typed and nothing is fetched. That is the whole redesign of this form: you
// say where you went, and the app works out the rest and shows it to you before
// you save, which is what turns filling in a form into seeing your flight.
//
// Time zones come from lib/localTime, which already answers "what zone is this
// country in" for the profile clocks, with longitude bands for the wide
// countries. Where it cannot answer honestly (a US airport with no town
// context) it returns null and this simply does not draw the arrival line - a
// wrong arrival time would be read as a fact.
function routeFacts(from, to, dateStr) {
  if (!from || !to) return null
  const dist = distanceKm(from, to)
  const mins = estimateMinutes(dist)
  const zFrom = timezoneFor({ country_code: from.country, city_lng: from.lng })
  const zTo = timezoneFor({ country_code: to.country, city_lng: to.lng })
  // Offsets are computed ON THE DATE FLOWN, not today: a Lisbon to Helsinki
  // flight in January crosses two hours and in July it still crosses two, but
  // a route between a country that observes summer time and one that does not
  // changes with the season, and using today's offsets for a flight last
  // November would quietly be wrong.
  const when = dateStr ? new Date(`${dateStr}T12:00:00Z`) : new Date()
  //
  // The clock change is given as a SHIFT rather than an arrival time, because
  // an arrival time needs a departure time and this form deliberately does not
  // ask for one. "Three hours ahead" is the fact somebody wants anyway.
  const shift = zFrom && zTo ? Math.round((offsetMinutes(zTo, when) - offsetMinutes(zFrom, when)) / 60) : null
  const brg = bearing(from, to)
  return {
    dist,
    mins,
    bearing: brg,
    direction: compass(brg),
    haul: haul(dist),
    co2: co2Kg(dist),
    shift,
    international: from.country !== to.country,
    intercontinental: continentOf(from.country) !== continentOf(to.country),
  }
}

// One derived fact in the route panel. A label, the answer, and the caveat -
// the caveat matters because half of these are estimates and a number that does
// not say so gets quoted back as if it were measured.
function RouteFact({ label, value, hint }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-widest text-smoke">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink">{value}</dd>
      {hint && <dd className="text-[10px] text-gray-400">{hint}</dd>}
    </div>
  )
}

// ------------------------------------------------------------------ the page

function StatTile({ label, value, hint, accent = false, count = null }) {
  return (
    <div className={cx(
      'rounded-card p-5 transition-transform duration-200 hover:-translate-y-0.5',
      accent ? 'bg-brand text-white shadow-lift' : 'border border-gray-100 bg-white shadow-card',
    )}>
      <p className={cx('text-2xl font-bold tabular-nums sm:text-3xl', accent && 'text-white')}>
        {count != null ? <CountUp value={count} format={(n) => Math.round(n).toLocaleString('en-GB')} /> : value}
      </p>
      <p className={cx('mt-1 text-xs font-semibold', accent ? 'text-white/85' : 'text-smoke')}>{label}</p>
      {hint && <p className={cx('mt-0.5 text-[11px]', accent ? 'text-white/70' : 'text-gray-400')}>{hint}</p>}
    </div>
  )
}

export default function Flights() {
  const { user } = useAuth()
  const [rows, setRows] = useState(null)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [form, setForm] = useState(BLANK_FORM)
  // "Show me every airline, not just the likely ones" / "every aircraft that
  // could do this". The shortlist is right most of the time and the escape
  // hatch has to be one press away, not a different form.
  const [allAirlines, setAllAirlines] = useState(false)
  const [customAirline, setCustomAirline] = useState(false)
  // `today` in state, not computed in render: this repo's eslint bans clock
  // reads during render and it is right to - see lib/messageActions.
  const [today] = useState(() => ymd(new Date()))

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('flights')
      .select('*')
      .eq('creator_id', user.id)
      .order('flown_on', { ascending: false })
      .limit(1000)
    setRows(data ?? [])
  }, [user.id])

  useEffect(() => { load() }, [load])

  // ONE PASS OVER THE ROWS, EVERY NUMBER ON THE PAGE OUT OF IT.
  //
  // Each of these could be its own `filter().length`, and that is how a stats
  // page ends up walking its own data fifteen times. It is a few hundred rows,
  // so the cost is not the point; the point is that "how many airports" and
  // "which airport most" are the same question asked twice and should be
  // counted once.
  const stats = useMemo(() => {
    // AN AIRPORT WE CANNOT RESOLVE MUST NOT DELETE THE FLIGHT.
    //
    // This used to end `.filter((r) => r.from && r.to)`, which silently dropped
    // any row whose IATA code is not in lib/airports - out of the distance, out
    // of the hours, out of the year bars, out of everything. That is a flight
    // somebody logged vanishing from their own totals with no explanation,
    // which is exactly the shape of "the km wasn't updating".
    //
    // The stored `distance_km` is the row's own answer and does not need the
    // table, so a row with an unknown code still counts towards everything
    // measured in kilometres. It is only left out of the things that genuinely
    // need coordinates - the map, the airport tally, the country set - and
    // `placeable` is what says which is which.
    const list = (rows ?? []).map((r) => {
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
      }
    })

    const airportCount = new Map()
    const countries = new Set()
    const airlines = new Set()
    const aircraft = new Set()
    const routeCount = new Map()
    const byYear = new Map()
    const byPurpose = new Map()
    const airlineRating = new Map()
    let distance = 0
    let minutes = 0
    let carbon = 0
    let rated = 0
    let ratingTotal = 0

    for (const f of list) {
      distance += f.dist
      minutes += f.mins
      carbon += co2Kg(f.dist)
      for (const a of [f.from, f.to]) {
        airportCount.set(a.iata, (airportCount.get(a.iata) || 0) + 1)
        if (a.country) countries.add(a.country)
      }
      if (f.airline?.trim()) airlines.add(f.airline.trim().toLowerCase())
      if (f.aircraft?.trim()) aircraft.add(f.aircraft.trim().toLowerCase())
      // A route is unordered: London to Lisbon and Lisbon to London are the
      // same line on the map and the same pair of places in your life.
      const pair = [f.from.iata, f.to.iata].sort().join('-')
      routeCount.set(pair, (routeCount.get(pair) || 0) + 1)
      const y = f.flown_on.slice(0, 4)
      const cur = byYear.get(y) || { year: y, flights: 0, distance: 0 }
      cur.flights += 1
      cur.distance += f.dist
      byYear.set(y, cur)
      if (f.purpose) byPurpose.set(f.purpose, (byPurpose.get(f.purpose) || 0) + 1)
      if (f.rating) {
        rated += 1
        ratingTotal += f.rating
        // AN AVERAGE NEEDS MORE THAN ONE FLIGHT TO MEAN ANYTHING, so the count
        // travels with the sum and the display refuses to name a best airline
        // off a single rating.
        if (f.airline?.trim()) {
          const key = f.airline.trim()
          const a = airlineRating.get(key) || { name: key, n: 0, total: 0 }
          a.n += 1
          a.total += f.rating
          airlineRating.set(key, a)
        }
      }
    }

    const topAirport = [...airportCount.entries()].sort((a, b) => b[1] - a[1])[0]
    const topRoute = [...routeCount.entries()].sort((a, b) => b[1] - a[1])[0]
    const longest = list.reduce((best, f) => (!best || f.dist > best.dist ? f : best), null)
    const longestTime = list.reduce((best, f) => (!best || f.mins > best.mins ? f : best), null)
    const bestFlight = list.reduce((best, f) => (f.rating && (!best || f.rating > best.rating) ? f : best), null)
    // Two ratings minimum. "Your best airline, based on one flight" is not a
    // fact about an airline, it is a fact about a Tuesday.
    const bestAirline = [...airlineRating.values()]
      .filter((a) => a.n >= 2)
      .sort((a, b) => b.total / b.n - a.total / a.n || b.n - a.n)[0]

    // The map wants one line per DISTINCT pair, not one per flight: eighty
    // London-Lisbon hops are one arc drawn eighty times otherwise. It carries
    // the flights themselves now, so tapping a line can say when you flew it.
    const byPair = new Map()
    for (const f of list) {
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

    return {
      list,
      distance,
      minutes,
      co2: carbon,
      longestTime,
      airports: airportCount.size,
      countries: countries.size,
      airlines: airlines.size,
      aircraft: aircraft.size,
      topAirport: topAirport ? { ...(airport(topAirport[0]) || { iata: topAirport[0], city: topAirport[0] }), n: topAirport[1] } : null,
      topRoute: topRoute ? { pair: topRoute[0].replace('-', ' ↔ '), n: topRoute[1] } : null,
      longest,
      bestFlight,
      bestAirline,
      avgRating: rated ? ratingTotal / rated : null,
      ratedCount: rated,
      purposes: PURPOSES.map((p) => ({ ...p, n: byPurpose.get(p.key) || 0 })).filter((p) => p.n > 0),
      routes,
      pins: [...airportCount.entries()].map(([iata, weight]) => ({ ...airport(iata), weight })).filter((a) => a.iata),
      years: [...byYear.values()].sort((a, b) => b.year.localeCompare(a.year)),
    }
  }, [rows])

  const fromA = airport(form.from_iata)
  const toA = airport(form.to_iata)
  const previewKm = fromA && toA ? distanceKm(fromA, toA) : 0
  const facts = useMemo(() => routeFacts(fromA, toA, form.flown_on), [fromA, toA, form.flown_on])

  // WHO FLIES IT. Derived from where airlines are based and what their fleets
  // can reach - see lib/airlines for why that is a table and not an API call.
  // Capped at eight: past that it stops being a shortlist and becomes the
  // problem the shortlist was solving.
  const carriers = useMemo(
    () => (previewKm ? routeAirlines(fromA, toA, previewKm) : []),
    [fromA, toA, previewKm],
  )
  const shownCarriers = allAirlines ? carriers : carriers.slice(0, 8)
  const picked = airlineByName(form.airline)

  // AND WHAT THEY WOULD SEND. An airline's own fleet, filtered to what can
  // reach, smallest first - which is how airlines actually assign aircraft. If
  // no airline is picked yet, every type in the table that could do it.
  const planes = useMemo(
    () => (previewKm ? (picked ? aircraftFor(picked, previewKm) : anyAircraftFor(previewKm)) : []),
    [picked, previewKm],
  )

  async function save(e) {
    e.preventDefault()
    setError('')
    if (!form.from_iata || !form.to_iata) { setError('Pick where you flew from and to.'); return }
    if (form.from_iata === form.to_iata) { setError('Those are the same airport.'); return }
    if (!form.flown_on) { setError('Add the date you flew.'); return }
    if (form.flown_on > today) { setError('That date is in the future.'); return }
    if (form.round_trip) {
      if (!form.return_on) { setError('Add the date you flew back, or untick round trip.'); return }
      if (form.return_on > today) { setError('The return date is in the future.'); return }
      if (form.return_on < form.flown_on) { setError('The return is before the outbound. Check the dates.'); return }
    }
    setSaving(true)

    // Everything both legs share. The return is the SAME flight backwards - same
    // airline, same aircraft, same distance - so it inherits all of it and only
    // the ends, the date and the seat differ. A seat number is per boarding
    // pass and guessing it would be inventing data.
    const common = {
      creator_id: user.id,
      airline: form.airline.trim() || null,
      flight_number: form.flight_number.trim().toUpperCase() || null,
      aircraft: form.aircraft.trim() || null,
      // Stored so a future leaderboard or market total is a `sum()` rather than
      // a full download. See migration 098.
      distance_km: Math.round(previewKm * 100) / 100,
      purpose: form.purpose || null,
      rating: form.rating || null,
    }

    const { data: out, error: insErr } = await supabase.from('flights').insert({
      ...common,
      from_iata: form.from_iata,
      to_iata: form.to_iata,
      flown_on: form.flown_on,
      seat: form.seat.trim() || null,
      note: form.note.trim() || null,
    }).select('id').single()

    if (insErr || !out) {
      setSaving(false)
      setError('Could not save that flight. Please try again.')
      return
    }

    // THE RETURN IS A SECOND ROW, and it is saved SECOND on purpose: `return_of`
    // needs the outbound's id, and if this insert fails the outbound is still
    // safely logged. A half-saved round trip that loses the leg you actually
    // took would be worse than one that loses the leg you can re-add in ten
    // seconds, so the error says exactly which one is missing.
    let returnFailed = false
    if (form.round_trip) {
      const { error: retErr } = await supabase.from('flights').insert({
        ...common,
        from_iata: form.to_iata,
        to_iata: form.from_iata,
        flown_on: form.return_on,
        return_of: out.id,
      })
      returnFailed = !!retErr
    }

    setSaving(false)
    if (returnFailed) {
      setError('The outbound is saved but the return did not go through. Add it on its own.')
      load()
      return
    }
    setForm(BLANK_FORM)
    setCustomAirline(false)
    setAllAirlines(false)
    setAdding(false)
    load()
  }

  async function remove(f) {
    if (!await confirm(`Remove ${f.from.iata} to ${f.to.iata} from your log?`)) return
    setRows((cur) => cur.filter((x) => x.id !== f.id))
    const { error: delErr } = await supabase.from('flights').delete().eq('id', f.id)
    if (delErr) { await notice('Could not remove that flight.'); load() }
  }

  const laps = stats.distance / EARTH_CIRCUMFERENCE_KM
  const moonPct = (stats.distance / MOON_KM) * 100
  const visible = showAll ? stats.list : stats.list.slice(0, 12)

  return (
    <div className="page">
      <PageHeader
        title="Your flight log"
        subtitle="Every flight you have taken, and what it adds up to. Add them as you go, or work backwards through your inbox on a rainy afternoon."
        action={
          <button onClick={() => setAdding(true)} className="btn-primary !py-2.5">
            <Icon name="plus" className="h-4 w-4" /> Log a flight
          </button>
        }
      />

      {rows === null ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      ) : stats.list.length === 0 ? (
        <EmptyState
          icon={<Icon name="plane" className="h-7 w-7" />}
          title="No flights logged yet"
          hint="Add your last trip and the map fills in. Distance, hours in the air, airports and countries all count themselves."
          action={<button onClick={() => setAdding(true)} className="btn-primary">Log your first flight</button>}
        />
      ) : (
        <div className="space-y-10">
          {/* ---- THE HEADLINE, AS ONE CARD ----
              This was four grey tiles above eight more grey tiles, which is
              twelve boxes of the same weight saying twelve things of very
              different importance - so the page had no first sentence and the
              number people actually care about (how far) sat in a box the same
              size as "Aircraft types". Ethan: "the UI and design is bad."

              One card leads now, in the brand, with distance as the hero and
              the lap of the earth drawn UNDER it as a bar you fill in. The
              supporting figures ride along its foot; everything else stays in
              the grid further down where a grid is the right shape. */}
          <Reveal from="down">
            <section className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:p-8">
              <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
              <div className="relative">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70">Distance flown</p>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-4xl font-bold tabular-nums sm:text-6xl">
                  <CountUp value={Math.round(stats.distance)} format={(n) => Math.round(n).toLocaleString('en-GB')} />
                  <span className="text-lg font-semibold text-white/75 sm:text-2xl">km</span>
                  <span className="text-sm font-medium text-white/60">{miles(stats.distance)} miles</span>
                </p>

                {/* THE LAP BAR. "1.83 times around the world" is a number you
                    have to picture; a bar that has gone round once and is most
                    of the way round again is the picture. This is the single
                    most screenshot-able thing on the page and it was a tile. */}
                <div className="mt-5 max-w-xl">
                  <div className="flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-widest text-white/70">
                    <span>{laps < 1 ? 'Around the world' : `Lap ${Math.floor(laps) + 1}`}</span>
                    <span className="tabular-nums">{laps.toFixed(2)}×</span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/20">
                    {/* A zero-width fill still paints its own padding, so a
                        brand-new log draws no bar at all rather than a stub. */}
                    {laps > 0 && (
                      <div
                        className="h-full rounded-full bg-white transition-[width] duration-1000 ease-out"
                        style={{ width: `${Math.max(2, (laps % 1 || 1) * 100)}%` }}
                      />
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] text-white/60">
                    One lap is {km(EARTH_CIRCUMFERENCE_KM)} km. You are {moonPct < 1 ? moonPct.toFixed(2) : moonPct.toFixed(1)}% of the way to the moon.
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/20 pt-4">
                  {[
                    { n: stats.list.length, label: 'Flights' },
                    { n: null, v: humanHours(stats.minutes), label: 'In the air' },
                    { n: stats.countries, label: 'Countries' },
                    { n: stats.airports, label: 'Airports' },
                  ].map((s) => (
                    <div key={s.label}>
                      <p className="text-xl font-bold tabular-nums sm:text-2xl">
                        {s.v ?? <CountUp value={s.n} />}
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">{s.label}</p>
                    </div>
                  ))}
                </div>
                {/* One caveat, always, instead of an asterisk on some rows.
                    Nothing asks for a gate-to-gate time any more, so every
                    duration on this page is worked out from the distance and
                    the aircraft's cruise speed. Saying so once here is more
                    honest than a footnote that only appeared sometimes. */}
                <p className="mt-3 text-[11px] text-white/55">
                  Time in the air is worked out from the distance flown.
                </p>
              </div>
            </section>
          </Reveal>

          {/* ---- The map ----
              Deferred like every other map in this app: the atlas is a megabyte
              of geometry and parsing it while the cards above are mid-animation
              is what makes a page hitch a second after it appears. */}
          <Reveal from="down">
            <section>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">Everywhere you have been</h2>
                <p className="text-xs text-smoke">
                  {stats.routes.length} {stats.routes.length === 1 ? 'route' : 'routes'} · {stats.airports} airports
                </p>
              </div>
              <WhenVisible fallback={<div className="aspect-[11/6] w-full animate-pulse rounded-card bg-cloud/70" />}>
                <FlightMap routes={stats.routes} airports={stats.pins} />
              </WhenVisible>
            </section>
          </Reveal>

          {/* ---- The numbers that make people screenshot it ---- */}
          <Reveal from="down">
            <section>
              {/* "Times around the world" and "of the way to the moon" moved
                  UP into the hero card, where they are the picture rather than
                  two more tiles. What is left here is the set of facts that are
                  genuinely a grid: one per question, all the same weight. */}
              <h2 className="mb-3 text-lg font-semibold">What that adds up to</h2>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                <StatTile
                  label="Longest flight"
                  value={stats.longest ? `${km(stats.longest.dist)} km` : '—'}
                  hint={stats.longest ? `${stats.longest.from.iata} → ${stats.longest.to.iata}` : undefined}
                />
                <StatTile
                  label="Most flown route"
                  value={stats.topRoute ? stats.topRoute.pair : '—'}
                  hint={stats.topRoute ? `${stats.topRoute.n} ${stats.topRoute.n === 1 ? 'time' : 'times'}` : undefined}
                />
                <StatTile
                  label="Home airport"
                  value={stats.topAirport ? stats.topAirport.iata : '—'}
                  hint={stats.topAirport ? `${stats.topAirport.city} · ${stats.topAirport.n} ${stats.topAirport.n === 1 ? 'flight' : 'flights'}` : undefined}
                />
                <StatTile label="Airlines" count={stats.airlines} hint={stats.airlines === 0 ? 'Add one to a flight' : undefined} />
                <StatTile label="Aircraft types" count={stats.aircraft} hint={stats.aircraft === 0 ? 'Add one to a flight' : undefined} />
                <StatTile
                  label="Average flight"
                  value={`${km(stats.distance / stats.list.length)} km`}
                  hint={humanHours(stats.minutes / stats.list.length)}
                />
                {/* Two more that the rows already knew and nothing was asking
                    them. The carbon figure is deliberately last and captioned
                    as an estimate: it is the only number here that somebody
                    might quote at a stranger. */}
                <StatTile
                  label="Longest time in the air"
                  value={stats.longestTime ? humanHours(stats.longestTime.mins) : '—'}
                  hint={stats.longestTime ? `${stats.longestTime.from.iata} → ${stats.longestTime.to.iata}` : undefined}
                />
                {/* KILOGRAMS UNTIL TONNES MEAN SOMETHING. One short-haul hop is
                    about 200kg, which rounds to zero tonnes - and a stat card
                    reading "0" under a flight somebody just logged says the
                    page is broken, not that the number is small. */}
                <StatTile
                  label="Carbon, roughly"
                  value={stats.co2 >= 1000 ? `${(stats.co2 / 1000).toFixed(1)} t` : `${km(stats.co2)} kg`}
                  hint="per seat, estimated"
                />
                {/* THE THREE THAT ONLY EXIST BECAUSE OF THE NEW FIELDS. Each is
                    drawn only when there is something to say: an empty "Best
                    flight" tile is an advert for a field, and a stats grid
                    should never contain a prompt. */}
                {stats.bestFlight && (
                  <StatTile
                    label="Best flight"
                    value={`${stats.bestFlight.from.iata} → ${stats.bestFlight.to.iata}`}
                    hint={`${'★'.repeat(stats.bestFlight.rating)}${stats.bestFlight.airline ? ` · ${stats.bestFlight.airline}` : ''}`}
                  />
                )}
                {stats.bestAirline && (
                  <StatTile
                    label="Airline you rate"
                    value={stats.bestAirline.name}
                    hint={`${(stats.bestAirline.total / stats.bestAirline.n).toFixed(1)} out of 5 over ${stats.bestAirline.n} flights`}
                  />
                )}
                {stats.avgRating != null && (
                  <StatTile
                    label="Average flight rating"
                    value={`${stats.avgRating.toFixed(1)} / 5`}
                    hint={`${stats.ratedCount} of ${stats.list.length} rated`}
                  />
                )}
              </div>
            </section>
          </Reveal>

          {/* ---- WHY YOU WENT ----
              The one question a creator programme's flight log should be able
              to answer and no other page can: how much of your flying is work.
              Drawn as a proportion bar rather than a list of counts, because
              "eleven creator trips" means nothing without the denominator. */}
          {stats.purposes.length > 0 && (
            <Reveal from="down">
              <section>
                <h2 className="mb-3 text-lg font-semibold">Why you were flying</h2>
                <div className="card !p-5 sm:!p-6">
                  <div className="flex h-3 overflow-hidden rounded-full bg-cloud">
                    {stats.purposes.map((p, i) => (
                      <span
                        key={p.key}
                        title={`${p.label}: ${p.n}`}
                        style={{
                          width: `${(p.n / stats.purposes.reduce((s, x) => s + x.n, 0)) * 100}%`,
                          // A single hue stepped in opacity rather than six
                          // colours: the palette here is one orange, and six
                          // arbitrary colours would be six things to learn.
                          opacity: 1 - i * 0.14,
                        }}
                        className="block bg-brand transition-[width] duration-700 ease-out"
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                    {stats.purposes.map((p, i) => (
                      <span key={p.key} className="flex items-center gap-2 text-xs">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" style={{ opacity: 1 - i * 0.14 }} />
                        <span className="font-medium text-ink">{p.label}</span>
                        <span className="tabular-nums text-smoke">{p.n}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </section>
            </Reveal>
          )}

          {/* ---- By year ----
              A bar per year, widths as a share of the biggest. A chart library
              for eight bars would be a hundred kilobytes to draw eight divs. */}
          {stats.years.length > 1 && (
            <Reveal from="down">
              <section>
                <h2 className="mb-3 text-lg font-semibold">Year by year</h2>
                <div className="card space-y-3 !p-5 sm:!p-6">
                  {stats.years.map((y) => {
                    const max = Math.max(...stats.years.map((x) => x.distance)) || 1
                    return (
                      <div key={y.year} className="flex items-center gap-3">
                        <span className="w-10 shrink-0 text-xs font-semibold tabular-nums text-smoke">{y.year}</span>
                        <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-cloud">
                          {/* A zero-width fill still paints its own padding, so
                              a year with nothing in it draws no bar at all. */}
                          {y.distance > 0 && (
                            <span
                              className="block h-full rounded-full bg-brand transition-[width] duration-700 ease-out"
                              style={{ width: `${Math.max(4, (y.distance / max) * 100)}%` }}
                            />
                          )}
                        </span>
                        <span className="w-28 shrink-0 text-right text-xs tabular-nums text-smoke sm:w-36">
                          {km(y.distance)} km · {y.flights}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </section>
            </Reveal>
          )}

          {/* ---- The log itself ---- */}
          <Reveal from="down">
            <section>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">Every flight</h2>
                <p className="text-xs text-smoke">{stats.list.length} logged</p>
              </div>
              <Reveal className="space-y-2.5" stagger={0.03}>
                {visible.map((f) => (
                  <div key={f.id} className="card group flex flex-wrap items-center gap-x-4 gap-y-2 !p-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex shrink-0 items-center gap-1.5 text-sm font-bold tracking-wider text-brand">
                        {f.from.iata}
                        <Icon name="plane" className="h-3.5 w-3.5 text-gray-300" />
                        {f.to.iata}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {f.from.city} to {f.to.city}
                        </span>
                        <span className="block truncate text-xs text-smoke">
                          {f.flown_on}
                          {f.airline ? ` · ${f.airline}` : ''}
                          {f.flight_number ? ` ${f.flight_number}` : ''}
                          {f.aircraft ? ` · ${f.aircraft}` : ''}
                          {f.seat ? ` · seat ${f.seat}` : ''}
                          {f.purpose ? ` · ${PURPOSE_LABEL[f.purpose] || f.purpose}` : ''}
                        </span>
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {/* A return leg says so. It is the only way to tell, on a
                          list sorted by date, that two rows were one trip. */}
                      {f.return_of && <Badge tone="light" className="!px-2 !py-0.5">Return</Badge>}
                      {f.rating > 0 && (
                        <span className="text-xs font-semibold text-brand" title={`${f.rating} out of 5`} aria-label={`Rated ${f.rating} out of 5`}>
                          {'★'.repeat(f.rating)}
                        </span>
                      )}
                      {/* HAUL, NOT CABIN. The cabin badge was removed with the
                          picker; what belongs on a row at a glance is what KIND
                          of flight it was, which the distance already knows. */}
                      <Badge tone="grey" className="!px-2 !py-0.5">{haul(f.dist)}</Badge>
                      <span className="text-right text-xs tabular-nums text-smoke">
                        <span className="block font-semibold text-ink">{km(f.dist)} km</span>
                        <span className="block">{humanHours(f.mins)}</span>
                      </span>
                      <button
                        onClick={() => remove(f)}
                        aria-label="Remove this flight"
                        className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </Reveal>
              {stats.list.length > 12 && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-card border border-gray-100 bg-white py-3 text-sm font-semibold text-brand shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
                >
                  {showAll ? 'Show fewer' : `Show all ${stats.list.length} flights`}
                </button>
              )}
            </section>
          </Reveal>
        </div>
      )}

      {/* ---- Log a flight ---- */}
      <Modal open={adding} onClose={() => setAdding(false)} title="Log a flight" sheet={false}>
        {/* No heading of its own: `ui/Modal` already draws "Log a flight" in
            its title bar, and the dialog was saying it twice, one line apart,
            in two different sizes. */}
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AirportField id="flight-from" label="From" value={form.from_iata} autoFocus
              onChange={(v) => setForm((f) => ({ ...f, from_iata: v }))} />
            <AirportField id="flight-to" label="To" value={form.to_iata}
              onChange={(v) => setForm((f) => ({ ...f, to_iata: v }))} />
          </div>

          {/* ---- WHAT WE WORKED OUT ----
              THE FORM ANSWERS ITSELF THE MOMENT BOTH ENDS ARE PICKED. This used
              to be one line saying the distance; everything else on the page
              was a blank box. Now the route hands over everything that follows
              from it - how far, how long, which way, what kind of flight, how
              many hours the clock moves, roughly what it cost the atmosphere -
              before anybody presses Save. That is the difference between filling
              in a form and watching your flight appear. */}
          {facts && (
            <div className="animate-fade-up rounded-card border border-brand/25 bg-brand-tint/25 p-4">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-2xl font-bold tabular-nums text-brand">{km(facts.dist)} km</span>
                <span className="text-sm text-smoke">{miles(facts.dist)} miles</span>
                <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-brand">
                  {facts.haul}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs sm:grid-cols-4">
                <RouteFact label="In the air" value={humanHours(facts.mins)} hint="estimated" />
                <RouteFact label="Heading" value={facts.direction} hint={`${Math.round(facts.bearing)}°`} />
                <RouteFact
                  label="Clocks"
                  value={facts.shift == null ? '—' : facts.shift === 0 ? 'Same time' : `${facts.shift > 0 ? '+' : ''}${facts.shift}h`}
                  hint={facts.shift == null ? 'zone unknown' : facts.shift === 0 ? 'no change' : facts.shift > 0 ? 'ahead' : 'behind'}
                />
                <RouteFact label="CO2" value={`${facts.co2} kg`} hint="per seat, estimated" />
              </dl>
              <p className="mt-3 border-t border-brand/15 pt-2.5 text-[11px] text-smoke">
                {facts.intercontinental
                  ? 'Between two continents.'
                  : facts.international
                    ? `${flagFromIso(fromA.country)} to ${flagFromIso(toA.country)}, international.`
                    : 'A domestic flight.'}
                {' '}Everything here is worked out from the two airports. Anything you add below replaces the estimate.
              </p>
            </div>
          )}

          {/* ---- WHEN, AND WHETHER YOU CAME BACK ----
              THE TIME-IN-THE-AIR BOX IS GONE. It sat beside the date asking for
              a number in minutes, and the panel above has already worked that
              number out from the distance. Ethan: "the time in error shouldn't
              be asked for, it should just be taken from the info you have."
              Every duration on this page is now the estimate, which is what it
              was for almost every row anyway - and the page no longer has to
              carry an asterisk explaining which rows are which.

              A ROUND TRIP IS TWO FLIGHTS, and logging it is one tick. See the
              note in migration 100: it saves as two rows, because a return has
              its own date and its own distance and folding it into one row
              would halve everybody's totals. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DateField id="flight-date" label="Date flown" value={form.flown_on} max={today}
              onChange={(v) => setForm((f) => ({ ...f, flown_on: v }))} />
            <div className="flex flex-col justify-end">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-3.5 py-2.5 transition-colors hover:border-brand/40">
                <input
                  type="checkbox"
                  checked={form.round_trip}
                  onChange={(e) => setForm((f) => ({ ...f, round_trip: e.target.checked, return_on: e.target.checked ? f.return_on : '' }))}
                  className="h-4 w-4 shrink-0 accent-[#d94407]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Round trip</span>
                  <span className="block text-[11px] text-smoke">
                    {toA && fromA ? `Adds ${toA.iata} back to ${fromA.iata}` : 'Logs the flight home too'}
                  </span>
                </span>
              </label>
            </div>
          </div>

          {form.round_trip && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DateField id="flight-return" label="Date you flew back" value={form.return_on} max={today}
                hint={form.flown_on && form.return_on && form.return_on < form.flown_on
                  ? undefined
                  : 'Saved as its own flight, so the distance counts twice.'}
                onChange={(v) => setForm((f) => ({ ...f, return_on: v }))} />
              {form.flown_on && form.return_on && form.return_on < form.flown_on && (
                <p className="self-end pb-2.5 text-[11px] text-red-500">
                  The return is before the outbound. Check the dates.
                </p>
              )}
            </div>
          )}

          {/* ---- WHO FLIES IT ----
              A SHORTLIST OF REAL CANDIDATES INSTEAD OF AN EMPTY BOX. This was
              a text field labelled "Airline (optional)" and the honest thing to
              say about an optional text field asking for a fact you have to
              remember is that almost nobody fills it in - which is why the
              "Airlines" statistic on this page read zero for everybody.
              Picking one narrows the aircraft list to that airline's fleet,
              which is the second half of Ethan's ask: "showing the options for
              the companies that do that route and then choosing the appropriate
              plane from that". */}
          {previewKm > 0 && (
            <div>
              <p className="label">Airline <span className="font-normal text-smoke">(optional)</span></p>

              {/* THE EXPLANATION IS GONE FROM UNDER THE CHIPS.
                  It used to close with a paragraph about how the shortlist is
                  derived from bases and aircraft range and is not a timetable.
                  That is true, it is in the comment above and at the top of
                  lib/airlines, and it is not something a person filling in a
                  form needs to be told: the chips are obviously a shortlist
                  because there is an Other beside them. Ethan cut the same kind
                  of copy from the aircraft row for the same reason. */}
              {customAirline ? (
                <div className="flex gap-2">
                  <input id="flight-airline" value={form.airline} maxLength={60} autoFocus
                    placeholder="The airline you flew"
                    onChange={(e) => setForm((f) => ({ ...f, airline: e.target.value }))} className="input w-full" />
                  <button type="button" onClick={() => { setCustomAirline(false); setForm((f) => ({ ...f, airline: '' })) }}
                    className="btn-ghost shrink-0 !px-3 !py-2 text-xs">Back to the list</button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {shownCarriers.map(({ airline: a, why }) => {
                    const on = form.airline === a.name
                    return (
                      <button
                        key={a.iata}
                        type="button"
                        title={why}
                        onClick={() => setForm((f) => ({
                          ...f,
                          airline: on ? '' : a.name,
                          // Changing airline invalidates an aircraft chosen from
                          // the previous one's fleet. Silently keeping a 787
                          // beside "Ryanair" would be the form telling a lie it
                          // was built to prevent.
                          aircraft: on ? f.aircraft : '',
                        }))}
                        className={cx(
                          'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
                          on ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:-translate-y-0.5 hover:text-ink',
                        )}
                      >
                        <span className={cx('font-mono text-[10px]', on ? 'text-white/70' : 'text-gray-400')}>{a.iata}</span>
                        {a.name}
                      </button>
                    )
                  })}
                  {/* OTHER IS ALWAYS THERE, INCLUDING WHEN THE LIST IS EMPTY.
                      It used to be a "Type it myself" link in the corner of the
                      heading, which is a different control in a different place
                      doing the same job as the chips. As a chip at the end of
                      the row it is simply the last option, which is what it is. */}
                  {carriers.length > 8 && !allAirlines && (
                    <button type="button" onClick={() => setAllAirlines(true)}
                      className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-smoke ring-1 ring-gray-200 transition-all hover:-translate-y-0.5 hover:text-ink">
                      {carriers.length - 8} more
                    </button>
                  )}
                  <button type="button" onClick={() => { setCustomAirline(true); setForm((f) => ({ ...f, airline: '' })) }}
                    className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand ring-1 ring-brand/30 transition-all hover:-translate-y-0.5 hover:ring-brand">
                    Other
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ---- AIRCRAFT ----
              JUST THE NAME. The heading was "Japan Airlines would send
              (optional)" and underneath sat a sentence explaining that the
              A330-300 is the likeliest because it is the smallest thing in the
              fleet that covers 9,707 km. Both went, at Ethan's request: the
              chips are already in likeliest-first order, the label should say
              what the field IS, and a paragraph of reasoning under an optional
              field is reasoning nobody asked for. */}
          {previewKm > 0 && planes.length > 0 && (
            <div>
              <p className="label">Aircraft <span className="font-normal text-smoke">(optional)</span></p>
              <div className="flex flex-wrap gap-1.5">
                {planes.slice(0, picked ? planes.length : 10).map((p) => {
                  const on = form.aircraft === p.name
                  return (
                    <button
                      key={p.key}
                      type="button"
                      title={`${p.maker} · ${p.seats} seats · ${km(p.range)} km range`}
                      onClick={() => setForm((f) => ({ ...f, aircraft: on ? '' : p.name }))}
                      className={cx(
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
                        on ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:-translate-y-0.5 hover:text-ink',
                      )}
                    >
                      {p.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              {/* The "(optional)" moved off these two labels. At a quarter of
                  the dialog's width both wrapped onto a second line, so the two
                  fields beside them started at different heights - which is the
                  "cards are sometimes changing sizes" report in miniature. The
                  row below says it once for all of them. */}
              <label htmlFor="flight-number" className="label">Flight no.</label>
              <input id="flight-number" maxLength={10}
                value={form.flight_number}
                placeholder={picked ? `${picked.iata}1363` : 'TP1363'}
                onChange={(e) => setForm((f) => ({ ...f, flight_number: e.target.value }))} className="input w-full" />
            </div>
            {/* SEAT. The one detail people actually remember, and the one that
                makes a row read like a memory rather than a database entry. */}
            <div>
              <label htmlFor="flight-seat" className="label">Seat <span className="font-normal text-smoke">(optional)</span></label>
              <input id="flight-seat" maxLength={8} value={form.seat} placeholder="14A"
                onChange={(e) => setForm((f) => ({ ...f, seat: e.target.value.toUpperCase() }))} className="input w-full" />
            </div>
            <div className="col-span-2">
              <label htmlFor="flight-note" className="label">Note <span className="font-normal text-smoke">(optional)</span></label>
              <input id="flight-note" value={form.note} maxLength={140} placeholder="Sunrise over the Alps"
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="input w-full" />
            </div>
          </div>

          {/* ---- WHY YOU WENT, AND HOW IT WAS ----
              Both are new, and both exist because something on the page counts
              them. "Purpose" is the question a creator programme in particular
              has and could not answer: how much of last year's flying was for
              content. "How was it" gives the log a best flight and an opinion
              about an airline, neither of which is derivable from anything
              already stored. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="label">What for? <span className="font-normal text-smoke">(optional)</span></p>
              <div className="flex flex-wrap gap-1.5">
                {PURPOSES.map((p) => {
                  const on = form.purpose === p.key
                  return (
                    <button key={p.key} type="button"
                      onClick={() => setForm((f) => ({ ...f, purpose: on ? '' : p.key }))}
                      className={cx(
                        'rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
                        on ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:-translate-y-0.5 hover:text-ink',
                      )}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <p className="label">How was it? <span className="font-normal text-smoke">(optional)</span></p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} out of 5`}
                    aria-pressed={form.rating === n}
                    onClick={() => setForm((f) => ({ ...f, rating: f.rating === n ? 0 : n }))}
                    className="p-0.5 transition-transform duration-150 hover:scale-125 active:scale-110"
                  >
                    <Icon
                      name="star"
                      className={cx('h-6 w-6', n <= form.rating ? 'fill-brand text-brand' : 'text-gray-300')}
                    />
                  </button>
                ))}
                {form.rating > 0 && (
                  <button type="button" onClick={() => setForm((f) => ({ ...f, rating: 0 }))}
                    className="ml-1.5 text-[11px] font-medium text-smoke hover:text-brand">Clear</button>
                )}
              </div>
            </div>
          </div>

          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setAdding(false)} className="btn-ghost w-full justify-center sm:w-auto">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary w-full justify-center sm:w-auto">
              {saving ? <Spinner /> : 'Add to my log'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
