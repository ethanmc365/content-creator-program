import { format } from 'date-fns'

// WHOSE CLOCK IS THAT TIME ON.
//
// Every date on the calendar is stored as an instant (timestamptz) and rendered
// by the browser in whatever zone the device is set to, which is correct and
// completely silent about it. A creator in Bucharest reading "18:00" has no way
// to know whether the app has already converted it or whether somebody typed
// 18:00 meaning London. Both readings are plausible, and the wrong one means
// missing the call by two hours.
//
// Ethan: "Ensure times are shown in each users correct time zone that you get
// from their location. Show local, with the host's time underneath and a hover
// that lists both."
//
// So: the big time is ALWAYS the reader's own, labelled with their zone. The
// host's time is a second line, and only when it differs - printing "18:00 your
// time / 18:00 host time" twice is noise, and a calendar full of it trains
// people to stop reading the second line on the day it matters.
//
// `events.timezone` is the host's IANA zone, written when the event is created.
// An event with no zone on it (everything created before this existed) simply
// has no second line: an absent fact beats a guess, which is the same rule
// lib/localTime follows for the countries where a timezone cannot be inferred.

/** The reader's own IANA zone, as the browser understands it. */
export function viewerZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
}

/** A short zone label for a given zone at a given instant, e.g. "GMT+1". */
export function zoneLabel(zone, at = new Date()) {
  if (!zone) return ''
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'short' })
      .formatToParts(new Date(at))
    return parts.find((p) => p.type === 'timeZoneName')?.value || ''
  } catch {
    return ''
  }
}

/** "18:00" in a named zone. Null if the engine has never heard of the zone. */
export function timeInZone(at, zone) {
  if (!zone) return null
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(at))
  } catch {
    return null
  }
}

/** "Wed 20 Aug, 18:00" in a named zone - for the hover, which has room. */
export function dateTimeInZone(at, zone) {
  if (!zone) return null
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(at))
  } catch {
    return null
  }
}

/**
 * Everything a card needs to print a time honestly.
 *
 * Returns `{ local, localZone, host, hostZone, differs, title }` where `local`
 * is already formatted for the reader and `host` is null unless it is both
 * known AND different. `title` is the full both-ways sentence for the tooltip.
 */
export function eventClock(at, hostZone) {
  const date = new Date(at)
  const mine = viewerZone()
  const local = format(date, 'HH:mm')
  const localZone = zoneLabel(mine, date)
  const host = hostZone ? timeInZone(date, hostZone) : null
  // Same wall-clock reading means the two zones agree right now (which is not
  // the same as being the same zone - Lisbon and London agree all year, and
  // that is exactly when a second line is worth nothing).
  const differs = !!host && host !== local
  const hostLabel = hostZone ? (zoneLabel(hostZone, date) || shortZoneName(hostZone)) : ''
  return {
    local,
    localZone,
    host: differs ? host : null,
    hostZone: differs ? hostLabel : '',
    differs,
    title: differs
      ? `${dateTimeInZone(date, mine)} your time\n${dateTimeInZone(date, hostZone)} ${hostLabel} (host)`
      : `${dateTimeInZone(date, mine) || format(date, 'EEE d MMM, HH:mm')} your time`,
  }
}

/** "Europe/Lisbon" -> "Lisbon". The last path segment, underscores removed. */
export function shortZoneName(zone) {
  if (!zone) return ''
  return zone.split('/').pop().replace(/_/g, ' ')
}
