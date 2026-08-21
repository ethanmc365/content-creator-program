import { useMemo, useState } from 'react'
import { Badge } from '../../../components/ui'
import Icon from '../../../components/Icon'
import {
  airport, searchAirports, distanceKm, estimateMinutes, bearing, compass, haul, co2Kg,
} from '../../../lib/airports'
import { routeAirlines, aircraftFor, anyAircraftFor } from '../../../lib/airlines'
import { clockShift, humanHours } from '../../../lib/flightStats'
import AirlineMark from '../../../components/network/AirlineMark'
import { formatDate } from '../../../lib/utils'
import { LabPage, Panel, Note, KeyVal, Field, Code, useNow } from './kit'
import { dateOnly, FLIGHTS } from './fixtures'

// A BOARDING PASS THAT BUILDS ITSELF.
//
// Type two airport codes and a date. Everything else on this page - the
// distance, the block time, the heading, the haul, how far the clock moves, the
// carbon, which airlines fly it and what they would send - is derived, with no
// network call and no API, because there is no free CORS-open route API worth
// depending on and a table of ninety airlines is a better answer than an
// outage.
//
// This is the single best thing to put in front of somebody who asks what the
// platform is like to use. It is instant, it is obviously not a form, and every
// figure on it can be checked against something they already know.

const PRESETS = [
  { from: 'LHR', to: 'JFK', label: 'London to New York' },
  { from: 'LIS', to: 'OPO', label: 'Lisbon to Porto' },
  { from: 'DUB', to: 'OSL', label: 'Dublin to Oslo' },
  { from: 'MAN', to: 'BCN', label: 'Manchester to Barcelona' },
  { from: 'LHR', to: 'SYD', label: 'London to Sydney' },
  { from: 'CPH', to: 'OTP', label: 'Copenhagen to Bucharest' },
]

export default function FlightLab() {
  const now = useNow()
  const [from, setFrom] = useState('LHR')
  const [to, setTo] = useState('LIS')
  const [date, setDate] = useState(() => dateOnly(0, now))

  const a = airport(from)
  const b = airport(to)
  const ok = !!a && !!b && a.iata !== b.iata

  const derived = useMemo(() => {
    if (!ok) return null
    const km = Math.round(distanceKm(a, b))
    const mins = estimateMinutes(km)
    const deg = bearing(a, b)
    const airlines = routeAirlines(a, b, km).slice(0, 6)
    return {
      km,
      mins,
      deg,
      point: compass(deg),
      haul: haul(km),
      co2: co2Kg(km),
      shift: clockShift(a, b, date),
      airlines,
      metal: airlines.length ? aircraftFor(airlines[0].airline, km).slice(0, 4) : anyAircraftFor(km).slice(0, 4),
    }
  }, [a, b, ok, date])

  const suggestions = (q) => searchAirports(q, 5)

  return (
    <LabPage
      title="Flight log"
      icon="plane"
      subtitle="Two airport codes and a date. Everything else is worked out on the spot, with no network call and no API, from a table of nine hundred airports and ninety airlines."
    >
      <Panel title="The route" hint="Type any IATA code, or press one of the presets.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="From" hint={a ? `${a.city}, ${a.country}` : 'Unknown code'}>
            <input
              className="input uppercase"
              value={from}
              maxLength={3}
              onChange={(e) => setFrom(e.target.value.toUpperCase())}
              placeholder="LHR"
            />
          </Field>
          <Field label="To" hint={b ? `${b.city}, ${b.country}` : 'Unknown code'}>
            <input
              className="input uppercase"
              value={to}
              maxLength={3}
              onChange={(e) => setTo(e.target.value.toUpperCase())}
              placeholder="LIS"
            />
          </Field>
          <Field label="Date" hint="Used for the clock change, because daylight saving moves it.">
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => { setFrom(p.from); setTo(p.to) }}
              className={
                'rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5 ' +
                (from === p.from && to === p.to ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:text-ink')
              }
            >
              {p.label}
            </button>
          ))}
        </div>

        {!a && from.length === 3 && (
          <Note className="mt-4" tone="warn" icon="alert">
            <p className="font-semibold">{from} is not in the table.</p>
            <p>Try one of these: {suggestions(from).map((s) => s.iata).join(', ') || 'no close matches'}.</p>
          </Note>
        )}
      </Panel>

      {ok && derived && (
        <>
          {/* THE PASS. A boarding pass rather than a table because the shape is
              the recognition: two big codes, a line between them, and the
              details underneath in the size an airline prints them. */}
          <div className="overflow-hidden rounded-card bg-white shadow-lift ring-1 ring-gray-100">
            <div className="flex items-center justify-between px-6 py-4" style={{ backgroundColor: '#d94407' }}>
              <div>
                <p className="text-sm font-bold tracking-tight text-white">Tryp.com</p>
                <p className="text-[10px] tracking-[0.2em] text-white/80">FLIGHT LOG</p>
              </div>
              <p className="text-[11px] font-medium text-white/90">{formatDate(new Date(`${date}T12:00:00`))}</p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 px-6 py-8 sm:gap-10">
              <div className="text-center">
                <p className="text-4xl font-extrabold tracking-tight sm:text-5xl">{a.iata}</p>
                <p className="mt-1 max-w-[9rem] truncate text-xs text-smoke">{a.city}</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 text-gray-300">
                  <span className="h-px w-8 bg-current sm:w-16" />
                  <Icon name="plane" className="h-5 w-5 text-brand" />
                  <span className="h-px w-8 bg-current sm:w-16" />
                </div>
                <p className="mt-2 text-[11px] font-semibold text-brand">{humanHours(derived.mins)}</p>
                <p className="text-[10px] text-smoke">{derived.km.toLocaleString()} km</p>
              </div>
              <div className="text-center">
                <p className="text-4xl font-extrabold tracking-tight sm:text-5xl">{b.iata}</p>
                <p className="mt-1 max-w-[9rem] truncate text-xs text-smoke">{b.city}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-px border-t border-gray-100 bg-gray-100 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Distance', `${derived.km.toLocaleString()} km`],
                ['Block time', humanHours(derived.mins)],
                ['Heading', `${Math.round(derived.deg)}° ${derived.point}`],
                ['Haul', derived.haul],
                ['Clock', derived.shift == null ? 'Not certain' : derived.shift === 0 ? 'No change' : `${derived.shift > 0 ? '+' : ''}${derived.shift}h`],
                ['Carbon', `${derived.co2.toLocaleString()} kg`],
              ].map(([l, v]) => (
                <div key={l} className="bg-white px-4 py-4 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-smoke">{l}</p>
                  <p className="mt-1 text-sm font-bold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            <div className="h-2.5 bg-brand" />
          </div>

          <Panel
            title="Who flies this route"
            hint="Nobody typed this in. Ninety airlines with their bases, their reach and their fleets, filtered by what can physically make the distance and ranked by how much evidence there is."
          >
            {derived.airlines.length === 0 ? (
              <p className="py-6 text-center text-sm text-smoke">
                No airline in the table has an aircraft with the range for {derived.km.toLocaleString()} km.
              </p>
            ) : (
              <div className="space-y-2">
                {derived.airlines.map(({ airline, score, why }) => (
                  <div key={airline.iata} className="flex items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3">
                    <AirlineMark iata={airline.iata} name={airline.name} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{airline.name}</span>
                      <span className="block truncate text-xs text-smoke">{why}</span>
                    </span>
                    <Badge tone={score >= 3 ? 'light' : 'grey'} className="!px-2 !py-0.5 !text-[10px]">
                      {score >= 3.5 ? 'both ends, at home' : score >= 3 ? 'both ends' : score >= 2 ? 'one end' : 'home country'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="What they would send"
            hint="Range is a floor, not a target. Everything that cannot reach is out, and then the smallest aircraft that can is the likeliest, because that is how airlines assign metal. A 787 can fly Dublin to Oslo and never does."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {derived.metal.map((f) => (
                <div key={f.key || f.name} className="card !p-4">
                  <p className="text-sm font-semibold">{f.name}</p>
                  <p className="mt-1 text-xs text-smoke">{f.seats} seats</p>
                  <p className="mt-0.5 text-xs text-smoke">{f.range.toLocaleString()} km range</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="A creator's log, in the same shape" hint="Eight flights, every figure derived the same way. The real page adds records, streaks, time zones crossed and an aircraft collection on top.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-smoke">
                    <th className="pb-2">Route</th>
                    <th className="pb-2">When</th>
                    <th className="pb-2 text-right">Distance</th>
                    <th className="pb-2 text-right">Time</th>
                    <th className="pb-2 text-right">Haul</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {FLIGHTS.map((f) => {
                    const x = airport(f.from)
                    const y = airport(f.to)
                    const km = x && y ? Math.round(distanceKm(x, y)) : 0
                    return (
                      <tr key={`${f.from}${f.to}${f.daysAgo}`}>
                        <td className="py-2.5 pr-4 text-xs font-semibold">{f.from} to {f.to}</td>
                        <td className="py-2.5 pr-4 text-xs text-smoke">{formatDate(new Date(now + f.daysAgo * 86400000))}</td>
                        <td className="py-2.5 pr-4 text-right text-xs tabular-nums">{km.toLocaleString()} km</td>
                        <td className="py-2.5 pr-4 text-right text-xs tabular-nums">{humanHours(estimateMinutes(km))}</td>
                        <td className="py-2.5 text-right text-xs text-smoke">{haul(km)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <KeyVal
              className="mt-5"
              rows={[
                ['Total distance', `${FLIGHTS.reduce((s, f) => {
                  const x = airport(f.from); const y = airport(f.to)
                  return s + (x && y ? Math.round(distanceKm(x, y)) : 0)
                }, 0).toLocaleString()} km`],
                ['Times round the equator', (FLIGHTS.reduce((s, f) => {
                  const x = airport(f.from); const y = airport(f.to)
                  return s + (x && y ? distanceKm(x, y) : 0)
                }, 0) / 40075).toFixed(2)],
                ['Airports visited', String(new Set(FLIGHTS.flatMap((f) => [f.from, f.to])).size)],
              ]}
            />
          </Panel>

          <Panel title="Where the numbers come from" tone="quiet">
            <div className="grid gap-4 lg:grid-cols-2">
              <Code>{`distance    haversine, not a flat approximation
            (flat is fine over England and wrong by
             hundreds of km over the Pacific)

block time  35 minutes fixed + km / 820 km/h
            taxi at both ends, a slow climb and
            descent, and a routing that is never
            the straight line

carbon      11 kg for the take-off and landing
            cycle, whatever the distance, plus a
            per-km rate that FALLS with range.
            That is why short flights are worse
            per kilometre.

haul        1,500 km and 4,000 km, the thresholds
            the industry actually uses`}</Code>
              <div className="space-y-4">
                <Note>
                  <p className="font-semibold text-ink">Every one of these is presented as an estimate.</p>
                  <p>
                    A logged duration always beats the estimate, and the carbon figure is not something
                    anybody should offset against. A real number needs the actual aircraft, the actual
                    load factor and the actual cabin.
                  </p>
                </Note>
                <Note icon="bulb">
                  <p className="font-semibold text-ink">There are no airline logos anywhere on this platform.</p>
                  <p>
                    The tail fin above is the airline&apos;s own livery colour with its code on it, drawn
                    rather than downloaded. The production content policy only allows images we serve
                    ourselves, and shipping a hundred and seventy trademarks is not a thing to do.
                  </p>
                </Note>
              </div>
            </div>
          </Panel>
        </>
      )}
    </LabPage>
  )
}
