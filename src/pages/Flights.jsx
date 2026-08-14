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
import { airport, searchAirports, distanceKm, estimateMinutes } from '../lib/airports'
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

const CABINS = [
  { key: 'economy', label: 'Economy' },
  { key: 'premium', label: 'Premium' },
  { key: 'business', label: 'Business' },
  { key: 'first', label: 'First' },
]

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
  const [form, setForm] = useState({
    from_iata: '', to_iata: '', flown_on: '', airline: '', flight_number: '',
    aircraft: '', cabin: '', duration_min: '', note: '',
  })
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
    const list = (rows ?? []).map((r) => {
      const from = airport(r.from_iata)
      const to = airport(r.to_iata)
      const dist = Number(r.distance_km) || (from && to ? distanceKm(from, to) : 0)
      const mins = r.duration_min || estimateMinutes(dist)
      return { ...r, from, to, dist, mins, estimated: !r.duration_min }
    }).filter((r) => r.from && r.to)

    const airportCount = new Map()
    const countries = new Set()
    const airlines = new Set()
    const aircraft = new Set()
    const routeCount = new Map()
    const byYear = new Map()
    let distance = 0
    let minutes = 0
    let anyEstimated = false

    for (const f of list) {
      distance += f.dist
      minutes += f.mins
      if (f.estimated) anyEstimated = true
      for (const a of [f.from, f.to]) {
        airportCount.set(a.iata, (airportCount.get(a.iata) || 0) + 1)
        countries.add(a.country)
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
    }

    const topAirport = [...airportCount.entries()].sort((a, b) => b[1] - a[1])[0]
    const topRoute = [...routeCount.entries()].sort((a, b) => b[1] - a[1])[0]
    const longest = list.reduce((best, f) => (!best || f.dist > best.dist ? f : best), null)

    // The map wants one line per DISTINCT pair, not one per flight: eighty
    // London-Lisbon hops are one arc drawn eighty times otherwise.
    const seen = new Set()
    const routes = []
    for (const f of list) {
      const pair = [f.from.iata, f.to.iata].sort().join('-')
      if (seen.has(pair)) continue
      seen.add(pair)
      routes.push({ key: pair, from: f.from, to: f.to })
    }

    return {
      list,
      distance,
      minutes,
      anyEstimated,
      airports: airportCount.size,
      countries: countries.size,
      airlines: airlines.size,
      aircraft: aircraft.size,
      topAirport: topAirport ? { ...airport(topAirport[0]), n: topAirport[1] } : null,
      topRoute: topRoute ? { pair: topRoute[0].replace('-', ' ↔ '), n: topRoute[1] } : null,
      longest,
      routes,
      pins: [...airportCount.entries()].map(([iata, weight]) => ({ ...airport(iata), weight })).filter((a) => a.iata),
      years: [...byYear.values()].sort((a, b) => b.year.localeCompare(a.year)),
    }
  }, [rows])

  const fromA = airport(form.from_iata)
  const toA = airport(form.to_iata)
  const previewKm = fromA && toA ? distanceKm(fromA, toA) : 0

  async function save(e) {
    e.preventDefault()
    setError('')
    if (!form.from_iata || !form.to_iata) { setError('Pick where you flew from and to.'); return }
    if (form.from_iata === form.to_iata) { setError('Those are the same airport.'); return }
    if (!form.flown_on) { setError('Add the date you flew.'); return }
    setSaving(true)
    const { error: insErr } = await supabase.from('flights').insert({
      creator_id: user.id,
      from_iata: form.from_iata,
      to_iata: form.to_iata,
      flown_on: form.flown_on,
      airline: form.airline.trim() || null,
      flight_number: form.flight_number.trim().toUpperCase() || null,
      aircraft: form.aircraft.trim() || null,
      cabin: form.cabin || null,
      duration_min: form.duration_min ? Number(form.duration_min) : null,
      // Stored so a future leaderboard or market total is a `sum()` rather than
      // a full download. See migration 098.
      distance_km: Math.round(previewKm * 100) / 100,
      note: form.note.trim() || null,
    })
    setSaving(false)
    if (insErr) { setError('Could not save that flight. Please try again.'); return }
    setForm({ from_iata: '', to_iata: '', flown_on: '', airline: '', flight_number: '', aircraft: '', cabin: '', duration_min: '', note: '' })
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
          {/* ---- The four numbers worth leading with ---- */}
          <Reveal className="grid grid-cols-2 gap-4 lg:grid-cols-4" stagger={0.06}>
            <StatTile label="Flights" count={stats.list.length} />
            <StatTile
              label="Distance flown"
              count={Math.round(stats.distance)}
              hint={`${miles(stats.distance)} miles`}
              accent
            />
            <StatTile
              label="In the air"
              value={humanHours(stats.minutes)}
              hint={stats.anyEstimated ? 'Estimated where no time was logged' : 'From the times you logged'}
            />
            <StatTile label="Countries" count={stats.countries} hint={`${stats.airports} airports`} />
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
              <h2 className="mb-3 text-lg font-semibold">What that adds up to</h2>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatTile
                  label="Times around the world"
                  value={laps.toFixed(2)}
                  hint={`One lap is ${km(EARTH_CIRCUMFERENCE_KM)} km`}
                />
                <StatTile
                  label="Of the way to the moon"
                  value={`${moonPct < 1 ? moonPct.toFixed(2) : moonPct.toFixed(1)}%`}
                  hint={`${km(MOON_KM)} km away`}
                />
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
              </div>
            </section>
          </Reveal>

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
                        </span>
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {f.cabin && <Badge tone="grey" className="!px-2 !py-0.5 capitalize">{f.cabin}</Badge>}
                      <span className="text-right text-xs tabular-nums text-smoke">
                        <span className="block font-semibold text-ink">{km(f.dist)} km</span>
                        <span className="block">{humanHours(f.mins)}{f.estimated ? '*' : ''}</span>
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
              {stats.anyEstimated && (
                <p className="mt-3 text-[11px] text-gray-400">
                  * Time estimated from the distance. Add the real gate-to-gate time when you log a flight and it will use that instead.
                </p>
              )}
            </section>
          </Reveal>
        </div>
      )}

      {/* ---- Log a flight ---- */}
      <Modal open={adding} onClose={() => setAdding(false)} title="Log a flight" sheet={false}>
        <form onSubmit={save} className="space-y-4">
          <h2 className="text-lg font-semibold">Log a flight</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AirportField id="flight-from" label="From" value={form.from_iata} autoFocus
              onChange={(v) => setForm((f) => ({ ...f, from_iata: v }))} />
            <AirportField id="flight-to" label="To" value={form.to_iata}
              onChange={(v) => setForm((f) => ({ ...f, to_iata: v }))} />
          </div>

          {/* THE DISTANCE APPEARS AS SOON AS BOTH ENDS ARE PICKED. It is the
              reason somebody is filling this in, and showing it before they
              press Save is what turns a form into the thing itself. */}
          {previewKm > 0 && (
            <p className="animate-fade-up rounded-xl bg-brand-tint/40 px-3.5 py-2.5 text-sm">
              <span className="font-semibold text-brand">{km(previewKm)} km</span>
              <span className="text-smoke"> · {miles(previewKm)} miles · about {humanHours(estimateMinutes(previewKm))} in the air</span>
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="flight-date" className="label">Date flown</label>
              <input id="flight-date" type="date" max={today} value={form.flown_on}
                onChange={(e) => setForm((f) => ({ ...f, flown_on: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <label htmlFor="flight-duration" className="label">
                Time in the air <span className="font-normal text-smoke">(minutes, optional)</span>
              </label>
              <input id="flight-duration" type="number" min="1" max="1199" inputMode="numeric"
                placeholder={previewKm ? String(estimateMinutes(previewKm)) : 'e.g. 155'}
                value={form.duration_min}
                onChange={(e) => setForm((f) => ({ ...f, duration_min: e.target.value }))} className="input w-full" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="flight-airline" className="label">Airline <span className="font-normal text-smoke">(optional)</span></label>
              <input id="flight-airline" value={form.airline} maxLength={60} placeholder="TAP Air Portugal"
                onChange={(e) => setForm((f) => ({ ...f, airline: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <label htmlFor="flight-number" className="label">Flight number <span className="font-normal text-smoke">(optional)</span></label>
              <input id="flight-number" value={form.flight_number} maxLength={10} placeholder="TP1363"
                onChange={(e) => setForm((f) => ({ ...f, flight_number: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <label htmlFor="flight-aircraft" className="label">Aircraft <span className="font-normal text-smoke">(optional)</span></label>
              <input id="flight-aircraft" value={form.aircraft} maxLength={40} placeholder="A320neo"
                onChange={(e) => setForm((f) => ({ ...f, aircraft: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <p className="label">Cabin <span className="font-normal text-smoke">(optional)</span></p>
              <div className="flex flex-wrap gap-1.5">
                {CABINS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, cabin: f.cabin === c.key ? '' : c.key }))}
                    className={cx(
                      'rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
                      form.cabin === c.key ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:text-ink',
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="flight-note" className="label">Note <span className="font-normal text-smoke">(optional)</span></label>
            <input id="flight-note" value={form.note} maxLength={140} placeholder="Sunrise over the Alps"
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="input w-full" />
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
