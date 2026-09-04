import { supabase } from './supabase'
import { inScope } from './scope'

// EVERYTHING THAT IS ALREADY A DATE, ON THE PAGE THAT IS ABOUT DATES.
//
// The calendar knew about two things: rows in `events`, and challenge start and
// end dates. Meanwhile the platform was quietly holding four more sets of dates
// that belong to one specific creator and were only ever visible on the page
// that owned them:
//
//   their flights          - `/flights` knew you were flying to Paris on the 1st
//   their collab trips     - `/collab` knew you were in Paris until the 6th
//   their invoices         - `/admin/rewards` knew you were being paid on the 12th
//   their own content days - nowhere, because they did not exist
//
// A creator opening the calendar to answer "what does my September look like"
// got the programme's September and none of their own. Ethan asked for all four.
//
// THE RULE THAT MAKES THIS SAFE: everything in here except events and challenges
// is SCOPED TO ONE PERSON BY THE QUERY, not by a filter afterwards. Flights,
// trips and invoices are `.eq(creator_id, me)`, and personal events are hidden
// by a restrictive RLS policy on top of that. Nobody's private diary can leak
// through a bug in a `.filter()` that never ran.
//
// KINDS AND WHY EACH ONE IS DISTINCT
//
//   event      an admin created it. Everybody in scope sees it.
//   personal   the creator created it for themselves. Only they see it.
//   challenge  derived, opens
//   deadline   derived, closes. The only thing here you can actually miss.
//   flight     derived from the flight log, one per leg.
//   trip       derived from the collab board - a RANGE, which is why travel days
//              tint the grid rather than showing as an entry on every day.
//   invoice    derived from `invoices`, and only ever your own.
//
// Everything comes back in ONE shape so the card, the grid and the agenda do
// not each need to know where a row came from:
//
//   { id, key, title, date, endsAt, type, kind, link, description, timezone,
//     ownerId, communityIds, rsvpEnabled, meetingUrl, location }
//
// `key` is the stable reminder key (see migration 107): a bell set on a flight
// has to survive the flight row being edited, and a bell on a challenge close
// has nothing to hang a uuid off at all.

/** A whole-day range, inclusive of both ends, as yyyy-MM-dd strings. */
function dayKeys(startISO, endISO) {
  const out = []
  const start = new Date(startISO)
  const end = new Date(endISO || startISO)
  if (Number.isNaN(start) || Number.isNaN(end)) return out
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  // A trip that somehow ends before it starts, or a typo giving a five-year
  // range, must not spin here. 400 days is longer than any real trip.
  for (let i = 0; d <= last && i < 400; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** Midday local on a plain date, so a whole-day item cannot drift across the
 *  date line when it is rendered in another zone. A flight logged as the 1st
 *  must never show on the 31st. */
function middayOf(dateOnly) {
  const [y, m, d] = String(dateOnly).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0).toISOString()
}

export async function loadCalendar({ userId, scopeIds }) {
  const [
    { data: events },
    { data: challenges },
    { data: flights },
    { data: trips },
    { data: invoices },
  ] = await Promise.all([
    supabase.from('events').select('*').order('date'),
    // A CHALLENGE THAT IS NOT RUNNING HAS NO DEADLINE TO MISS.
    //
    // This dropped only drafts, so an ARCHIVED challenge kept its "closes"
    // entry - and because the entry is derived from `end_date`, closing a
    // challenge early left "Descubre Espana con Tryp.com closes, in 2 days" as
    // the NEXT UP card at the top of every creator's calendar. A deadline is
    // the one thing on that page you can actually miss, and pointing it at
    // something nobody can enter any more is the worst thing it can say.
    // `ended` stays: a challenge that ran its course did close on that date,
    // and its dates are history rather than a promise.
    supabase.from('challenges').select('id, title, start_date, end_date, community_id, status').not('status', 'in', '("draft","archived")'),
    // Own flights only. `share_with_community` governs what OTHER people see of
    // a flight; it has nothing to do with whether it is on your own calendar.
    supabase.from('flights')
      .select('id, from_iata, to_iata, flown_on, airline, flight_number, return_of')
      .eq('creator_id', userId).order('flown_on'),
    supabase.from('collab_posts')
      .select('id, city, country, start_date, end_date')
      .eq('creator_id', userId).order('start_date'),
    // Only invoices that have actually gone out. A draft is an internal state
    // and putting it on the creator's calendar would promise money that has not
    // been approved.
    supabase.from('invoices')
      .select('id, number, amount, currency, description, issue_date, sent_at, paid_at, stage')
      .eq('creator_id', userId).in('stage', ['sent', 'paid', 'approved']),
  ])

  const items = []

  for (const e of events ?? []) {
    const mine = e.owner_id && e.owner_id === userId
    // A community event has to be in one of my markets. `community_ids` is the
    // real field; `inScope` on the mirrored singular column is the fallback for
    // rows written before 107.
    if (!mine) {
      const ids = e.community_ids?.length ? e.community_ids : (e.community_id ? [e.community_id] : [])
      if (ids.length && scopeIds && !ids.some((id) => scopeIds.has(id))) continue
      if (!ids.length && !inScope(scopeIds, e.community_id)) continue
    }
    items.push({
      id: e.id,
      key: `event:${e.id}`,
      title: e.title,
      date: e.date,
      endsAt: e.ends_at || null,
      type: mine ? 'personal' : (e.type || 'event'),
      kind: mine ? 'personal' : 'event',
      link: '',
      description: e.description || '',
      timezone: e.timezone || null,
      ownerId: e.owner_id || null,
      communityIds: e.community_ids || [],
      rsvpEnabled: !!e.rsvp_enabled && !mine,
      meetingUrl: e.meeting_url || '',
      location: e.location || '',
      editable: !!mine,
    })
  }

  // CHALLENGE DATES ARE SCOPED NOW, WHICH THEY WERE NOT.
  // They were built with no community on them at all, so a Spanish challenge's
  // opening and closing dates landed on all 45 creators' calendars including
  // the 43 who could not enter it. Ethan: "Ensure that challenge start events
  // and deadline events for each market challenge only appear to the
  // appropriate creators who are in the markets."
  for (const c of challenges ?? []) {
    if (!inScope(scopeIds, c.community_id)) continue
    if (c.start_date) {
      items.push({
        id: `${c.id}-start`, key: `challenge:${c.id}:start`,
        title: `${c.title} opens`, date: c.start_date, endsAt: null,
        type: 'challenge', kind: 'challenge', link: `/challenges/${c.id}`,
        description: '', timezone: null, ownerId: null,
        communityIds: c.community_id ? [c.community_id] : [],
        rsvpEnabled: false, meetingUrl: '', location: '',
      })
    }
    if (c.end_date) {
      items.push({
        id: `${c.id}-end`, key: `challenge:${c.id}:end`,
        title: `${c.title} closes`, date: c.end_date, endsAt: null,
        type: 'deadline', kind: 'deadline', link: `/challenges/${c.id}`,
        description: '', timezone: null, ownerId: null,
        communityIds: c.community_id ? [c.community_id] : [],
        rsvpEnabled: false, meetingUrl: '', location: '',
      })
    }
  }

  // FLIGHTS. One entry per leg, which is also how the log stores them - a return
  // trip is two rows (see the flight log notes), so "Dublin to Paris" on the 1st
  // and "Paris to Dublin" on the 6th arrive here as two flights on their own,
  // with no special case needed for either.
  for (const f of flights ?? []) {
    items.push({
      id: `flight-${f.id}`, key: `flight:${f.id}`,
      title: `Flight ${f.from_iata} to ${f.to_iata}`,
      date: middayOf(f.flown_on), endsAt: null,
      type: 'flight', kind: 'flight', link: '/flights',
      description: [f.airline, f.flight_number].filter(Boolean).join(' '),
      timezone: null, ownerId: userId, communityIds: [],
      rsvpEnabled: false, meetingUrl: '', location: f.from_iata,
    })
  }

  // A TRIP THAT IS ALREADY ON THE CALENDAR AS A FLIGHT IS NOT A SECOND ENTRY.
  //
  // The owner: "ensure that if someone logs a flight and shares it on the
  // collab board, it doesn't create two separate events for the same flight."
  //
  // Logging a flight OFFERS to post it to the collab board, with the dates
  // filled in from the flight - so taking that offer is the single most likely
  // thing a creator does, and it produced "Flight DUB to CDG" and "Paris,
  // France" on the same day, both describing one journey.
  //
  // The flight wins, because it is the more specific of the two: it names the
  // airports, it carries the airline, and it is the row an edit would change.
  // The trip is not thrown away - it still paints the travel days underneath
  // (see `travelDays` below), which is the part the flight cannot express, and
  // its destination is folded into the flight's own subtitle so nothing is
  // lost.
  //
  // MATCHED ON THE DAY, NOT ON THE PLACE. A collab post says "Lisbon,
  // Portugal"; a flight says "LIS". Reconciling those needs the airport table
  // and would still fail on a train leg or a city with two airports. The date
  // is the reliable join: nobody posts a trip starting the same day as an
  // unrelated flight of their own.
  const flightDays = new Set((flights ?? []).map((f) => String(f.flown_on)))
  const flightByDay = new Map((flights ?? []).map((f) => [String(f.flown_on), f]))
  for (const t of trips ?? []) {
    const label = `${t.city ? `${t.city}, ` : ''}${t.country || 'Trip'}`
    if (flightDays.has(String(t.start_date))) {
      const f = flightByDay.get(String(t.start_date))
      const entry = items.find((i) => i.id === `flight-${f.id}`)
      if (entry) {
        entry.tripId = t.id
        entry.location = t.city || t.country || entry.location
        entry.description = [entry.description, `On the collab board as ${label}`]
          .filter(Boolean).join(' · ')
      }
      continue
    }
    items.push({
      id: `trip-${t.id}`, key: `trip:${t.id}`,
      title: label,
      date: middayOf(t.start_date), endsAt: t.end_date ? middayOf(t.end_date) : null,
      type: 'trip', kind: 'trip', link: '/collab',
      description: '', timezone: null, ownerId: userId, communityIds: [],
      rsvpEnabled: false, meetingUrl: '', location: t.city || t.country || '',
    })
  }

  // INVOICES. `paid_at` if it has been paid, otherwise the day it was sent,
  // otherwise the issue date - which is the order in which each one becomes the
  // true answer to "when does this money move".
  for (const inv of invoices ?? []) {
    const when = inv.paid_at || inv.sent_at || inv.issue_date
    if (!when) continue
    items.push({
      id: `invoice-${inv.id}`, key: `invoice:${inv.id}`,
      title: inv.stage === 'paid'
        ? `Paid: ${inv.currency}${Number(inv.amount).toFixed(2)}`
        : `Invoice ${inv.number ? `#${inv.number}` : ''} sent`.trim(),
      date: String(when).length <= 10 ? middayOf(when) : when,
      endsAt: null,
      type: 'invoice', kind: 'invoice', link: '/rewards',
      description: inv.description || '', timezone: null, ownerId: userId,
      communityIds: [], rsvpEnabled: false, meetingUrl: '', location: '',
    })
  }

  items.sort((a, b) => new Date(a.date) - new Date(b.date))

  // TRAVEL DAYS ARE A TINT, NOT AN ENTRY.
  // A six-day trip put on the grid as six identical cards buries whatever else
  // is happening that week. Ethan: "on the trip days between maybe the calendar
  // boxes or weekly boxes should be highlighted in a light orange colour,
  // showing that theyre travelling those days." So the range collapses to a set
  // of day keys the grid can look up, and the trip itself still appears once,
  // on the day it starts.
  const travelDays = new Map()
  const addTravel = (keys, label) => {
    for (const k of keys) if (!travelDays.has(k)) travelDays.set(k, label)
  }
  for (const t of trips ?? []) {
    addTravel(dayKeys(t.start_date, t.end_date || t.start_date), `${t.city ? `${t.city}, ` : ''}${t.country || 'Away'}`)
  }
  // A return trip in the flight log also describes a stay: out on the 1st, back
  // on the 6th, away in between. `return_of` points at the outbound leg, so the
  // pair can be reassembled without guessing from the airport codes.
  const byId = new Map((flights ?? []).map((f) => [f.id, f]))
  for (const f of flights ?? []) {
    if (!f.return_of) continue
    const out = byId.get(f.return_of)
    if (!out) continue
    addTravel(dayKeys(out.flown_on, f.flown_on), `${out.to_iata}`)
  }

  return { items, travelDays }
}
