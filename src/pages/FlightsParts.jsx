import AirlineMark from '../components/network/AirlineMark'
import Icon from '../components/Icon'
import { distanceKm, estimateMinutes, bearing, compass, haul, co2Kg } from '../lib/airports'
import { continentOf } from '../lib/airlines'
import { clockShift, MONTHS } from '../lib/flightStats'
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

export const EARTH_CIRCUMFERENCE_KM = 40075

export const MOON_KM = 384400

// THE CABIN PICKER IS GONE, AND SO IS THE RATING.
//
// Both for the same reason, given twice by the same person: a field is worth asking for only if something on the page
// COUNTS it, and neither of these earned its place on the form. The cabin was never counted at all. The rating bought
// two tiles - "your best flight" and "the airline you rate" - and cost every single person filling in the form a
// decision about a flight they had already stopped thinking about. Both COLUMNS are left in place and simply unwritten.
// Dropping a column to remove a control would throw away whatever anybody has already logged, for no gain at all.

// Why the trip happened. Six options and no more: the value of this field is
// that it can be counted, and a taxonomy nobody can hold in their head is a
// taxonomy that gets filled in inconsistently and then cannot be counted.
// `creator` is the one that justifies the field existing on THIS platform.
export const PURPOSES = [
  { key: 'creator', label: 'Creator trip', icon: 'video' },
  { key: 'leisure', label: 'Holiday', icon: 'sun' },
  { key: 'work', label: 'Work', icon: 'briefcase' },
  { key: 'family', label: 'Family', icon: 'heart' },
  // SOLO TRAVEL, NOT COMMUTE (migration 152). A commute is a handful of creators flying the same hop for work;
  // travelling alone is something a large part of this community does and had nowhere to go but Holiday or Other. The
  // stored value changed with the label - see the migration for why printing a new word over an old key is the version
  // of this that goes wrong later.
  { key: 'solo', label: 'Solo travel', icon: 'user' },
  { key: 'other', label: 'Other', icon: 'dots' },
]

export const PURPOSE_LABEL = Object.fromEntries(PURPOSES.map((p) => [p.key, p.label]))

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
// It was a tick-box at the foot of the form - "Count this towards the community" - defaulting to on. Every flight is
// written with `share_with_community: true` now and the control is gone. What that does and does not mean is unchanged
// and worth restating, because removing a consent control is not a small thing: the community pages read ONLY who flew,
// how many times, how far and between which airports. Never a date, a seat, a flight number, a note or a photograph, and
// never a flight that has not happened yet. See migrations 103 and 104 for the policy that enforces it rather than
// promising it.
export const BLANK_FORM = {
  from_iata: '', to_iata: '', flown_on: '', airline: '', flight_number: '',
  aircraft: '', note: '', seat: '', purpose: '', purpose_note: '',
  // `first_leg` says WHICH WAY ROUND the trip went. See the direction picker
  // in the form: `flown_on` is always the FIRST leg's date and `return_on`
  // always the second's, and this decides which pair of codes goes on which.
  round_trip: false, return_on: '', first_leg: 'out',
  photo_url: '',
}

export const km = (n) => Math.round(n).toLocaleString('en-GB')

export const miles = (n) => Math.round(n * 0.621371).toLocaleString('en-GB')

export function ymd(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const monthLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`

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
export function routeFacts(from, to, dateStr) {
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

export function PassField({ label, value, hint }) {
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
export function RecordCard({ icon, label, value, detail, tone = 'plain' }) {
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

// The airline you actually fly, and the ones you say you fly.
export function LoyaltyRow({ a, max }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3 shadow-card transition-transform duration-200 hover:-translate-y-0.5">
      {/* THE AIRLINE, NOT ITS POSITION IN A LIST OF THREE. A rank badge on a sorted list is a label for something the
          order already says. */}
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
