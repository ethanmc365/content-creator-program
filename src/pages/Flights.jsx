import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, Badge, EmptyState, Modal, PageHeader, Skeleton, Spinner } from '../components/ui'
import { DateField } from '../components/DateTimeFields'
import AirlineMark from '../components/network/AirlineMark'
import Icon from '../components/Icon'
import Reveal from '../components/network/Reveal'
import ScanBoardingPass from '../components/network/ScanBoardingPass'
import { CountUp } from '../components/network/Motion'
import WhenVisible from '../components/WhenVisible'
import FlightMap from '../components/network/FlightMap'
import MapSkeleton from '../components/network/MapSkeleton'
import PhotoLightbox from '../components/PhotoLightbox'
import AircraftArt from '../components/network/AircraftArt'
import { confirm, notice } from '../lib/confirm'
import { toast } from '../lib/toast'
import { airport, searchAirports, distanceKm, estimateMinutes, bearing, compass, haul, co2Kg, homeAirport } from '../lib/airports'
import { NO_AUTOFILL, NO_AUTOFILL_SEARCH } from '../lib/noAutofill'
import { routeAirlines, aircraftFor, anyAircraftFor, airlineByName, continentOf, AIRCRAFT } from '../lib/airlines'
import { tripsFromFlights, buildFlightStats, humanHours, clockShift, MONTHS } from '../lib/flightStats'
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
  // SOLO TRAVEL, NOT COMMUTE (migration 152). Ethan: "redo the 'commute'
  // option and icon to Solo Travel instead as I'd say that's a more popular
  // option." A commute is a handful of creators flying the same hop for work;
  // travelling alone is something a large part of this community does and had
  // nowhere to go but Holiday or Other. The stored value changed with the
  // label - see the migration for why printing a new word over an old key is
  // the version of this that goes wrong later.
  { key: 'solo', label: 'Solo travel', icon: 'user' },
  { key: 'other', label: 'Other', icon: 'dots' },
]
const PURPOSE_LABEL = Object.fromEntries(PURPOSES.map((p) => [p.key, p.label]))

// THE SIX-ORANGE RAMP IS GONE WITH THE BAR IT COLOURED.
//
// It existed to make the segments of a stacked purpose bar tell each other
// apart, and it was rebuilt once for exactly that: the first version stepped one
// orange down by 14% of alpha per segment, which is a difference you can measure
// and cannot see. The replacement was six real values walked from a burnt orange
// to a pale one, and they did read as six colours.
//
// The bar is now six cards (see PurposeBar), which need no ramp at all: a number
// on a card says "four" without anybody having to match a swatch to a segment.
// Deleting the constant rather than leaving it is deliberate - a colour scale
// with no chart to scale is the sort of thing that gets reused by accident.


// One shape, declared once. `save` resets to it and the modal's Cancel does
// too, so there is no list of fields to keep in step in three places.
// THERE IS NO `share` FIELD ANY MORE.
//
// It was a tick-box at the foot of the form - "Count this towards the
// community" - defaulting to on. Ethan: "don't have a separate button saying
// count this to the community, everything will show up in the community, don't
// need to say anything." Every flight is written with
// `share_with_community: true` now and the control is gone.
// What that does and does not mean is unchanged and worth restating, because
// removing a consent control is not a small thing: the community pages read
// ONLY who flew, how many times, how far and between which airports. Never a
// date, a seat, a flight number, a note or a photograph, and never a flight
// that has not happened yet. See migrations 103 and 104 for the policy that
// enforces it rather than promising it.
const BLANK_FORM = {
  from_iata: '', to_iata: '', flown_on: '', airline: '', flight_number: '',
  aircraft: '', note: '', seat: '', purpose: '', purpose_note: '',
  // `first_leg` says WHICH WAY ROUND the trip went. See the direction picker
  // in the form: `flown_on` is always the FIRST leg's date and `return_on`
  // always the second's, and this decides which pair of codes goes on which.
  round_trip: false, return_on: '', first_leg: 'out',
  photo_url: '',
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
      {/* THE PLACEHOLDER USED TO SAY "city" AND THAT WAS THE WHOLE PROBLEM.
          Safari's AutoFill classifier reads placeholders, and one address word
          in one was enough to put a home address above the keyboard on every
          airport lookup. Two examples say what the abstract noun did, and
          neither is a word an address book knows. See lib/noAutofill. */}
      <input
        id={id}
        value={query}
        autoFocus={autoFocus}
        {...NO_AUTOFILL_SEARCH}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Code or place, e.g. LIS or Lisbon"
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

// The date field used to live HERE, as a private DatePart/DateField pair, and
// then the same control was needed by the calendar, by "find a time" and by the
// challenge form - so it was copied. Four copies of a control is four places for
// its behaviour to drift, and it did: only this one moved the caret on its own.
// It is `components/DateTimeFields` now and every date box on the platform is
// the same one. See that file for why it is not `<input type="date">`.

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
  // A STRAIGHT LINE, AND THE PLANE IS THE THING MOVING ALONG IT.
  //
  // A great-circle route drawn on a MAP curves because the map is a projection
  // of a sphere. In a box between two words it is not a projection of anything,
  // so a curve there is decoration that reads as a wobble. Straight is also what
  // a departure board draws, which is the object this is imitating.
  //
  // Where the line LIVES is in the markup below; how the plane moves along it is
  // in index.css (`pass-plane-fly`).
  return (
    <div className="overflow-hidden rounded-card border border-brand/25 bg-white shadow-card">
      {/* The stub across the top: brand, and the two codes with the aircraft
          between them, which is the one line of a boarding pass anybody
          actually reads. */}
      <div className="relative overflow-hidden bg-gradient-to-br from-brand to-brand-light px-5 py-4 text-white">
        <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        {/* THE CODES ON ONE ROW, THE ROUTE UNDER THEM, EDGE TO EDGE.
            The owner, twice: "you made it much shorter and it doesn't look as
            good", and "I said the dotted line with the animated airplane should
            go from the airport code to the other airport code but you still
            have it small in the middle."
            Both are the same fault. The line was a flex sibling BETWEEN the two
            code blocks, so it only ever got whatever width was left over after
            two 4xl codes and two city names had taken theirs - about a third of
            the card on a phone - and squeezing it in there is what flattened the
            whole stub. Now the codes are a row of their own and the route is a
            full-width band beneath them, anchored under DUB and under BUD. The
            plane has the whole card to cross. */}
        {/* THE ROUTE RUNS BETWEEN THE CODES, LEVEL WITH THEM.
            Ethan drew a red line across the screenshot to say where: from the
            right edge of DUB to the left edge of LIS, at the height of the
            codes. It had been a full-width band UNDER the codes with a white
            dot at each end, so the plane crossed the whole card while the two
            dots - not the codes - read as the airports.

            Three rows rather than two columns is what makes that possible.
            Labels, then codes-with-the-route-between-them on a single
            `items-center` row, then cities. The route is the flex child that
            grows, so it takes every pixel the two three-letter codes do not,
            which is most of the card - the previous attempt put the line
            BETWEEN two full From/To blocks, where it got only the leftovers
            after two 5xl codes and two city names, and that is why it came out
            "small in the middle". */}
        <div className="relative">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">From</p>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">To</p>
          </div>

          <div className="mt-0.5 flex items-center gap-3">
            <p className="shrink-0 text-4xl font-bold leading-none tracking-wider sm:text-5xl">{from?.iata || '– – –'}</p>

            <div className="relative h-8 min-w-0 flex-1">
              {/* The dashes stretch; the plane must not, so they are separate
                  layers. `vectorEffect` keeps the stroke 1.4px at any width. */}
              <svg viewBox="0 0 400 32" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
                <path d="M0 16 L 400 16" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" strokeDasharray="6 8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
              {from && to && (
                <span className="pass-plane-fly">
                  {/* A PLAIN WHITE PLANE, NOT THE BRAND ONE.
                      It was the tryp.com plane photograph, which was asked for
                      and then read back badly at this size: a 40px photo of an
                      aircraft on a moving element is a grey-and-white smudge
                      with a shadow under it, and the thing it is meant to say -
                      "something is flying along this line" - was the part that
                      got lost. Ethan: "keep the animation the same, the line the
                      same, but change the tryp.com airplane to a standard just
                      white icon airplane. I think it'll look more clear and
                      simple."
                      So: a flat silhouette in pure white, which holds its shape
                      at any size and needs no drop shadow to sit on the orange.
                      `plane-flight` is nose-up like every plane glyph in the
                      set, and the line runs left to right, so `.pass-plane-img`
                      turns it a quarter. */}
                  <Icon
                    name="plane-flight"
                    className="pass-plane-img h-[26px] w-[26px] text-white sm:h-[30px] sm:w-[30px]"
                  />
                </span>
              )}
            </div>

            <p className="shrink-0 text-4xl font-bold leading-none tracking-wider sm:text-5xl">{to?.iata || '– – –'}</p>
          </div>

          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-xs text-white/80">{from?.city || 'Where you left'}</p>
            <p className="min-w-0 truncate text-right text-xs text-white/80">{to?.city || 'Where you went'}</p>
          </div>
        </div>
      </div>

      {/* A PLAIN DASHED RULE, AND NO NOTCHES.
          There were two half-circles hanging off the edges to suggest a
          perforation. Ethan: "there's like two half circles on either side which
          look bad. Not sure why they're there." They were pinned outside the
          card, so on any background that was not white they were two white
          blobs floating beside it - and the card is `overflow-hidden`, so they
          were clipped into quarter-circles as often as not. */}
      <div className="border-t border-dashed border-brand/30 px-5 py-4">
        {/* CENTRED, AND EVENLY SPLIT. Six fields in a 3-up grid left two of them
            alone on a second row hanging to the left. */}
        <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-center sm:grid-cols-6">
          <PassField label="Date" value={dateStr ? formatDate(dateStr) : '—'} />
          <PassField label="Flight" value={flightNo?.trim().toUpperCase() || (airlineName ? airlineName.split(' ')[0] : '—')} />
          <PassField label="Seat" value={seat?.trim().toUpperCase() || '—'} />
          <PassField label="Distance" value={facts ? `${km(facts.dist)} km` : '—'} />
          {/* NO "estimated" HINT. Ethan: "remove that." Everything on this pass
              is derived from two airport codes and it says so nowhere else
              either; one field apologising for itself just draws the eye. */}
          <PassField label="In the air" value={facts ? humanHours(facts.mins) : '—'} />
          <PassField
            label="Clocks"
            value={!facts || facts.shift == null ? '—' : facts.shift === 0 ? 'No change' : `${facts.shift > 0 ? '+' : ''}${facts.shift}h`}
          />
        </dl>

        {facts && (
          // THE BADGES ARE CENTRED AND THE FLAGS ARE GONE.
          //
          // It ended with "🇮🇪 to 🇭🇺, international" - two flag emoji on a
          // platform whose rule is line icons and never emoji, saying something
          // the two airport codes eight pixels above already say. The row now
          // carries facts you could not work out by looking: how far a haul it
          // is, which way you are pointing, what it costs the atmosphere, and
          // how much of a day it eats.
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 border-t border-gray-100 pt-3">
            <Badge tone="light" className="!px-2.5 !py-1">{facts.haul}</Badge>
            <Badge tone="grey" className="!px-2.5 !py-1">{facts.direction} · {Math.round(facts.bearing)}°</Badge>
            <Badge tone="grey" className="!px-2.5 !py-1">{facts.co2} kg CO2</Badge>
            {aircraftType && (
              <Badge tone="grey" className="!px-2.5 !py-1">
                <span className="mr-1.5 inline-block h-4 w-6 align-middle"><AircraftArt type={aircraftType} /></span>
                {aircraftType.name}
              </Badge>
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
function LoyaltyRow({ a, max }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3 shadow-card transition-transform duration-200 hover:-translate-y-0.5">
      {/* THE AIRLINE, NOT ITS POSITION IN A LIST OF THREE.
          Ethan: "we don't need that because it's already filtered and has the
          number of times you fly on the right side." A rank badge on a sorted
          list is a label for something the order already says. */}
      <AirlineMark iata={a.iata} name={a.name} size={28} />
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
  const { user, profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [adding, setAdding] = useState(false)
  // THE SAME FORM OPENS THREE WAYS, and which one it is decides three things:
  // the title, whether the date may be in the future, and whether saving is an
  // insert or an update.
  //
  //   editing === null && !upcoming   a flight you have taken
  //   editing === null && upcoming    a flight you are going to take
  //   editing === <row>               a flight already in the log
  //
  // One form and not three, for the reason the board's ask/edit dialog is one
  // form: the fields are the same fields and the validation is the same
  // validation, so writing it twice only guarantees that the two drift.
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [showAllAirlines, setShowAllAirlines] = useState(false)
  const [scanning, setScanning] = useState(false)
  // WHO ELSE IS ON YOUR UPCOMING FLIGHTS. Keyed by flight id. See the
  // `same_flight` definer function: same route AND same day, both sides
  // sharing.
  const [sameFlight, setSameFlight] = useState({})
  const [form, setForm] = useState(BLANK_FORM)

  const [allAirlines, setAllAirlines] = useState(false)
  const [customAirline, setCustomAirline] = useState(false)
  const [customPlane, setCustomPlane] = useState(false)
  const [uploading, setUploading] = useState(false)
  // `today` in state, not computed in render: this repo's eslint bans clock
  // reads during render and it is right to.
  const [today] = useState(() => ymd(new Date()))
  // UPCOMING IS A FACT ABOUT THE DATE, NOT A MODE.
  //
  // This was a `useState` set by a pair of radio cards at the top of the form.
  // Two sources of truth for one fact, and the row itself only ever had one:
  // there is no `is_upcoming` column and there must not be one, because a
  // boolean would be wrong the morning after the flight (migration 104).
  // Deriving it means the form cannot disagree with the row it is about to
  // write, and it updates live as the date is typed - so the labels and the
  // save button change under your hands the moment you enter a future date.
  const upcoming = !!form.flown_on && form.flown_on > today
  // The year-on-year panel, off until asked for. See YearColumn.
  const [compare, setCompare] = useState(false)
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
  // Their home airport, for the form's default. Derived from the log first and
  // from their town second - see lib/airports.
  const homeIata = useMemo(
    () => homeAirport(rows || [], { lat: profile?.city_lat, lng: profile?.city_lng }),
    [rows, profile?.city_lat, profile?.city_lng],
  )

  // Only for flights not yet taken: "somebody was on your flight last March" is
  // a fact, and "somebody is on your flight on Tuesday" is a plan.
  useEffect(() => {
    const upcoming = stats.upcoming || []
    if (!upcoming.length) return undefined
    let cancelled = false
    ;(async () => {
      const out = {}
      for (const f of upcoming.slice(0, 8)) {
        const { data } = await supabase.rpc('same_flight', {
          p_from: f.from.iata, p_to: f.to.iata, p_on: f.flown_on,
        })
        if (cancelled) return
        if (data?.length) out[f.id] = data
      }
      if (!cancelled) setSameFlight(out)
    })()
    return () => { cancelled = true }
  }, [stats.upcoming])

  const thisYear = today.slice(0, 4)
  const lastYear = String(Number(thisYear) - 1)
  const yearRow = (y) => stats.years.find((x) => x.year === y) || null

  // WHO ELSE FLIES YOUR ROUTES AND THE COMMUNITY LEADERBOARDS ARE NOT READ
  // HERE ANY MORE. They were four RPCs (one per busy route, plus the board)
  // fired from a page that had already run three queries of its own, for two
  // sections at the very bottom that most people never scrolled to. They live
  // on /flights/community now and are loaded by the page that shows them.

  // ---- the form ------------------------------------------------------------
  // CAN THIS ROW GROW A SECOND LEG?
  //
  // Adding a flight: always. Editing one: only if it is not already half of a
  // pair, in either direction - a row that IS a return (`return_of` set) and a
  // row that already HAS one would both end up in a trip with three legs, and
  // `tripsFromFlights` pairs one return to one outbound. Those two cases are
  // exactly the rows whose leg home is already in the log, so there is nothing
  // being taken away from anybody.
  const canRoundTrip = !editing
    || (!editing.return_of && !(rows || []).some((x) => x.return_of === editing.id))
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

  // THE THREE WAYS IN. Each one seeds the form and says which mode it is, so
  // nothing downstream has to guess - and every one of them resets the two
  // airline-picker flags, which used to survive from the previous open and left
  // somebody editing a flight staring at a text box they had not asked for.
  function openNew() {
    // PREFILLED WITH WHERE YOU FLY FROM. See `homeAirport`: an empty "from"
    // field meant a Dublin creator typed DUB before every flight they have ever
    // logged. It is a default, not a lock - the field is a type-ahead and
    // clearing it is one gesture.
    setForm({ ...BLANK_FORM, from_iata: homeIata })
    setEditing(null)
    setError('')
    setCustomAirline(false)
    setCustomPlane(false)
    setAllAirlines(false)
    setAdding(true)
  }

  function openUpcoming() {
    setForm(BLANK_FORM)
    setEditing(null)
    setError('')
    setCustomAirline(false)
    setCustomPlane(false)
    setAllAirlines(false)
    setAdding(true)
  }

  // `/flights?log=upcoming` OPENS THE FORM ON THE FLIGHT YOU HAVE NOT TAKEN.
  //
  // This is what the collab board's "Post a trip" button now does: a trip you
  // are going on is a flight you are going to take, and the two were separate
  // things to type in two places. The flight log is the one that knows the
  // airports, the distance and the dates, and it already offers to post to the
  // board when you save - so the board sends you here and the loop closes.
  //
  // CONSUMED ONCE. A deep-link effect that keeps firing reopens the dialog
  // every time the page re-renders, and reopens it on a reload after you have
  // saved - the trap the challenge page's `?submit=1` hit first.
  const [params, setParams] = useSearchParams()
  const deepLinkedRef = useRef(false)
  useEffect(() => {
    if (deepLinkedRef.current) return
    const want = params.get('log')
    if (want !== 'upcoming' && want !== 'new') return
    deepLinkedRef.current = true
    if (want === 'upcoming') openUpcoming(); else openNew()
    const next = new URLSearchParams(params)
    next.delete('log')
    setParams(next, { replace: true })
    // openUpcoming is stable enough for this: it only ever calls setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  // EDITING A FLIGHT YOU HAVE ALREADY LOGGED.
  //
  // Ethan: "on the actual log at the bottom where it says every flight, as well
  // as being able to delete it, I should be able to re-edit and make changes."
  // Until now the only way to fix a typo in a date was to delete the row and
  // type the whole thing again - which is exactly the trade the community board
  // was given an edit dialog to avoid.
  //
  // A ROUND TRIP THAT ALREADY HAS BOTH LEGS IS STILL NOT EDITABLE AS A PAIR,
  // and that is deliberate rather than unfinished: the return is its OWN row
  // with its own date and its own distance (see `save`), so it appears in the
  // log on its own line and is edited there. Offering to edit "the trip" would
  // mean deciding what happens when somebody changes the outbound's airports
  // out from under a return that still points at them.
  //
  // BUT A ONE-WAY ROW CAN BE TURNED INTO A ROUND TRIP FROM HERE (1 Sep 2026).
  // Ethan: "when logging an already logged trip on flight log I seem to be
  // unable to select it as a round trip, which I want to be able to do." The
  // tick box was simply hidden whenever `editing` was set, so the only way to
  // add the leg home to a flight already in the log was to type a whole second
  // flight by hand. See `canRoundTrip` for the two rows it stays hidden for.
  function openEdit(f) {
    setForm({
      from_iata: f.from_iata || '',
      to_iata: f.to_iata || '',
      flown_on: f.flown_on || '',
      airline: f.airline || '',
      flight_number: f.flight_number || '',
      aircraft: f.aircraft || '',
      note: f.note || '',
      seat: f.seat || '',
      purpose: f.purpose || '',
      purpose_note: f.purpose_note || '',
      round_trip: false,
      return_on: '',
      first_leg: 'out',
      photo_url: f.photo_url || '',
    })
    setEditing(f)
    setError('')
    // An airline that is not in the fleet table can only have been typed, so
    // the picker opens on the text box rather than losing what is there.
    setCustomAirline(!!f.airline && !airlineByName(f.airline))
    // Same rule for the aircraft: a type that is not in the book can only have
    // been typed, so the picker opens on the text box rather than losing it.
    setCustomPlane(!!f.aircraft && !Object.values(AIRCRAFT).some((a) => a.name.toLowerCase() === f.aircraft.toLowerCase()))
    setAllAirlines(false)
    setAdding(true)
  }

  function closeForm() {
    setAdding(false)
    setEditing(null)
    setError('')
  }

  async function pickPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      // Same `gallery` bucket as the travel photos, and until 24 Aug 2026 this
      // was the call still writing JPEG into it. WebP is the default now.
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
    if (!form.flown_on) { setError(upcoming ? 'Add the date you fly.' : 'Add the date you flew.'); return }
    // WHICH DIRECTION THE DATE IS ALLOWED TO POINT IS THE MODE, and it is the
    // only thing the mode changes about validation. A logged flight in the
    // future is somebody who has picked the wrong year; an upcoming flight in
    // the past is a flight they have already taken and should simply log.
    // No date check on direction any more: a future date simply makes this an
    // upcoming flight, which is the whole point of removing the toggle.
    // No direction check at all now. A past date is a flown flight and a future
    // date is an upcoming one, and both are valid things to be saving.
    // EVERYTHING NOT MARKED "(optional)" IS NOW ACTUALLY REQUIRED.
    //
    // It was possible to save a flight with no airline and no note, because the
    // labels were the only thing saying they were needed and `save` never
    // checked. Ethan: "it seems like I've been able to add to log without
    // actually selecting an airline etcetera, or filling in the note. Only the
    // things that show optional can be skipped."
    //
    // So the rule is now literal and there is exactly one list: a field whose
    // label carries "(optional)" may be blank, and one whose label does not may
    // not. Optional today: aircraft, flight number, seat, what-for, the photo.
    // Required: both airports, the date, the airline, the note - and the return
    // date once round trip is ticked.
    //
    // The message names the field rather than saying "fill in the form", so
    // somebody who has scrolled past the airline picker knows which control to
    // go back to.
    if (!form.airline.trim()) { setError('Pick the airline you flew with, or tap Other to type it in.'); return }
    if (!form.note.trim()) { setError('Add a note about this trip. It is the bit that makes the flight worth reading back.'); return }
    const roundTrip = canRoundTrip && form.round_trip
    if (roundTrip) {
      if (!form.return_on) { setError('Add the date you fly back, or untick round trip.'); return }
      // A return date in the future is fine even on a flight already taken:
      // that is exactly the shape of "I flew out last week, I fly back on
      // Friday", which the old check rejected.
      if (form.return_on < form.flown_on) { setError('The return is before the outbound. Check the dates.'); return }
    }

    // WHICH PAIR OF CODES GOES ON WHICH LEG. One rule, applied identically to a
    // new trip and to a one-way row growing its leg home: `flown_on` is the
    // FIRST leg's date, `return_on` the second's, and `first_leg` says whether
    // the first leg is the way the airports were typed or the other way round.
    // See the direction picker for why the form has to ask.
    const flipped = roundTrip && form.first_leg === 'back'
    const legOne = flipped
      ? { from_iata: form.to_iata, to_iata: form.from_iata }
      : { from_iata: form.from_iata, to_iata: form.to_iata }
    const legTwo = { from_iata: legOne.to_iata, to_iata: legOne.from_iata }

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
      // Only ever written beside `other`. Picking a real reason and then
      // changing your mind would otherwise leave the old free text attached to
      // "Holiday", which is a row that contradicts itself.
      purpose_note: form.purpose === 'other' ? (form.purpose_note.trim() || null) : null,
      // Always true. See BLANK_FORM for what this does and does not expose.
      share_with_community: true,
    }

    // ---- EDITING AN EXISTING ROW -------------------------------------------
    // One update and nothing else: no round trip (the return is its own row and
    // is edited on its own line) and no offer to post to the collab board,
    // because correcting a typo is not news.
    // ---- EDITING AN EXISTING ROW -------------------------------------------
    // One update - plus, since 1 Sep 2026, the leg home if the round trip box
    // has just been ticked. The row being edited is always leg ONE, so a
    // direction change here rewrites its own airports rather than inventing a
    // third row: see the direction picker.
    if (editing) {
      const { error: upErr } = await supabase.from('flights').update({
        ...common,
        ...legOne,
        flown_on: form.flown_on,
        seat: form.seat.trim() || null,
        note: form.note.trim() || null,
        photo_url: form.photo_url || null,
      }).eq('id', editing.id)
      if (upErr) { setSaving(false); setError('Could not save those changes. Please try again.'); return }

      if (roundTrip) {
        const { error: retErr } = await supabase.from('flights').insert({
          ...common,
          ...legTwo,
          flown_on: form.return_on,
          return_of: editing.id,
        })
        if (retErr) {
          setSaving(false)
          setError('The changes are saved but the leg home did not go through. Add it on its own.')
          load()
          return
        }
      }
      setSaving(false)
      closeForm()
      setForm(BLANK_FORM)
      toast(roundTrip ? 'Trip updated, leg home added' : 'Flight updated')
      load()
      return
    }

    const { data: out, error: insErr } = await supabase.from('flights').insert({
      ...common,
      ...legOne,
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
    if (roundTrip) {
      const { error: retErr } = await supabase.from('flights').insert({
        ...common,
        ...legTwo,
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
    // other people.
    //
    // AN UPCOMING FLIGHT IS THE CASE THIS WAS ALWAYS REACHING FOR. The rule
    // used to be "the flight is in the last three weeks", which is the best
    // approximation available when the log could only hold flights that had
    // already happened - it caught somebody logging a trip on the way home and
    // nothing else, and a trip you can still be met on is by definition one
    // that has not finished. Now that the log holds flights you have not taken
    // yet, a future one is offered every time and the recency rule only has to
    // cover the trip you have just got back from. Offering to tell forty people
    // about a flight from 2019 is offering to post something nobody can act on.
    const arrived = airport(legOne.to_iata)
    // UPCOMING ONLY. It also offered on any flight taken in the last 21 days,
    // which is a trip that has already happened - so the board filled up with
    // "I am in Seville" from somebody who got home a fortnight ago and nobody
    // could act on any of it. Ethan: "remember, this should always only be for
    // future flights, not for past flights. So if there's a flight any time in
    // the future from the current point, then it should show the popup."
    const worthPosting = upcoming
    setForm(BLANK_FORM)
    setCustomAirline(false)
    setCustomPlane(false)
    setAllAirlines(false)
    closeForm()
    load()
    if (arrived && worthPosting) {
      setOffer({
        city: arrived.city,
        country: arrived.countryName || arrived.country || '',
        start: form.flown_on,
        end: roundTrip && form.return_on ? form.return_on : ymd(new Date(new Date(`${form.flown_on}T12:00:00Z`).getTime() + 6 * 86400000)),
        note: '',
      })
    }
  }

  // ONE PLACE THAT TURNS A FLIGHT INTO A COLLAB BOARD POST, used by the offer
  // that appears after saving and by the button on an upcoming card. The end
  // date is the return leg's date where there is one and a week later where
  // there is not, because a trip with no end date on a board is a trip nobody
  // can plan around.
  function offerTrip(f) {
    const arrived = airport(f.to_iata)
    if (!arrived) return
    const back = (rows || []).find((x) => x.return_of === f.id)
    setOffer({
      city: arrived.city,
      country: arrived.countryName || arrived.country || '',
      start: f.flown_on,
      end: back?.flown_on || ymd(new Date(new Date(`${f.flown_on}T12:00:00Z`).getTime() + 6 * 86400000)),
      note: '',
    })
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
  // ONE ROW PER TRIP. A return is a second `flights` row pointing at the first,
  // and drawing them both made a week away look like two flights, the second of
  // them photo-less. See `tripsFromFlights`.
  const trips = useMemo(() => tripsFromFlights(stats.list), [stats.list])
  const visible = showAll ? trips : trips.slice(0, 12)
  // The trip whose details are open, if any.
  const [detail, setDetail] = useState(null)
  // The photograph, blown up over everything.
  const [photo, setPhoto] = useState(null)
  const r = stats.records

  return (
    <div className="page">
      {/* NO STRAPLINE. It read "Every flight you have taken, and what it adds
          up to. Add them as you go, or work backwards through your inbox on a
          rainy afternoon", which is a nice sentence explaining a feature to
          somebody opening it for the first time and dead weight on the page
          they open every week. The card underneath says the same thing with a
          number in it. */}
      <PageHeader
        title="Your flight log"
        action={
          <div className="flex flex-wrap gap-2">
            {/* THE COMMUNITY, AS A DOOR AT THE TOP.
                All of this used to be two sections buried at the bottom of this
                page. It is a different question with a different owner - this
                page is your own record, that one is everybody else's - so it is
                its own page now, reached from here. See FlightCommunity. */}
            <Link to="/flights/community" className="btn-secondary !px-4 !py-2.5 text-sm">
              <Icon name="users" className="h-4 w-4" />
              Across the community
            </Link>
            {/* BIGGER, NAMED IN FULL, AND WITH AN ACTUAL AEROPLANE ON IT.
                Ethan: "make the aircraft button slightly bigger and rename it to
                aircraft collection, also change the icon to an actual plane
                icon, like the one used for maps."
                `plane` is Heroicons' paper aeroplane, which is a SEND glyph -
                the same one that sits on the button that posts a message. The
                maps draw a real aircraft silhouette, and it is already in the
                icon set as `plane-tryp`, so the button that opens a collection
                of aircraft now has one on it. */}
            <Link to="/flights/aircraft" className="btn-secondary !px-5 !py-3 text-sm">
              <Icon name="plane-tryp" className="h-4 w-4" />
              Aircraft collection
            </Link>
            <button onClick={openNew} className="btn-primary !py-2.5">
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
          action={<button onClick={openNew} className="btn-primary">Log your first flight</button>}
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
                  {/* THE EARTH FIRST, AND THE MOON ONLY ONCE YOU HAVE EARNED IT.
                      It said "One lap is 40,075 km. You are 5% of the way to the
                      moon" from the very first flight - which is both the wrong
                      denominator to lead with and a genuinely discouraging one:
                      five percent of anything reads as barely started, and the
                      thing it is five percent of is a distance nobody is going
                      to fly. Ethan: "I think I would say what percent you are of
                      doing a full lap of the world first. And then once you've
                      done a full lap of the world, it can show that you've done
                      ten laps of the world or three laps of the world, and then
                      also saying the sentence about the moon."
                      So under one lap the sentence is about the lap you are on.
                      Past one lap it says how many laps that is, and only then
                      does the moon appear - by which point the number attached
                      to it is worth reading. */}
                  <p className="mt-1.5 text-[11px] text-white/60">
                    {laps < 1 ? (
                      <>One lap is {km(EARTH_CIRCUMFERENCE_KM)} km. You are {(laps * 100).toFixed(laps < 0.1 ? 1 : 0)}% of the way around the world.</>
                    ) : (
                      <>
                        That is {laps < 2 ? 'a full lap' : `${Math.floor(laps)} laps`} of the world
                        {laps >= 2 ? ` and ${((laps % 1) * 100).toFixed(0)}% of the next` : ''}.
                        {' '}You are {moonPct < 1 ? moonPct.toFixed(2) : moonPct.toFixed(1)}% of the way to the moon.
                      </>
                    )}
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
                {/* "Time in the air is worked out from the distance flown" is
                    gone. Ethan: "I would remove that." It explained a method
                    nobody asked about, under a row of numbers that are not in
                    dispute. The clock-change caveat stays, because that one is a
                    coverage gap rather than a method note: it says the figure
                    above is computed over FEWER flights than the count beside
                    it, which is a thing you would otherwise have to catch
                    yourself. */}
                {stats.zoneFlights < stats.flights && (
                  <p className="mt-3 text-[11px] text-white/55">
                    Clock changes are counted on the {stats.zoneFlights} of {stats.flights} flights where both ends name a single time zone.
                  </p>
                )}
              </div>
            </section>
          </Reveal>

          {/* ---- COMING UP ----
              THE FLIGHTS THAT HAVE NOT HAPPENED YET, kept visibly apart from
              everything else on the page.

              Every other section here is a fact about what you have done, and
              this one is a plan - so it is above the map (where you would look
              for "what is next") and it is drawn as an outlined card rather
              than a solid one, which is the same language the rest of the app
              uses for something provisional. Nothing in it is counted: not the
              distance, not the map, not the records, not the streak. See
              buildFlightStats, which does the splitting, and migration 104 for
              why there is no `is_upcoming` column to get out of step.

              THE COLLAB BOARD IS THE POINT OF IT. A trip you are going on is
              only worth typing once, and the place everybody else looks for it
              is the board. Logging an upcoming flight offers to post it there
              with the dates already filled in; this card offers it again for
              the ones somebody said "not this time" to. */}
          {stats.upcoming.length > 0 && (
            <Reveal from="down">
              <section>
                {/* JUST THE HEADING. "2 flights booked in" was a count of a
                    list you are looking at, printed beside its own title. Ethan:
                    "I would remove the thing that says one flight booked in or
                    two flights booked in. I think the coming up section is
                    fine." `buildFlightStats` already returns them soonest
                    first. */}
                <h2 className="mb-3 text-lg font-semibold">Coming up</h2>
                <Reveal className="grid items-stretch gap-3 sm:grid-cols-2" stagger={0.05}>
                  {stats.upcoming.map((f) => (
                    <div key={f.id} className="flex h-full flex-col rounded-card border border-dashed border-brand/40 bg-brand-tint/15 p-4">
                      <div className="flex items-center gap-3">
                        <span className="flex shrink-0 items-center gap-1.5 text-sm font-bold tracking-wider text-brand">
                          {f.from.iata}
                          <Icon name="plane" className="h-3.5 w-3.5 text-brand-light" />
                          {f.to.iata}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{f.from.city} to {f.to.city}</span>
                          <span className="block truncate text-xs text-smoke">
                            {formatDate(f.flown_on)}
                            {f.airline ? ` · ${f.airline}` : ''}
                          </span>
                        </span>
                      </div>
                      {/* SOMEBODY ELSE IS ON THIS FLIGHT.
                          The strongest signal in the whole log: same route, same
                          day, two creators who will be in one airport within a
                          couple of hours of each other. It goes ABOVE the collab
                          board button because it is the reason to press it. */}
                      {sameFlight[f.id]?.length > 0 && (
                        <Link
                          to={`/profile/${sameFlight[f.id][0].creator_id}`}
                          className="mt-3 flex items-center gap-2.5 rounded-xl bg-white/70 px-3 py-2 transition-colors hover:bg-white"
                        >
                          <span className="flex -space-x-2">
                            {sameFlight[f.id].slice(0, 3).map((c) => (
                              <Avatar key={c.creator_id} src={c.photo_url} name={c.name} size="xs" className="!h-6 !w-6 ring-2 ring-white" />
                            ))}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-brand">
                            {sameFlight[f.id][0].name.split(' ')[0]}
                            {sameFlight[f.id].length > 1
                              ? ` and ${sameFlight[f.id].length - 1} other${sameFlight[f.id].length > 2 ? 's' : ''} are`
                              : ' is'} on this flight
                          </span>
                        </Link>
                      )}
                      <div className="mt-3 flex items-center gap-2 border-t border-brand/20 pt-3">
                        <button
                          type="button"
                          onClick={() => offerTrip(f)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-transform duration-200 hover:scale-105 active:scale-95"
                        >
                          <Icon name="pin" className="h-3.5 w-3.5" />
                          Post to the collab board
                        </button>
                        <button
                          onClick={() => openEdit(f)}
                          aria-label="Edit this flight"
                          className="ml-auto rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white hover:text-brand"
                        >
                          <Icon name="pencil" className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(f)}
                          aria-label="Remove this flight"
                          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </Reveal>
              </section>
            </Reveal>
          )}

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
              <WhenVisible rootMargin="1000px" fallback={<MapSkeleton />}>
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
              {/* NO STRAPLINE, AND THE GRID IS EVEN.
                  "Every one of these is already in your log. Nothing here was
                  typed in" was a reassurance nobody had asked for a second time.
                  And the cards are `items-stretch` with a fixed foot, so a
                  record whose detail line wraps no longer makes its whole row
                  taller than the next - Ethan: "fix the ui/design of cards so
                  they fit evenly." */}
              <h2 className="mb-3 text-lg font-semibold">Your records</h2>
              <Reveal className="grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3" stagger={0.05}>
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
                {/* FASTEST TURNAROUND IS GONE. Ethan: "I would remove the
                    Fastest turnaround metric, it's not needed and it then
                    improves the UI as everything will fit nicely and equally."
                    Both halves are right. "Two days" between landing and taking
                    off again is a fact about a diary rather than about flying,
                    and it was the odd card out on a wall of records - so
                    dropping it also leaves a count that fills its rows. The
                    `records.turnaround` computation stays in lib/flightStats
                    (it is pure and tested); nothing draws it. */}
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
                {/* BIGGEST CLOCK CHANGE IS GONE. It is only ever computable on
                    the flights where both ends name a single time zone (see
                    lib/localTime), so on most logs it was a card that sometimes
                    existed and sometimes did not - and "+8 hours" is a fact
                    about a time zone table rather than about a journey. The
                    lifetime figure still rides on the headline card, where it is
                    an accumulation and means something. Ethan asked for the card
                    to go. */}
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
                {/* FIRST IN THE LOG IS GONE TOO, and for a better reason: it
                    is not a record, it is a note about when somebody started
                    typing. It says nothing about the flying. The date is still
                    under "Years in the log" on the streak card, where it is
                    doing real work. */}
              </Reveal>
            </section>
          </Reveal>

          {/* THE TRAVEL STREAK SECTION IS GONE. Ethan: "I would remove
              this section 'Your streak', it's not needed." Three cards saying
              how many consecutive MONTHS have a flight in them is a metric this
              page invented for itself; the log already says how much somebody
              flies in half a dozen better ways, and the number people actually
              mean by "streak" on this platform is the games one
              (lib/gameStreak), which is somewhere else entirely and was being
              competed with. `stats.streak` is still computed and tested; it is
              simply not drawn here. */}

          {/* ---- AIRLINE LOYALTY ---- */}
          {/* ---- AIRLINE LOYALTY: THREE, AND THE REST BEHIND A BUTTON ----
              Ethan: "things like airline loyalty, it should only show up the top
              three at a time, never like showing up five, six, seven, eight,
              nine, ten. That takes way too much space."
              Eight rows of bar chart is most of a phone screen spent on a
              ranking whose only interesting entries are at the top - and the
              tail is all ties on one flight each, which is not loyalty. */}
          {stats.loyalty.length > 0 && (
            <Reveal from="down">
              <section>
                <h2 className="mb-3 text-lg font-semibold">Airline loyalty</h2>
                <Reveal className="space-y-2.5" stagger={0.04}>
                  {stats.loyalty.slice(0, showAllAirlines ? 12 : 3).map((a) => (
                    <LoyaltyRow key={a.name} a={a} max={stats.loyalty[0].flights} />
                  ))}
                </Reveal>
                {stats.loyalty.length > 3 && (
                  <button
                    onClick={() => setShowAllAirlines((v) => !v)}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-gray-200 py-2 text-xs font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand"
                  >
                    {showAllAirlines ? 'Show fewer' : `Show all ${Math.min(stats.loyalty.length, 12)}`}
                    <Icon name="chevronRight" className={cx('h-3.5 w-3.5 transition-transform duration-200', showAllAirlines ? '-rotate-90' : 'rotate-90')} />
                  </button>
                )}
              </section>
            </Reveal>
          )}

          {/* THE AIRCRAFT COLLECTION CARD WAS HERE AND IS NOW ONLY A BUTTON.
              Ethan: "remove the airline collection card from here as we already
              have the button at the top." Two doors to the same room, one of
              them nine screens down, is one door too many - and the one at the
              top is the one people actually use because it is in the header row
              with "Across the community". */}

          {/* WHO ELSE FLIES YOUR ROUTES, AND THE LEADERBOARDS, HAVE MOVED.
              Both lived here, nine screens down a page about one person, which
              is where you put something nobody is going to read. They are the
              whole of `/flights/community` now, behind the button at the top of
              this page. See FlightCommunity for why they belong together and
              why they do not belong here. */}

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
                {visible.map((t) => {
                  const f = t.out
                  const back = t.back
                  return (
                  // THE WHOLE ROW OPENS THE TRIP.
                  // It carried an Edit and a Remove button and nothing else,
                  // so the only thing you could do to a flight you had logged
                  // was change it or destroy it - there was no way to simply
                  // look at one. Ethan: "clicking a logged flight should open
                  // that trip's details." The buttons stop the press so they
                  // still do their own jobs.
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetail(t)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(t) } }}
                    className="card group flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 !p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift"
                  >
                    {/* THE PHOTOGRAPH IS THE FIRST THING ON THE ROW, and it is
                        big enough to be one. It was a 56px square - a thumbnail
                        of a thumbnail, on the only part of a flight anybody
                        wants to look at again. Ethan: "the trip photo renders
                        tiny, clicking it should open a large view." It opens
                        full size from the detail sheet the row leads to. */}
                    {t.photo_url && (
                      <img
                        src={t.photo_url}
                        alt=""
                        loading="lazy"
                        className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-black/5 transition-transform duration-200 group-hover:scale-[1.03] sm:h-24 sm:w-24"
                      />
                    )}
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex shrink-0 items-center gap-1.5 text-sm font-bold tracking-wider text-brand">
                        {f.from.iata}
                        {/* THE SAME GLYPH THE COMING UP CARDS USE, IN THE
                            LIGHTER ORANGE - and a DOUBLE-HEADED one when the
                            trip has a return, because that arrow is now the
                            only thing saying two legs are one trip. */}
                        <Icon name={back ? 'reorder' : 'plane'} className="h-3.5 w-3.5 text-brand-light" />
                        {f.to.iata}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {f.from.city} to {f.to.city}
                        </span>
                        <span className="block truncate text-xs text-smoke">
                          {/* A trip with a return is a RANGE. Two dates say
                              "you were away from here to here", which is what
                              a week in Madrid actually was. */}
                          {back ? `${formatDate(f.flown_on)} – ${formatDate(back.flown_on)}` : formatDate(f.flown_on)}
                          {f.airline ? ` · ${f.airline}` : ''}
                          {f.flight_number ? ` ${f.flight_number}` : ''}
                          {f.aircraft ? ` · ${f.aircraft}` : ''}
                          {f.seat ? ` · seat ${f.seat}` : ''}
                          {f.purpose ? ` · ${f.purpose === 'other' && f.purpose_note ? f.purpose_note : (PURPOSE_LABEL[f.purpose] || f.purpose)}` : ''}
                        </span>
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {/* "Return" is not a badge on a second row any more, it
                          is a property of the one row. */}
                      {back && <Badge tone="light" className="!px-2 !py-0.5">Return</Badge>}
                      <Badge tone="grey" className="!px-2 !py-0.5">{haul(f.dist)}</Badge>
                      <span className="text-right text-xs tabular-nums text-smoke">
                        <span className="block font-semibold text-ink">{km(t.dist)} km</span>
                        <span className="block">{humanHours(t.mins)}</span>
                      </span>
                      {/* EDIT BEFORE REMOVE, and nearer to hand. Deleting is
                          the irreversible one, so the gentler option comes
                          first. Both stop the press reaching the row. */}
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(f) }}
                        aria-label="Edit this flight"
                        className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-brand-tint hover:text-brand"
                      >
                        <Icon name="pencil" className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); remove(f) }}
                        aria-label="Remove this flight"
                        className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  )
                })}
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
      <Modal
        open={adding}
        onClose={closeForm}
        title={editing ? 'Edit this flight' : upcoming ? 'A flight coming up' : 'Log a flight'}
        wide
        sheet={false}
      >
        <form onSubmit={save} className="space-y-5">
          {/* NOBODY IS ASKED WHETHER THEY HAVE ALREADY TAKEN THE FLIGHT.
              There were two big radio cards at the top of this form, "I have
              flown this" and "Coming up", and they decided whether the date
              field would accept a future date. Ethan: "why is it asking I have
              flown this and coming up, obviously by the dates that goes in
              you'll be able to tell and then sort it automatically."
              He is right, and the data model already agreed with him: there is
              no `is_upcoming` column and there must not be one, because a
              boolean would be wrong the morning after the flight. Upcoming IS
              `flown_on > current_date` (migration 104). So the answer was
              always derivable from a field the form already collects, and
              asking for it was asking somebody to state a fact twice and then
              contradict themselves.
              `upcoming` is now computed from the date as it is typed - it still
              drives what happens after saving (the offer to post to the collab
              board) and the wording on the date labels. */}
          {/* SCAN IT INSTEAD OF TYPING IT.
              First, because it is the fastest path through this form and the
              one that should be tried before anybody starts typing. It only
              fills five fields - the airline, the aircraft, the purpose and the
              note are still yours, because a barcode does not know why you
              went. See components/network/ScanBoardingPass. */}
          {!editing && (
            <button
              type="button"
              onClick={() => setScanning(true)}
              className="group flex w-full items-center gap-3 rounded-card border border-dashed border-brand/40 bg-brand-tint/25 px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:bg-brand-tint/50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-transform duration-200 group-hover:scale-110">
                <Icon name="magnifier" className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">Scan your boarding pass</span>
                <span className="block text-xs text-smoke">A photo, or a screenshot from Apple Wallet</span>
              </span>
              <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-brand transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          )}

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
            {/* NO `max`. It existed to enforce the toggle - "I have flown this"
                capped the field at today - and with the toggle gone a capped
                field would make it impossible to log the flight you are about to
                take, which is half of what this form is for. The LABEL is what
                changes now, live, as soon as the date crosses today. */}
            <DateField
              id="flight-date"
              label={upcoming ? 'Date you fly' : 'Date flown'}
              value={form.flown_on}
              onChange={(v) => setForm((f) => ({ ...f, flown_on: v }))}
            />
            {/* A ROUND TRIP WRITES A SECOND ROW, AND YOU CAN ASK FOR IT WHEN
                EDITING TOO - as long as this row is not already half of one.
                See `canRoundTrip`. */}
            {canRoundTrip && (
            /* THE TITLE IS ABOVE THE BOX, LIKE EVERY OTHER FIELD ON THE FORM.
               Ethan: "the day flown card and the round trip card beside it. The
               round trip card is bigger, and this says round trip inside,
               whereas Round trip should be the title, like, above the little
               box."
               He is describing a real inconsistency and a real size mismatch:
               "Date flown" was a `label` element above its input and "Round
               trip" was body text INSIDE its own box, so the pair read as a
               labelled field beside an unlabelled panel - and the two-line
               inner text made the panel taller than the field it sat next to.
               Now both are label-above-control, and the control is one line, so
               they are the same height. */
            <div>
              <span className="label">Round trip</span>
              <label className="flex h-[3.25rem] cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-3.5 transition-colors hover:border-brand/40">
                <input
                  type="checkbox"
                  checked={form.round_trip}
                  onChange={(e) => setForm((f) => ({ ...f, round_trip: e.target.checked, return_on: e.target.checked ? f.return_on : '', first_leg: 'out' }))}
                  className="h-4 w-4 shrink-0 accent-[#d94407]"
                />
                <span className="min-w-0 truncate text-sm text-ink">
                  {toA && fromA ? `Also ${toA.iata} back to ${fromA.iata}` : 'Log the flight home too'}
                </span>
              </label>
            </div>
            )}
          </div>

          {canRoundTrip && form.round_trip && (
            <div className="space-y-4">
              {/* WHICH WAY ROUND THE TRIP ACTUALLY WENT.
                  Ethan: "when asking for round trip I want to select which way
                  the round trip was. If I logged Oslo to Dublin and I want to
                  log it as a round trip, well it would do Dublin back to Oslo,
                  but it was actually the other way, Dublin to Oslo first."
                  A pair of airports does not say which end you started at, and
                  the form was assuming the pair had been typed in flying order.
                  Half the time it has not been - people type the destination
                  they are thinking about first.
                  So the rule is now stated once and holds everywhere: `flown_on`
                  is the FIRST leg's date, `return_on` is the second's, and this
                  control decides which pair of codes goes on which. Both
                  options are drawn in full rather than as a swap button,
                  because "which way round" is a question you answer by reading
                  the two answers, not by toggling something and checking what
                  happened. */}
              <div>
                <span className="label">Which way did you fly first?</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { key: 'out', a: fromA, b: toA },
                    { key: 'back', a: toA, b: fromA },
                  ].map((opt) => {
                    const on = form.first_leg === opt.key
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, first_leg: opt.key }))}
                        aria-pressed={on}
                        className={cx(
                          'flex flex-col gap-1 rounded-xl border px-3.5 py-3 text-left transition-all duration-200 hover:-translate-y-0.5',
                          on ? 'border-brand bg-brand-tint/30 shadow-card' : 'border-gray-200 hover:border-brand/40',
                        )}
                      >
                        <span className={cx('flex items-center gap-1.5 text-sm font-bold tracking-wider', on ? 'text-brand' : 'text-ink')}>
                          {opt.a?.iata || '···'}
                          <Icon name="plane" className="h-3.5 w-3.5 text-brand-light" />
                          {opt.b?.iata || '···'}
                        </span>
                        <span className="text-[11px] text-smoke">
                          {opt.a && opt.b
                            ? `${opt.a.city} to ${opt.b.city} first, then back`
                            : 'Pick both airports first'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* NO HINT. It said "Saved as its own flight, so the distance
                    counts twice", which is an implementation detail dressed as a
                    warning - and it read as a bug being confessed to. Ethan:
                    "there's no need to show that text, it's unnecessary and ruins
                    the design." */}
                <DateField
                  id="flight-return"
                  label={upcoming ? 'Date you fly back' : 'Date you flew back'}
                  value={form.return_on}
                  onChange={(v) => setForm((f) => ({ ...f, return_on: v }))}
                />
                {form.flown_on && form.return_on && form.return_on < form.flown_on && (
                  <p className="self-end pb-2.5 text-[11px] text-red-500">
                    The return is before the outbound. Check the dates.
                  </p>
                )}
              </div>
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
              {/* NOT OPTIONAL. Ethan: "it shows the optional sign beside the
                  airline you choose. That shouldn't be optional. You should
                  always select the airline because that's something people
                  likely know." The whole reason this is a shortlist of real
                  candidates rather than an empty text box is that it is a fact
                  everybody has and nobody could be bothered to type. */}
              <p className="label">Airline</p>
              {customAirline ? (
                <div className="flex gap-2">
                  <input id="flight-airline" value={form.airline} maxLength={60} autoFocus {...NO_AUTOFILL}
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
          {/* `planes.length > 0` is NOT part of this condition. It used to be,
              which meant the whole aircraft field vanished on any route no
              airline in the table can reach - and that is precisely the route
              somebody was flown down on something rare. The escape below has to
              be reachable whenever there is a route at all. */}
          {previewKm > 0 && (
            <div>
              <p className="label">Aircraft <span className="font-normal text-smoke">(optional)</span></p>
              {/* AND A WAY TO NAME ONE THAT IS NOT ON THE LIST.
                  Ethan: "a button to add other aircraft in case there's a rare
                  one someone goes on." The chips are what the airline you picked
                  could plausibly have sent on a route this length, which is a
                  good shortlist and a closed one - and a closed list is exactly
                  wrong for the person who has just been on a Twin Otter to an
                  island. The same escape the airline picker has had all along.
                  What gets typed here appears under "Also flown" on the
                  collection page and counts towards the number of different
                  aircraft you have been on. */}
              {customPlane ? (
                <div className="flex gap-2">
                  <input
                    id="flight-aircraft"
                    value={form.aircraft}
                    maxLength={60}
                    autoFocus
                    {...NO_AUTOFILL}
                    placeholder="The aircraft you were on"
                    onChange={(e) => setForm((f) => ({ ...f, aircraft: e.target.value }))}
                    className="input w-full"
                  />
                  <button
                    type="button"
                    onClick={() => { setCustomPlane(false); setForm((f) => ({ ...f, aircraft: '' })) }}
                    className="btn-ghost shrink-0 !px-3 !py-2 text-xs"
                  >
                    Back to the list
                  </button>
                </div>
              ) : (
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
                <button
                  type="button"
                  onClick={() => { setCustomPlane(true); setForm((f) => ({ ...f, aircraft: '' })) }}
                  className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand ring-1 ring-brand/30 transition-all hover:-translate-y-0.5 hover:ring-brand"
                >
                  Other
                </button>
              </div>
              )}
            </div>
          )}

          {/* OPTIONAL SAYS SO, AND THAT IS ALL IT SAYS.
              Ethan: "not everything is necessary, such as flight number, seat,
              the note. So if someone doesn't put them in, it should still add
              to the log... you should have optional there as well." Two of the
              three now carry the same "(optional)" the airline used to wear
              wrongly - and none of them ever blocked a save, so the label was
              simply describing what the form already did.
              THE NOTE IS THE EXCEPTION AND IT IS DELIBERATE. Ethan: "I think the
              note is good to have. We should keep the note as you have to put it
              in because it's a nice little tag on the trip as a memory." It is
              not marked optional, because marking it optional is an invitation
              to skip the one field that turns a row of airport codes into
              something worth reading back. It is still not enforced. */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="flight-number" className="label">Flight no. <span className="font-normal text-smoke">(optional)</span></label>
              <input id="flight-number" maxLength={10} {...NO_AUTOFILL} autoCapitalize="characters"
                value={form.flight_number}
                placeholder={picked ? `${picked.iata}1363` : 'TP1363'}
                onChange={(e) => setForm((f) => ({ ...f, flight_number: e.target.value }))} className="input w-full" />
            </div>
            {/* SEAT. The one detail people actually remember, and the one that
                makes a row read like a memory rather than a database entry. */}
            <div>
              <label htmlFor="flight-seat" className="label">Seat <span className="font-normal text-smoke">(optional)</span></label>
              <input id="flight-seat" maxLength={8} value={form.seat} placeholder="14A" {...NO_AUTOFILL} autoCapitalize="characters"
                onChange={(e) => setForm((f) => ({ ...f, seat: e.target.value.toUpperCase() }))} className="input w-full" />
            </div>
            <div className="col-span-2">
              <label htmlFor="flight-note" className="label">Note</label>
              <input id="flight-note" value={form.note} maxLength={140} placeholder="Sunrise over the Alps"
                {...NO_AUTOFILL} autoCorrect="on" autoCapitalize="sentences"
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
                    onClick={() => setForm((f) => ({
                      ...f,
                      purpose: on ? '' : p.key,
                      // Moving off Other drops what was typed under it, so a
                      // row can never say "Holiday" and carry a note explaining
                      // that it was a funeral.
                      purpose_note: on || p.key !== 'other' ? '' : f.purpose_note,
                    }))}
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

            {/* AND "OTHER" GETS TO SAY WHAT IT WAS.
                Ethan: "whenever you're pressing what for, and click other, you
                should be able to type something in, not just it appears as
                other." A row filed under Other is the app recording that it did
                not ask.
                The six keys are unchanged and the chart still counts THEM - the
                whole value of the field is that it can be counted, and a free
                text reason column is four hundred distinct values and no chart.
                The note rides beside the key (migration 104) and appears on the
                row it belongs to, nowhere else.
                It grows and shrinks rather than appearing, the same height
                transition the board's country field uses, so the dialog does
                not jump a row taller under the cursor. */}
            <div
              className={cx(
                'grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none',
                form.purpose === 'other' ? 'mt-2.5 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0',
              )}
            >
              <div className="overflow-hidden">
                <input
                  id="flight-purpose-note"
                  aria-label="What was it for?"
                  {...NO_AUTOFILL}
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  className="input w-full"
                  maxLength={80}
                  value={form.purpose_note}
                  tabIndex={form.purpose === 'other' ? undefined : -1}
                  aria-hidden={form.purpose !== 'other'}
                  placeholder="A wedding, a move, a layover you turned into a trip"
                  onChange={(e) => setForm((f) => ({ ...f, purpose_note: e.target.value }))}
                />
              </div>
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

          {/* THE SHARING TICK BOX HAS GONE. See BLANK_FORM: every flight
              counts towards the community now and there is nothing to decide,
              so there is nothing to ask. What reaches other people is unchanged
              - the airports, the count and the distance, never a date, a seat,
              a note or a photograph. */}

          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeForm} className="btn-ghost w-full justify-center sm:w-auto">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary w-full justify-center sm:w-auto">
              {saving ? <Spinner /> : editing ? 'Save changes' : upcoming ? 'Add to what is coming up' : 'Add to my log'}
            </button>
          </div>
        </form>
      </Modal>

      <ScanBoardingPass
        open={scanning}
        now={new Date(`${today}T12:00:00`)}
        onClose={() => setScanning(false)}
        onFilled={(fields) => {
          // MERGE, NEVER REPLACE, AND NEVER WITH A BLANK.
          //
          // Somebody may have picked an airline or written a note before
          // reaching for the scanner, and a spread alone would undo that: the
          // scan returns a full form shape, so a field it could not read comes
          // back as '' and overwrites whatever was there. That became a live
          // risk the moment the scan started returning `airline`, which is empty
          // for any carrier outside lib/airlines - scanning a small regional
          // pass would have silently cleared an airline the reader had already
          // chosen by hand.
          setForm((f) => {
            const next = { ...f }
            for (const [k, v] of Object.entries(fields)) if (v) next[k] = v
            return next
          })
          setError('')
        }}
      />

      {/* ---- The collab board offer ---- */}
      {/* ---- One trip, opened ----
          The log used to be a list you could only edit or delete from. This is
          the third thing: looking at it. The photograph leads at a size worth
          looking at and opens full screen from here, and a return trip shows
          BOTH legs rather than pretending to be one flight with a long
          distance. */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.out.from.city} to ${detail.out.to.city}` : ''}
      >
        {detail && (
          <div className="space-y-5">
            {detail.photo_url && (
              <button
                type="button"
                onClick={() => setPhoto(detail.photo_url)}
                className="group relative block w-full overflow-hidden rounded-card"
                aria-label="Open the photo full size"
              >
                <img
                  src={detail.photo_url}
                  alt=""
                  className="h-56 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] sm:h-72"
                />
                <span className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                  <Icon name="expand" className="h-3.5 w-3.5" /> Full size
                </span>
              </button>
            )}

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-cloud px-3 py-2.5">
                <p className="text-lg font-bold tabular-nums text-brand">{km(detail.dist)}</p>
                <p className="text-[11px] text-smoke">km flown</p>
              </div>
              <div className="rounded-xl bg-cloud px-3 py-2.5">
                <p className="text-lg font-bold tabular-nums text-brand">{humanHours(detail.mins)}</p>
                <p className="text-[11px] text-smoke">in the air</p>
              </div>
              <div className="rounded-xl bg-cloud px-3 py-2.5">
                <p className="text-lg font-bold tabular-nums text-brand">{detail.legs.length}</p>
                <p className="text-[11px] text-smoke">{detail.legs.length === 1 ? 'leg' : 'legs'}</p>
              </div>
            </div>

            {/* EVERY LEG, NAMED. A return trip is two flights and the detail
                sheet is the one place that should say so plainly. */}
            <div className="space-y-2">
              {detail.legs.map((leg, i) => (
                <div key={leg.id} className="rounded-xl border border-gray-100 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="flex items-center gap-1.5 text-sm font-bold tracking-wider text-brand">
                      {leg.from.iata}
                      <Icon name="plane" className="h-3.5 w-3.5 text-brand-light" />
                      {leg.to.iata}
                    </span>
                    {detail.legs.length > 1 && (
                      <Badge tone="light" className="!px-2 !py-0.5">{i === 0 ? 'Out' : 'Back'}</Badge>
                    )}
                    <span className="ml-auto text-xs text-smoke">{formatDate(leg.flown_on)}</span>
                  </div>
                  <p className="mt-1 text-xs text-smoke">
                    {leg.from.city} to {leg.to.city}
                    {leg.airline ? ` · ${leg.airline}` : ''}
                    {leg.flight_number ? ` ${leg.flight_number}` : ''}
                    {leg.aircraft ? ` · ${leg.aircraft}` : ''}
                    {leg.seat ? ` · seat ${leg.seat}` : ''}
                  </p>
                  <p className="mt-1 text-xs tabular-nums text-smoke">
                    {km(leg.dist)} km · {humanHours(leg.mins)} · {haul(leg.dist)}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={() => { const f = detail.out; setDetail(null); openEdit(f) }} className="btn-secondary !py-2.5 text-sm">
                <Icon name="pencil" className="h-4 w-4" /> Edit
              </button>
              <button onClick={() => { const f = detail.out; setDetail(null); offerTrip(f) }} className="btn-ghost !py-2.5 text-sm">
                <Icon name="share" className="h-4 w-4" /> Post to the collab board
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* The photograph, full size. Deliberately its own layer rather than a
          bigger image inside the sheet: a trip photo is portrait as often as
          not and the sheet is not the shape of a photograph.
          IT IS A PORTAL NOW - see PhotoLightbox for why a z-index written on
          this page could never beat the trip sheet it opens from. */}
      <PhotoLightbox src={photo} onClose={() => setPhoto(null)} />

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
            {/* ONE SENTENCE. It ended with "The dates come from the flight you
                just logged and you can change them on the board afterwards",
                which is the app explaining its own plumbing and pre-emptively
                apologising for it. Ethan: "don't say you can change them on the
                board afterwards, because obviously they will just edit the
                flight details if it changes, or delete it. Just keep posted on
                the collab board and anybody who is there at the same time can
                reach out to you. Say that. No need for anything else." */}
            <p className="text-sm text-smoke">
              Post it on the collab board and anybody who is there at the same time can reach out to you.
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
  // SIX CARDS, NOT ONE STACKED BAR.
  //
  // The bar was a single rounded strip cut into segments, each in a different
  // shade of orange, with a legend underneath. The colours were rebuilt once
  // already to make the segments distinguishable, and the honest conclusion is
  // that fixing the palette never fixed the control: a reader who wants to know
  // how many creator trips they took has to find the right orange in the legend,
  // carry it back up to the strip, judge a width against the whole, and multiply.
  // Ethan: "rather than doing that, maybe just have cards for each of them to
  // show the number, it would be clearer and look better."
  //
  // AND ALL SIX ARE ALWAYS HERE, INCLUDING THE ZEROES. The bar could only draw
  // what existed, so the set of categories changed shape as flights were logged
  // and "Commute" appearing for the first time looked like a new feature. A
  // fixed grid of six is a stable thing to read, and a zero is information: it
  // says the category exists and you have not used it, which is exactly what
  // somebody deciding whether to bother filling the field in wants to know.
  const counts = PURPOSES.map((p) => ({ ...p, n: list.filter((f) => f.purpose === p.key).length }))
  const most = Math.max(...counts.map((p) => p.n), 0)

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {counts.map((p) => {
        const on = p.n > 0
        // The biggest category gets the tint. One highlight, not six competing
        // ones, and it is the only thing the old ramp was really conveying.
        const top = on && p.n === most
        return (
          <div
            key={p.key}
            className={cx(
              'flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-colors',
              top ? 'border-brand/40 bg-brand-tint/50'
                : on ? 'border-gray-100 bg-white' : 'border-gray-100 bg-cloud/40',
            )}
          >
            <Icon name={p.icon} className={cx('h-4 w-4 shrink-0', on ? 'text-brand' : 'text-gray-300')} />
            <span className={cx('text-lg font-bold leading-none tabular-nums', on ? 'text-ink' : 'text-gray-300')}>
              {p.n}
            </span>
            {/* leading-tight and a two-line box: "Creator trip" wraps at this
                width and a shorter label must not shunt the numbers out of line
                with the ones beside it. */}
            <span className="flex h-7 items-start justify-center text-[11px] font-medium leading-tight text-smoke">
              {p.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
