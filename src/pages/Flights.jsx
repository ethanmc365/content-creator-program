import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, Badge, EmptyState, Modal, PageHeader, Skeleton, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import Reveal from '../components/network/Reveal'
import Segmented from '../components/network/Segmented'
import { CountUp } from '../components/network/Motion'
import WhenVisible from '../components/WhenVisible'
import FlightMap from '../components/network/FlightMap'
import AircraftArt from '../components/network/AircraftArt'
import { confirm, notice } from '../lib/confirm'
import { toast } from '../lib/toast'
import { airport, searchAirports, distanceKm, estimateMinutes, bearing, compass, haul, co2Kg } from '../lib/airports'
import { routeAirlines, aircraftFor, anyAircraftFor, airlineByName, continentOf, AIRCRAFT } from '../lib/airlines'
import { buildFlightStats, humanHours, clockShift, MONTHS } from '../lib/flightStats'
import { compressImage } from '../lib/image'
import { uploadFile } from '../lib/upload'
import { flagFromIso } from '../lib/flags'
import { cx, formatDate } from '../lib/utils'

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
// keep, which now also feeds a map, a collection, a leaderboard and the collab
// board.
//
// WHERE THE ARITHMETIC LIVES. Not here. `lib/flightStats` is every number on
// this page as pure functions over the rows, because the moment this page grew
// a records wall, an airline ranking, a year-on-year comparison and a streak it
// became six hundred lines of folds with some JSX at the bottom. This file
// decides what to SAY; that one decides what is TRUE.

const EARTH_CIRCUMFERENCE_KM = 40075
const MOON_KM = 384400

// THE CABIN PICKER IS GONE, AND SO IS THE RATING.
//
// Both for the same reason, given twice by the same person: a field is worth
// asking for only if something on the page COUNTS it, and neither of these
// earned its place on the form. The cabin was never counted at all. The rating
// bought two tiles - "your best flight" and "the airline you rate" - and cost
// every single person filling in the form a decision about a flight they had
// already stopped thinking about. Ethan: "remove the 'how was it'."
// Both COLUMNS are left in place and simply unwritten. Dropping a column to
// remove a control would throw away whatever anybody has already logged, for no
// gain at all.

// Why the trip happened. Six options and no more: the value of this field is
// that it can be counted, and a taxonomy nobody can hold in their head is a
// taxonomy that gets filled in inconsistently and then cannot be counted.
// `creator` is the one that justifies the field existing on THIS platform.
const PURPOSES = [
  { key: 'creator', label: 'Creator trip', icon: 'video' },
  { key: 'leisure', label: 'Holiday', icon: 'sun' },
  { key: 'work', label: 'Work', icon: 'briefcase' },
  { key: 'family', label: 'Family', icon: 'heart' },
  { key: 'commute', label: 'Commute', icon: 'clock' },
  { key: 'other', label: 'Other', icon: 'dots' },
]
const PURPOSE_LABEL = Object.fromEntries(PURPOSES.map((p) => [p.key, p.label]))

// One shape, declared once. `save` resets to it and the modal's Cancel does
// too, so there is no list of fields to keep in step in three places.
const BLANK_FORM = {
  from_iata: '', to_iata: '', flown_on: '', airline: '', flight_number: '',
  aircraft: '', note: '', seat: '', purpose: '',
  round_trip: false, return_on: '',
  photo_url: '', share: true,
}

const km = (n) => Math.round(n).toLocaleString('en-GB')
const miles = (n) => Math.round(n * 0.621371).toLocaleString('en-GB')

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const monthLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`

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
// backspace at the start of a box moves back, and the rest of the app's
// `.input` styling wraps the group so it still looks like one field.
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

  useEffect(() => {
    if (value) return
    if (d || m || y) { setD(''); setM(''); setY('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Push up only when all three are complete and the result is a real date.
  // 31/02 is three complete boxes and not a day, and a form that accepts it and
  // fails on save is worse than one that simply waits.
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
// typed and nothing is fetched. That is the whole design of this form: you say
// where you went, and the app works out the rest and shows it to you before you
// save, which is what turns filling in a form into seeing your flight.
function routeFacts(from, to, dateStr) {
  if (!from || !to) return null
  const dist = distanceKm(from, to)
  return {
    dist,
    mins: estimateMinutes(dist),
    bearing: bearing(from, to),
    direction: compass(bearing(from, to)),
    haul: haul(dist),
    co2: co2Kg(dist),
    // Computed ON THE DATE FLOWN, not today: a route between a country that
    // observes summer time and one that does not changes with the season, and
    // using today's offsets for a flight last November would quietly be wrong.
    shift: clockShift(from, to, dateStr || ymd(new Date())),
    international: from.country !== to.country,
    intercontinental: continentOf(from.country) !== continentOf(to.country),
  }
}

// ------------------------------------------------------------ the boarding pass
//
// THE FORM'S ANSWER, DRAWN AS THE THING IT IS ABOUT.
//
// This was a tinted rectangle with a definition list in it. Ethan: "when
// logging a flight can you make the UI and design much more interactive, I want
// it to look really cool." A boarding pass is the right object for two reasons
// beyond looking like one: it is the shape everybody already reads flight
// information in, so the codes, the date and the flight number land where the
// eye is already going to look for them; and it is the artefact the form is
// replacing, so filling in the form produces one.
//
// It builds ITSELF as you type. With one airport it is a stub with the other
// end blank, with both it draws the arc and the aircraft starts flying, and
// every fact underneath appears the moment it can be worked out. Nothing here
// is ever typed by the person filling it in.
function BoardingPass({ from, to, facts, dateStr, airlineName, flightNo, seat, aircraftType }) {
  // The arc, in the pass's own little coordinate system. Same quadratic the
  // maps use, just very much shorter.
  const arc = 'M14 30 Q 100 -2 186 30'
  return (
    <div className="overflow-hidden rounded-card border border-brand/25 bg-white shadow-card">
      {/* The stub across the top: brand, and the two codes with the aircraft
          between them, which is the one line of a boarding pass anybody
          actually reads. */}
      <div className="relative overflow-hidden bg-gradient-to-br from-brand to-brand-light px-5 py-4 text-white">
        <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">From</p>
            <p className="text-3xl font-bold leading-none tracking-wider sm:text-4xl">{from?.iata || '– – –'}</p>
            <p className="mt-1 truncate text-[11px] text-white/80">{from?.city || 'Where you left'}</p>
          </div>

          <div className="relative h-10 min-w-0 flex-1">
            <svg viewBox="0 0 200 40" className="h-full w-full overflow-visible" fill="none" aria-hidden>
              <path d={arc} stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeDasharray="5 5" strokeLinecap="round" />
              {from && to && (
                <g>
                  {/* Nose-up silhouette rotated onto the path, the same one
                      every map in this product flies. */}
                  <g transform="scale(0.34) rotate(90)">
                    <path
                      d="M0 -11 C1.1 -11 1.8 -9 1.8 -6.2 L1.8 -4.4 L10 1 L10 3.1 L1.8 -0.2 L1.8 5 L4.4 7.6 L4.4 9.2 L0 7.7 L-4.4 9.2 L-4.4 7.6 L-1.8 5 L-1.8 -0.2 L-10 3.1 L-10 1 L-1.8 -4.4 L-1.8 -6.2 C-1.8 -9 -1.1 -11 0 -11 Z"
                      fill="#ffffff"
                    />
                  </g>
                  <animateMotion dur="3.4s" repeatCount="indefinite" rotate="auto" path={arc} />
                </g>
              )}
            </svg>
          </div>

          <div className="min-w-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">To</p>
            <p className="text-3xl font-bold leading-none tracking-wider sm:text-4xl">{to?.iata || '– – –'}</p>
            <p className="mt-1 truncate text-[11px] text-white/80">{to?.city || 'Where you went'}</p>
          </div>
        </div>
      </div>

      {/* The perforation. Two notches and a dashed rule, which is the whole
          reason this reads as a ticket rather than as a card with a coloured
          header on it. */}
      <div className="relative h-0">
        <span className="absolute -left-2 top-0 h-4 w-4 -translate-y-1/2 rounded-full bg-white ring-1 ring-brand/25" />
        <span className="absolute -right-2 top-0 h-4 w-4 -translate-y-1/2 rounded-full bg-white ring-1 ring-brand/25" />
      </div>

      <div className="border-t border-dashed border-brand/30 px-5 py-4">
        <dl className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-6">
          <PassField label="Date" value={dateStr ? formatDate(dateStr) : '—'} />
          <PassField label="Flight" value={flightNo?.trim().toUpperCase() || (airlineName ? airlineName.split(' ')[0] : '—')} />
          <PassField label="Seat" value={seat?.trim().toUpperCase() || '—'} />
          <PassField label="Distance" value={facts ? `${km(facts.dist)} km` : '—'} />
          <PassField label="In the air" value={facts ? humanHours(facts.mins) : '—'} hint={facts ? 'estimated' : null} />
          <PassField
            label="Clocks"
            value={!facts || facts.shift == null ? '—' : facts.shift === 0 ? 'No change' : `${facts.shift > 0 ? '+' : ''}${facts.shift}h`}
          />
        </dl>

        {facts && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            <Badge tone="light" className="!px-2.5 !py-1">{facts.haul}</Badge>
            <Badge tone="grey" className="!px-2.5 !py-1">{facts.direction} · {Math.round(facts.bearing)}°</Badge>
            <Badge tone="grey" className="!px-2.5 !py-1">{facts.co2} kg CO2</Badge>
            <span className="text-[11px] text-smoke">
              {facts.intercontinental
                ? 'Between two continents'
                : facts.international
                  ? `${flagFromIso(from.country) || ''} to ${flagFromIso(to.country) || ''}, international`
                  : 'A domestic flight'}
            </span>
            {aircraftType && (
              <span className="ml-auto flex items-center gap-2 text-[11px] font-medium text-smoke">
                <span className="h-6 w-9"><AircraftArt type={aircraftType} /></span>
                {aircraftType.name}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PassField({ label, value, hint }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-widest text-smoke">{label}</dt>
      <dd className="truncate text-sm font-semibold text-ink">{value}</dd>
      {hint && <dd className="text-[10px] text-gray-400">{hint}</dd>}
    </div>
  )
}

// ------------------------------------------------------------------ the page

// THE GRID OF GREY TILES IS GONE.
//
// There was a `StatTile` and a "What that adds up to" section of eight to
// eleven of them: eight boxes of identical weight saying eight things of very
// different importance, half of which were superlatives ("longest flight",
// "most flown route") wearing the same clothes as plain counts ("aircraft
// types"). The records wall below says the superlatives properly, and the
// counts that survive are in the hero card's foot where they belong.

// ONE RECORD ON THE WALL.
//
// A record is a superlative and a story, so the card is a headline number, the
// flight it belongs to, and nothing else. They are deliberately a mix of the
// impressive and the daft - the longest flight is a boast and the fastest
// turnaround is a war story - because a wall with only boasts on it is a CV.
function RecordCard({ icon, label, value, detail, tone = 'plain' }) {
  return (
    <div className={cx(
      'flex items-start gap-3 rounded-card border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift',
      tone === 'brand' ? 'border-brand/25 bg-brand-tint/25' : 'border-gray-100 bg-white shadow-card',
    )}>
      <span className={cx(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
        tone === 'brand' ? 'bg-brand text-white' : 'bg-cloud text-brand',
      )}>
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-widest text-smoke">{label}</span>
        <span className="block truncate text-base font-bold leading-tight text-ink">{value}</span>
        {detail && <span className="mt-0.5 block truncate text-[11px] text-smoke">{detail}</span>}
      </span>
    </div>
  )
}

// A YEAR, BESIDE ANOTHER YEAR.
//
// SIDE BY SIDE AND ON DEMAND, both of which Ethan asked for: "this year vs last
// year, side by side comparison when asked for". On demand matters as much as
// the shape - a comparison that is always on screen is a judgement passed on
// you every time you open the page, and in January it is a very unkind one.
function YearColumn({ title, data, other, lead = false }) {
  const delta = (a, b) => {
    if (!other || b === 0) return null
    const pct = Math.round(((a - b) / b) * 100)
    if (!Number.isFinite(pct) || pct === 0) return null
    return pct
  }
  const rows = [
    { label: 'Flights', value: data.flights.toLocaleString('en-GB'), d: delta(data.flights, other?.flights) },
    { label: 'Distance', value: `${km(data.distance)} km`, d: delta(data.distance, other?.distance) },
    { label: 'In the air', value: humanHours(data.minutes), d: delta(data.minutes, other?.minutes) },
    { label: 'Countries', value: data.countries, d: delta(data.countries, other?.countries) },
    { label: 'Airports', value: data.airports, d: delta(data.airports, other?.airports) },
    { label: 'Time zones crossed', value: `${data.zonesCrossed}h`, d: delta(data.zonesCrossed, other?.zonesCrossed) },
  ]
  return (
    <div className={cx(
      'rounded-card border p-5',
      lead ? 'border-brand/30 bg-brand-tint/20' : 'border-gray-100 bg-white shadow-card',
    )}>
      <p className={cx('text-sm font-bold', lead ? 'text-brand' : 'text-ink')}>{title}</p>
      <dl className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-smoke">{r.label}</dt>
            <dd className="flex items-baseline gap-2">
              <span className="text-sm font-semibold tabular-nums text-ink">{r.value}</span>
              {/* The arrow only appears on the LEAD column. Printing "+40%" on
                  one side and "-29%" on the other is the same fact twice, and
                  the second one reads as last year having failed. */}
              {lead && r.d != null && (
                <span className={cx(
                  'w-12 shrink-0 text-right text-[11px] font-semibold tabular-nums',
                  r.d > 0 ? 'text-green-600' : 'text-smoke',
                )}>
                  {r.d > 0 ? '+' : ''}{r.d}%
                </span>
              )}
              {lead && r.d == null && <span className="w-12 shrink-0" />}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// The airline you actually fly, and the ones you say you fly.
function LoyaltyRow({ a, max, rank }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3 shadow-card transition-transform duration-200 hover:-translate-y-0.5">
      <span className={cx(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        rank === 0 ? 'bg-brand text-white' : 'bg-cloud text-smoke',
      )}>
        {rank + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{a.name}</span>
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-cloud">
          <span
            className="block h-full rounded-full bg-brand transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(6, (a.flights / max) * 100)}%` }}
          />
        </span>
        <span className="mt-1 block truncate text-[11px] text-smoke">
          {a.routes} {a.routes === 1 ? 'route' : 'routes'}
          {a.aircraft > 0 ? ` · ${a.aircraft} ${a.aircraft === 1 ? 'type' : 'types'}` : ''}
          {a.last ? ` · last ${formatDate(a.last)}` : ''}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-bold tabular-nums text-brand">{a.flights}</span>
        <span className="block text-[10px] text-smoke">{km(a.distance)} km</span>
      </span>
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
  const [allAirlines, setAllAirlines] = useState(false)
  const [customAirline, setCustomAirline] = useState(false)
  const [uploading, setUploading] = useState(false)
  // `today` in state, not computed in render: this repo's eslint bans clock
  // reads during render and it is right to.
  const [today] = useState(() => ymd(new Date()))
  // The year-on-year panel, off until asked for. See YearColumn.
  const [compare, setCompare] = useState(false)
  // The community board, which is three RPCs nobody needs until they scroll.
  const [board, setBoard] = useState(null)
  const [boardWindow, setBoardWindow] = useState('year')
  const [flyers, setFlyers] = useState({})
  // What to offer after a flight is saved: the collab board post.
  const [offer, setOffer] = useState(null)

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

  const stats = useMemo(() => buildFlightStats(rows, today), [rows, today])

  const thisYear = today.slice(0, 4)
  const lastYear = String(Number(thisYear) - 1)
  const yearRow = (y) => stats.years.find((x) => x.year === y) || null

  // ---- WHO ELSE FLIES YOUR ROUTES -----------------------------------------
  //
  // Asked for the six routes you fly most, not for all of them: this is one
  // round trip per route and a well-travelled log has sixty. The six busiest
  // are the ones where an introduction is worth making anyway - a route you
  // have flown once is a holiday, and a route you have flown nine times is
  // somewhere you keep going back to.
  const topRoutes = useMemo(
    () => [...stats.routes].sort((a, b) => b.flights.length - a.flights.length).slice(0, 6),
    [stats.routes],
  )
  useEffect(() => {
    if (topRoutes.length === 0) return undefined
    let cancelled = false
    ;(async () => {
      const out = {}
      for (const r of topRoutes) {
        const { data } = await supabase.rpc('route_flyers', { p_a: r.from.iata, p_b: r.to.iata })
        if (cancelled) return
        if (data?.length) out[r.key] = data
      }
      if (!cancelled) setFlyers(out)
    })()
    return () => { cancelled = true }
  }, [topRoutes])

  // ---- THE COMMUNITY BOARD -------------------------------------------------
  //
  // The window is a parameter of the RPC rather than two functions, so "this
  // year" and "all time" are the same query twice. Only flights their owner has
  // ticked to share are in it - see migration 103 for why that is the only
  // honest way to aggregate a private table.
  useEffect(() => {
    let cancelled = false
    const from = boardWindow === 'year' ? `${thisYear}-01-01` : '1970-01-01'
    supabase.rpc('flight_leaderboard', { p_from: from, p_to: today }).then(({ data }) => {
      if (!cancelled) setBoard(data ?? [])
    })
    return () => { cancelled = true }
  }, [boardWindow, thisYear, today])

  const boards = useMemo(() => {
    if (!board) return null
    const withCountries = board.map((b) => {
      const countries = new Set()
      for (const code of b.airports || []) {
        const a = airport(code)
        if (a?.country) countries.add(a.country)
      }
      return { ...b, km: Number(b.km) || 0, flights: Number(b.flights) || 0, countries: countries.size }
    })
    return {
      distance: [...withCountries].sort((a, b) => b.km - a.km).slice(0, 5),
      countries: [...withCountries].sort((a, b) => b.countries - a.countries || b.km - a.km).slice(0, 5),
      flights: [...withCountries].sort((a, b) => b.flights - a.flights || b.km - a.km).slice(0, 5),
    }
  }, [board])

  // ---- the form ------------------------------------------------------------
  const fromA = airport(form.from_iata)
  const toA = airport(form.to_iata)
  const previewKm = fromA && toA ? distanceKm(fromA, toA) : 0
  const facts = useMemo(() => routeFacts(fromA, toA, form.flown_on), [fromA, toA, form.flown_on])

  // WHO FLIES IT. Derived from where airlines are based and what their fleets
  // can reach - see lib/airlines for why that is a table and not an API call.
  const carriers = useMemo(
    () => (previewKm ? routeAirlines(fromA, toA, previewKm) : []),
    [fromA, toA, previewKm],
  )
  const shownCarriers = allAirlines ? carriers : carriers.slice(0, 8)
  const picked = airlineByName(form.airline)

  // AND WHAT THEY WOULD SEND. An airline's own fleet, filtered to what can
  // reach, smallest first - which is how airlines actually assign aircraft.
  const planes = useMemo(
    () => (previewKm ? (picked ? aircraftFor(picked, previewKm) : anyAircraftFor(previewKm)) : []),
    [picked, previewKm],
  )
  const pickedPlane = useMemo(() => {
    const name = form.aircraft.trim().toLowerCase()
    if (!name) return null
    const hit = Object.entries(AIRCRAFT).find(([, a]) => a.name.toLowerCase() === name)
    return hit ? { key: hit[0], ...hit[1] } : null
  }, [form.aircraft])

  async function pickPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const compressed = await compressImage(file, { maxDim: 1400, quality: 0.8 })
      const path = `${user.id}/flights/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
      const url = await uploadFile('gallery', path, compressed, compressed.type || 'image/jpeg')
      setForm((f) => ({ ...f, photo_url: url }))
    } catch (err) {
      await notice(err.message || 'That image would not upload.')
    }
    setUploading(false)
  }

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

    // Everything both legs share. The return is the SAME flight backwards -
    // same airline, same aircraft, same distance - so it inherits all of it and
    // only the ends, the date and the seat differ. A seat number is per
    // boarding pass and guessing it would be inventing data.
    const common = {
      creator_id: user.id,
      airline: form.airline.trim() || null,
      flight_number: form.flight_number.trim().toUpperCase() || null,
      aircraft: form.aircraft.trim() || null,
      // Stored so a future leaderboard or market total is a `sum()` rather than
      // a full download. See migration 098.
      distance_km: Math.round(previewKm * 100) / 100,
      purpose: form.purpose || null,
      share_with_community: !!form.share,
    }

    const { data: out, error: insErr } = await supabase.from('flights').insert({
      ...common,
      from_iata: form.from_iata,
      to_iata: form.to_iata,
      flown_on: form.flown_on,
      seat: form.seat.trim() || null,
      note: form.note.trim() || null,
      // The photo belongs to the OUTBOUND leg only. One image per trip was the
      // ask, and copying it onto the return would make one photograph appear
      // twice in a log sorted by date.
      photo_url: form.photo_url || null,
    }).select('id').single()

    if (insErr || !out) {
      setSaving(false)
      setError('Could not save that flight. Please try again.')
      return
    }

    // THE RETURN IS A SECOND ROW, saved SECOND on purpose: `return_of` needs the
    // outbound's id, and if this insert fails the outbound is still safely
    // logged. A half-saved round trip that loses the leg you actually took
    // would be worse than one that loses the leg you can re-add in ten seconds,
    // so the error says exactly which one is missing.
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

    // THE OFFER TO POST IT ON THE COLLAB BOARD.
    //
    // Ethan: "a logged flight offers to post the trip on collab board with the
    // details." It is an OFFER and not a side effect, and it appears after the
    // save rather than as a tick inside the form, because the two are different
    // decisions: one is a record you keep and the other is a message to forty
    // other people. Only for a flight that is going somewhere in the future or
    // that has just happened - offering to tell the community about a trip you
    // took in 2019 is offering to post something nobody can act on.
    const arrived = airport(form.to_iata)
    const recent = form.flown_on >= ymd(new Date(Date.now() - 21 * 86400000))
    setForm(BLANK_FORM)
    setCustomAirline(false)
    setAllAirlines(false)
    setAdding(false)
    load()
    if (arrived && recent) {
      setOffer({
        city: arrived.city,
        country: arrived.countryName || arrived.country || '',
        start: form.flown_on,
        end: form.round_trip && form.return_on ? form.return_on : ymd(new Date(new Date(`${form.flown_on}T12:00:00Z`).getTime() + 6 * 86400000)),
        note: '',
      })
    }
  }

  async function postToCollab() {
    if (!offer) return
    if (!offer.note.trim()) return
    const { error: insErr } = await supabase.from('collab_posts').insert({
      creator_id: user.id,
      city: offer.city,
      country: offer.country || null,
      start_date: offer.start,
      end_date: offer.end,
      note: offer.note.trim(),
    })
    if (insErr) { await notice('Could not post that to the collab board.'); return }
    setOffer(null)
    toast('Posted to the collab board')
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
  const r = stats.records

  return (
    <div className="page">
      <PageHeader
        title="Your flight log"
        subtitle="Every flight you have taken, and what it adds up to. Add them as you go, or work backwards through your inbox on a rainy afternoon."
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/flights/aircraft" className="btn-secondary !py-2.5 text-sm">
              <Icon name="plane" className="h-4 w-4" />
              Aircraft
            </Link>
            <button onClick={() => setAdding(true)} className="btn-primary !py-2.5">
              <Icon name="plus" className="h-4 w-4" /> Log a flight
            </button>
          </div>
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
              One card leads, in the brand, with distance as the hero and the lap
              of the earth drawn UNDER it as a bar you fill in. The supporting
              figures ride along its foot; everything else stays in the grids
              further down where a grid is the right shape. */}
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
                    of the way round again is the picture. */}
                <div className="mt-5 max-w-xl">
                  <div className="flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-widest text-white/70">
                    <span>{laps < 1 ? 'Around the world' : `Lap ${Math.floor(laps) + 1}`}</span>
                    <span className="tabular-nums">{laps.toFixed(2)}×</span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/20">
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
                    { n: stats.flights, label: 'Flights' },
                    { n: null, v: humanHours(stats.minutes), label: 'In the air' },
                    { n: stats.countries, label: 'Countries' },
                    { n: stats.airports, label: 'Airports' },
                    // TIME ZONES CROSSED, LIFETIME. Not distinct zones visited,
                    // which is a much smaller and much duller number: this is
                    // how many hours of clock change you have flown through,
                    // added up, which is the part that actually costs you
                    // something. See lib/flightStats.
                    { n: stats.zonesCrossed, label: 'Time zones', suffix: 'h' },
                  ].map((s) => (
                    <div key={s.label}>
                      <p className="text-xl font-bold tabular-nums sm:text-2xl">
                        {s.v ?? <><CountUp value={s.n} />{s.suffix || ''}</>}
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">{s.label}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-white/55">
                  Time in the air is worked out from the distance flown.
                  {stats.zoneFlights < stats.flights
                    ? ` Clock changes are counted on the ${stats.zoneFlights} of ${stats.flights} flights where both ends name a single time zone.`
                    : ''}
                </p>
              </div>
            </section>
          </Reveal>

          {/* ---- The map ----
              Deferred like every other map in this app: the atlas is parsed once
              per session but the LAYOUT of a few hundred arcs is not free, and
              doing it while the cards above are mid-animation is what makes a
              page hitch a second after it appears. */}
          <Reveal from="down">
            <section>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">Everywhere you have been</h2>
                <p className="text-xs text-smoke">
                  {stats.routes.length} {stats.routes.length === 1 ? 'route' : 'routes'} · {stats.airports} airports
                </p>
              </div>
              <WhenVisible rootMargin="1000px" fallback={<div className="aspect-[11/6] w-full animate-pulse rounded-card bg-cloud/70" />}>
                <FlightMap routes={stats.routes} airports={stats.pins} />
              </WhenVisible>
            </section>
          </Reveal>

          {/* ---- THIS YEAR VERSUS LAST YEAR ---- */}
          {yearRow(thisYear) && yearRow(lastYear) && (
            <Reveal from="down">
              <section>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold">{thisYear} against {lastYear}</h2>
                    <p className="mt-0.5 text-sm text-smoke">
                      {thisYear} is still running, so the two are not the same length of year.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCompare((v) => !v)}
                    className="shrink-0 text-sm font-medium text-brand transition-transform duration-200 hover:scale-105"
                  >
                    {compare ? 'Hide the comparison' : 'Compare the two →'}
                  </button>
                </div>
                {compare && (
                  <div className="grid animate-fade-up gap-4 sm:grid-cols-2">
                    <YearColumn title={thisYear} data={yearRow(thisYear)} other={yearRow(lastYear)} lead />
                    <YearColumn title={lastYear} data={yearRow(lastYear)} />
                  </div>
                )}
              </section>
            </Reveal>
          )}

          {/* ---- THE RECORDS WALL ---- */}
          <Reveal from="down">
            <section>
              <h2 className="mb-1 text-lg font-semibold">Your records</h2>
              <p className="mb-3 text-sm text-smoke">
                Every one of these is already in your log. Nothing here was typed in.
              </p>
              <Reveal className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" stagger={0.05}>
                {r.longest && (
                  <RecordCard icon="plane" tone="brand" label="Longest flight"
                    value={`${km(r.longest.dist)} km`}
                    detail={`${r.longest.from.iata} to ${r.longest.to.iata} · ${formatDate(r.longest.flown_on)}`} />
                )}
                {r.shortest && (
                  <RecordCard icon="pin" label="Shortest hop"
                    value={`${km(r.shortest.dist)} km`}
                    detail={`${r.shortest.from.iata} to ${r.shortest.to.iata} · ${humanHours(r.shortest.mins)}`} />
                )}
                {r.longestTime && (
                  <RecordCard icon="clock" label="Longest time in the air"
                    value={humanHours(r.longestTime.mins)}
                    detail={`${r.longestTime.from.city} to ${r.longestTime.to.city}`} />
                )}
                {r.turnaround && (
                  <RecordCard icon="sparkles" label="Fastest turnaround"
                    value={r.turnaround.days === 0 ? 'Same day' : `${r.turnaround.days} ${r.turnaround.days === 1 ? 'day' : 'days'}`}
                    // WHEN YOU LANDED AND LEFT THE SAME PLACE, SAY THE PLACE
                    // ONCE. It read "OPO in, OPO out", which is the same airport
                    // twice and is how a connection looks in a database rather
                    // than how it looks in a life.
                    detail={r.turnaround.first.to.iata === r.turnaround.second.from.iata
                      ? `Straight back out of ${r.turnaround.first.to.iata}`
                      : `${r.turnaround.first.to.iata} in, ${r.turnaround.second.from.iata} out`} />
                )}
                {r.busiestMonth && (
                  <RecordCard icon="calendar" label="Busiest month"
                    value={monthLabel(r.busiestMonth.key)}
                    detail={`${r.busiestMonth.flights} flights · ${km(r.busiestMonth.distance)} km`} />
                )}
                {r.busiestDay && (
                  <RecordCard icon="chart" label="Most in one day"
                    value={`${r.busiestDay.flights} flights`}
                    detail={formatDate(r.busiestDay.date)} />
                )}
                {r.biggestShift && r.biggestShift.shift !== 0 && (
                  <RecordCard icon="globe" label="Biggest clock change"
                    value={`${r.biggestShift.shift > 0 ? '+' : ''}${r.biggestShift.shift} hours`}
                    detail={`${r.biggestShift.from.iata} to ${r.biggestShift.to.iata}`} />
                )}
                {r.biggestYear && (
                  <RecordCard icon="trophy" label="Biggest year"
                    value={r.biggestYear.year}
                    detail={`${km(r.biggestYear.distance)} km over ${r.biggestYear.flights} flights`} />
                )}
                {stats.topRoute && (
                  <RecordCard icon="reorder" label="Most flown route"
                    value={stats.topRoute.pair}
                    detail={`${stats.topRoute.n} ${stats.topRoute.n === 1 ? 'time' : 'times'}`} />
                )}
                {stats.topAirport && (
                  <RecordCard icon="home" label="Home airport"
                    value={stats.topAirport.iata}
                    detail={`${stats.topAirport.city} · ${stats.topAirport.n} flights`} />
                )}
                <RecordCard icon="clock" label="Average year"
                  value={humanHours(stats.avgMinutesPerYear)}
                  detail={`${km(stats.avgKmPerYear)} km across ${stats.activeYears} ${stats.activeYears === 1 ? 'year' : 'years'} of flying`} />
                <RecordCard icon="chartPie" label="Average flight"
                  value={`${km(stats.distance / stats.flights)} km`}
                  detail={humanHours(stats.minutes / stats.flights)} />
                {/* KILOGRAMS UNTIL TONNES MEAN SOMETHING. One short-haul hop is
                    about 200kg, which rounds to zero tonnes, and a card reading
                    "0" under a flight somebody just logged says the page is
                    broken rather than that the number is small. */}
                <RecordCard icon="globe" label="Carbon, roughly"
                  value={stats.co2 >= 1000 ? `${(stats.co2 / 1000).toFixed(1)} t` : `${km(stats.co2)} kg`}
                  detail="per seat, estimated" />
                {r.first && (
                  <RecordCard icon="flag" label="First in the log"
                    value={formatDate(r.first.flown_on)}
                    detail={`${r.first.from.iata} to ${r.first.to.iata}`} />
                )}
              </Reveal>
            </section>
          </Reveal>

          {/* ---- TRAVEL STREAK ---- */}
          {stats.streak.best > 1 && (
            <Reveal from="down">
              <section>
                <h2 className="mb-3 text-lg font-semibold">Your streak</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-card border border-brand/25 bg-brand-tint/25 p-5">
                    <p className="flex items-baseline gap-2 text-3xl font-bold tabular-nums text-brand">
                      <CountUp value={stats.streak.current} />
                      <span className="text-sm font-semibold">{stats.streak.current === 1 ? 'month' : 'months'}</span>
                    </p>
                    <p className="mt-1 text-xs font-semibold text-smoke">Flying right now</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      {stats.streak.current > 0
                        ? `Every month since ${monthLabel(stats.streak.since)}`
                        : `Nothing since ${monthLabel(stats.streak.lastMonth)}. One flight starts it again.`}
                    </p>
                  </div>
                  <div className="rounded-card border border-gray-100 bg-white p-5 shadow-card">
                    <p className="flex items-baseline gap-2 text-3xl font-bold tabular-nums">
                      <CountUp value={stats.streak.best} />
                      <span className="text-sm font-semibold text-smoke">{stats.streak.best === 1 ? 'month' : 'months'}</span>
                    </p>
                    <p className="mt-1 text-xs font-semibold text-smoke">Longest run</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">Consecutive months with a flight in them</p>
                  </div>
                  <div className="rounded-card border border-gray-100 bg-white p-5 shadow-card">
                    <p className="text-3xl font-bold tabular-nums"><CountUp value={stats.activeYears} /></p>
                    <p className="mt-1 text-xs font-semibold text-smoke">Years in the log</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      {r.first ? `Since ${formatDate(r.first.flown_on)}` : ''}
                    </p>
                  </div>
                </div>
                {/* A STREAK IS A MONTH, NOT A DAY. Nobody flies daily, and a
                    streak that resets because you were at home on Tuesday is a
                    streak that punishes having a life. */}
                <p className="mt-2 text-[11px] text-gray-400">
                  A month counts once you have flown in it. The current month never breaks a streak.
                </p>
              </section>
            </Reveal>
          )}

          {/* ---- AIRLINE LOYALTY ---- */}
          {stats.loyalty.length > 0 && (
            <Reveal from="down">
              <section>
                <h2 className="mb-1 text-lg font-semibold">Airline loyalty</h2>
                <p className="mb-3 text-sm text-smoke">
                  Ranked by how often you actually fly them, which is not always the one you have the card for.
                </p>
                <Reveal className="space-y-2.5" stagger={0.04}>
                  {stats.loyalty.slice(0, 8).map((a, i) => (
                    <LoyaltyRow key={a.name} a={a} rank={i} max={stats.loyalty[0].flights} />
                  ))}
                </Reveal>
              </section>
            </Reveal>
          )}

          {/* ---- THE AIRCRAFT COLLECTION, AS A DOOR ---- */}
          <Reveal from="down">
            <section>
              <Link
                to="/flights/aircraft"
                className="group flex flex-wrap items-center gap-5 rounded-card border border-gray-100 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift sm:p-6"
              >
                <div className="flex -space-x-2">
                  {stats.aircraftSeen.filter((a) => a.type).slice(0, 4).map((a) => (
                    <span key={a.name} className="h-12 w-16 shrink-0">
                      <AircraftArt type={a.type} />
                    </span>
                  ))}
                  {stats.aircraftSeen.filter((a) => a.type).length === 0 && (
                    <span className="h-12 w-16 shrink-0"><AircraftArt type={{ body: 'narrowbody' }} owned={false} /></span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold group-hover:text-brand">Aircraft collection</p>
                  <p className="mt-0.5 text-sm text-smoke">
                    {stats.aircraft > 0
                      ? `${stats.aircraft} ${stats.aircraft === 1 ? 'type' : 'types'} flown out of ${Object.keys(AIRCRAFT).length} in the book.`
                      : 'Every type in the book, and the ones you have been on. Add an aircraft to a flight to start it.'}
                  </p>
                </div>
                <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </section>
          </Reveal>

          {/* ---- WHO ELSE FLIES YOUR ROUTES ---- */}
          {Object.keys(flyers).length > 0 && (
            <Reveal from="down">
              <section>
                <h2 className="mb-1 text-lg font-semibold">Others on your routes</h2>
                <p className="mb-3 text-sm text-smoke">
                  Creators who have flown the same pair of airports and chosen to show it. Their dates and notes stay private.
                </p>
                <Reveal className="grid gap-3 sm:grid-cols-2" stagger={0.05}>
                  {topRoutes.filter((rt) => flyers[rt.key]).map((rt) => (
                    <div key={rt.key} className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
                      <p className="flex items-center gap-2 text-sm font-bold tracking-wider text-brand">
                        {rt.from.iata}
                        <Icon name="plane" className="h-3.5 w-3.5 text-gray-300" />
                        {rt.to.iata}
                        <span className="ml-auto text-[11px] font-medium normal-case tracking-normal text-smoke">
                          {flyers[rt.key].length} other {flyers[rt.key].length === 1 ? 'creator' : 'creators'}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-smoke">{rt.from.city} to {rt.to.city}</p>
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                        {flyers[rt.key].slice(0, 6).map((p) => (
                          <Link
                            key={p.creator_id}
                            to={`/profile/${p.creator_id}`}
                            className="flex items-center gap-2 rounded-full bg-cloud py-1 pl-1 pr-3 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-tint hover:text-brand"
                          >
                            <Avatar src={p.photo_url} name={p.name} size="xs" />
                            <span className="max-w-[8rem] truncate">{p.name.split(' ')[0]}</span>
                            {Number(p.flights) > 1 && <span className="text-smoke">{p.flights}×</span>}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </Reveal>
              </section>
            </Reveal>
          )}

          {/* ---- COMMUNITY LEADERBOARDS ---- */}
          <Reveal from="down">
            <section>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Across the community</h2>
                  <p className="mt-0.5 text-sm text-smoke">
                    Only flights their owner has chosen to share. Yours are in here if you ticked the box.
                  </p>
                </div>
                <Segmented
                  value={boardWindow}
                  onChange={setBoardWindow}
                  options={[{ value: 'year', label: thisYear }, { value: 'all', label: 'All time' }]}
                />
              </div>
              {!boards ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56" />)}
                </div>
              ) : boards.distance.length === 0 ? (
                <div className="rounded-card border border-dashed border-gray-200 px-5 py-8 text-center text-sm text-smoke">
                  Nobody is sharing flights yet. Tick the box when you log one and you will be the first.
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    { key: 'distance', title: 'Furthest', icon: 'globe', rows: boards.distance, value: (b) => `${km(b.km)} km` },
                    { key: 'countries', title: 'Most countries', icon: 'flag', rows: boards.countries, value: (b) => `${b.countries}` },
                    { key: 'flights', title: 'Most flights', icon: 'plane', rows: boards.flights, value: (b) => `${b.flights}` },
                  ].map((col) => (
                    <div key={col.key} className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
                      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                        <Icon name={col.icon} className="h-4 w-4 text-brand" />
                        {col.title}
                      </p>
                      <ol className="space-y-2">
                        {col.rows.map((b, i) => (
                          <li key={b.creator_id} className="flex items-center gap-2.5">
                            <span className={cx(
                              'w-4 shrink-0 text-xs font-bold tabular-nums',
                              i === 0 ? 'text-brand' : 'text-gray-300',
                            )}>{i + 1}</span>
                            <Avatar src={b.photo_url} name={b.name} size="xs" />
                            <Link to={`/profile/${b.creator_id}`} className="min-w-0 flex-1 truncate text-xs font-medium hover:text-brand">
                              {b.name}
                            </Link>
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-smoke">{col.value(b)}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </Reveal>

          {/* ---- Why you were flying ---- */}
          {stats.list.some((f) => f.purpose) && (
            <Reveal from="down">
              <section>
                <h2 className="mb-3 text-lg font-semibold">Why you were flying</h2>
                <div className="card !p-5 sm:!p-6">
                  <PurposeBar list={stats.list} />
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
                <p className="text-xs text-smoke">{stats.flights} logged</p>
              </div>
              <Reveal className="space-y-2.5" stagger={0.03}>
                {visible.map((f) => (
                  <div key={f.id} className="card group flex flex-wrap items-center gap-x-4 gap-y-2 !p-4">
                    {/* THE PHOTOGRAPH IS THE FIRST THING ON THE ROW.
                        One image per trip, and it is the only part of a flight
                        anybody wants to look at again - so it leads, and a row
                        without one simply starts at the codes rather than
                        holding an empty frame open. */}
                    {f.photo_url && (
                      <img
                        src={f.photo_url}
                        alt=""
                        loading="lazy"
                        className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-black/5"
                      />
                    )}
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
                          {formatDate(f.flown_on)}
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
                      {f.share_with_community && (
                        <span title="Shared with the community" className="text-smoke">
                          <Icon name="users" className="h-3.5 w-3.5" />
                        </span>
                      )}
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
              {stats.flights > 12 && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-card border border-gray-100 bg-white py-3 text-sm font-semibold text-brand shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
                >
                  {showAll ? 'Show fewer' : `Show all ${stats.flights} flights`}
                </button>
              )}
            </section>
          </Reveal>
        </div>
      )}

      {/* ---- Log a flight ---- */}
      <Modal open={adding} onClose={() => setAdding(false)} title="Log a flight" wide sheet={false}>
        <form onSubmit={save} className="space-y-5">
          {/* THE BOARDING PASS IS THE FORM'S ANSWER, AND IT IS AT THE TOP.
              It used to be a tinted panel of facts under the two airport
              fields. Putting it first, and building it as you type, is what
              makes this feel like watching a flight appear rather than filling
              in a form: everything on it comes from the two codes and the date,
              and nothing on it is ever typed. */}
          <BoardingPass
            from={fromA}
            to={toA}
            facts={facts}
            dateStr={form.flown_on}
            airlineName={form.airline}
            flightNo={form.flight_number}
            seat={form.seat}
            aircraftType={pickedPlane}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AirportField id="flight-from" label="From" value={form.from_iata} autoFocus
              onChange={(v) => setForm((f) => ({ ...f, from_iata: v }))} />
            <AirportField id="flight-to" label="To" value={form.to_iata}
              onChange={(v) => setForm((f) => ({ ...f, to_iata: v }))} />
          </div>

          {/* A ROUND TRIP IS TWO FLIGHTS, and logging it is one tick. It saves
              as two rows, because a return has its own date and its own
              distance and folding it into one row would halve everybody's
              totals. */}
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
                hint="Saved as its own flight, so the distance counts twice."
                onChange={(v) => setForm((f) => ({ ...f, return_on: v }))} />
              {form.flown_on && form.return_on && form.return_on < form.flown_on && (
                <p className="self-end pb-2.5 text-[11px] text-red-500">
                  The return is before the outbound. Check the dates.
                </p>
              )}
            </div>
          )}

          {/* ---- WHO FLIES IT ----
              A SHORTLIST OF REAL CANDIDATES INSTEAD OF AN EMPTY BOX. This was a
              text field labelled "Airline (optional)", and the honest thing to
              say about an optional text field asking for a fact you have to
              remember is that almost nobody fills it in - which is why the
              "Airlines" statistic on this page read zero for everybody. */}
          {previewKm > 0 && (
            <div>
              <p className="label">Airline <span className="font-normal text-smoke">(optional)</span></p>
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

          {/* ---- AIRCRAFT, WITH THE AIRCRAFT ON IT ----
              The chips carry the type's own silhouette now. It costs nothing -
              the drawing is the same component the collection page is built
              from - and it turns a row of model numbers, which only a spotter
              can tell apart, into a row of shapes anybody can. */}
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
                        'inline-flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-3 text-xs font-semibold transition-all duration-200 active:scale-95',
                        on ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:-translate-y-0.5 hover:text-ink',
                      )}
                    >
                      <span className={cx('h-5 w-7 shrink-0', on && 'text-white')}>
                        <AircraftArt type={p} className={on ? '[&>g]:!text-white' : undefined} />
                      </span>
                      {p.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="flight-number" className="label">Flight no.</label>
              <input id="flight-number" maxLength={10}
                value={form.flight_number}
                placeholder={picked ? `${picked.iata}1363` : 'TP1363'}
                onChange={(e) => setForm((f) => ({ ...f, flight_number: e.target.value }))} className="input w-full" />
            </div>
            {/* SEAT. The one detail people actually remember, and the one that
                makes a row read like a memory rather than a database entry. */}
            <div>
              <label htmlFor="flight-seat" className="label">Seat</label>
              <input id="flight-seat" maxLength={8} value={form.seat} placeholder="14A"
                onChange={(e) => setForm((f) => ({ ...f, seat: e.target.value.toUpperCase() }))} className="input w-full" />
            </div>
            <div className="col-span-2">
              <label htmlFor="flight-note" className="label">Note</label>
              <input id="flight-note" value={form.note} maxLength={140} placeholder="Sunrise over the Alps"
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="input w-full" />
            </div>
          </div>

          {/* ---- WHY YOU WENT ----
              The one question a creator programme's flight log should be able to
              answer and no other page can: how much of your flying is work. */}
          <div>
            <p className="label">What for? <span className="font-normal text-smoke">(optional)</span></p>
            <div className="flex flex-wrap gap-1.5">
              {PURPOSES.map((p) => {
                const on = form.purpose === p.key
                return (
                  <button key={p.key} type="button"
                    onClick={() => setForm((f) => ({ ...f, purpose: on ? '' : p.key }))}
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
                      on ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:-translate-y-0.5 hover:text-ink',
                    )}
                  >
                    <Icon name={p.icon} className="h-3.5 w-3.5" />
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ---- ONE PHOTOGRAPH ----
              Ethan: "photos of flight/trip, one image per trip." ONE, not a
              gallery: the travel gallery on a profile already exists and a
              second one attached to flights would be two places to put the same
              picture. It is also the only part of a logged flight anybody ever
              wants to look at again, which is why it gets the front of the row
              in the log rather than a link. */}
          <div>
            <p className="label">A photo from the trip <span className="font-normal text-smoke">(optional)</span></p>
            {form.photo_url ? (
              <div className="relative inline-block">
                <img src={form.photo_url} alt="" className="h-32 w-48 rounded-xl object-cover ring-1 ring-black/5" />
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, photo_url: '' }))}
                  aria-label="Remove this photo"
                  className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-smoke shadow-card transition-transform hover:scale-110"
                >
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <label className={cx(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-4 py-6 text-center transition-colors hover:border-brand/50 hover:bg-brand-tint/20',
                uploading && 'pointer-events-none opacity-60',
              )}>
                <input type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
                {uploading ? <Spinner /> : <Icon name="image" className="h-6 w-6 text-gray-300" />}
                <span className="text-xs font-medium text-smoke">
                  {uploading ? 'Uploading…' : 'Add one picture from this trip'}
                </span>
              </label>
            )}
          </div>

          {/* ---- SHARING ----
              WHAT THIS DOES AND DOES NOT SHARE, said in the words of the thing
              it does. The community pages built on this (who else flies your
              routes, the leaderboards) read ONLY the airports, the count and the
              distance of rows this is ticked on - never a date, a seat, a note
              or a photograph. See migration 103 for the policy that enforces
              that rather than merely promising it. */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 transition-colors hover:border-brand/40">
            <input
              type="checkbox"
              checked={form.share}
              onChange={(e) => setForm((f) => ({ ...f, share: e.target.checked }))}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#d94407]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Count this towards the community</span>
              <span className="block text-[11px] leading-snug text-smoke">
                Other creators can see that you have flown this route, and it counts on the leaderboards.
                Your dates, seat, note and photo stay private either way.
              </span>
            </span>
          </label>

          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setAdding(false)} className="btn-ghost w-full justify-center sm:w-auto">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary w-full justify-center sm:w-auto">
              {saving ? <Spinner /> : 'Add to my log'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ---- The collab board offer ---- */}
      <Modal open={!!offer} onClose={() => setOffer(null)} title="Tell the community?">
        {offer && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-card border border-brand/25 bg-brand-tint/25 p-4">
              <Icon name="pin" className="h-5 w-5 shrink-0 text-brand" />
              <p className="text-sm">
                <span className="font-semibold">{offer.city}</span>
                <span className="text-smoke">, {formatDate(offer.start)} to {formatDate(offer.end)}</span>
              </p>
            </div>
            <p className="text-sm text-smoke">
              Post it on the collab board and anybody who is there at the same time can say so. The dates come
              from the flight you just logged and you can change them on the board afterwards.
            </p>
            <div>
              <label htmlFor="collab-note" className="label">What are you up for?</label>
              <textarea
                id="collab-note"
                rows={3}
                className="input w-full"
                maxLength={280}
                value={offer.note}
                placeholder="Filming around the old town, up for a coffee or a shoot with anyone nearby."
                onChange={(e) => setOffer((o) => ({ ...o, note: e.target.value }))}
              />
              <p className="mt-1 text-[11px] text-gray-400">
                A trip nobody can act on is not worth posting, so this one is not optional.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setOffer(null)} className="btn-ghost w-full justify-center sm:w-auto">
                Not this time
              </button>
              <button
                type="button"
                onClick={postToCollab}
                disabled={!offer.note.trim()}
                className="btn-primary w-full justify-center disabled:opacity-40 sm:w-auto"
              >
                Post to the collab board
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// A SINGLE HUE STEPPED IN OPACITY rather than six colours: the palette here is
// one orange, and six arbitrary colours would be six things to learn.
function PurposeBar({ list }) {
  const counts = PURPOSES
    .map((p) => ({ ...p, n: list.filter((f) => f.purpose === p.key).length }))
    .filter((p) => p.n > 0)
  const total = counts.reduce((s, x) => s + x.n, 0) || 1
  return (
    <>
      <div className="flex h-3 overflow-hidden rounded-full bg-cloud">
        {counts.map((p, i) => (
          <span
            key={p.key}
            title={`${p.label}: ${p.n}`}
            style={{ width: `${(p.n / total) * 100}%`, opacity: 1 - i * 0.14 }}
            className="block bg-brand transition-[width] duration-700 ease-out"
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {counts.map((p, i) => (
          <span key={p.key} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" style={{ opacity: 1 - i * 0.14 }} />
            <span className="font-medium text-ink">{p.label}</span>
            <span className="tabular-nums text-smoke">{p.n}</span>
          </span>
        ))}
      </div>
    </>
  )
}
