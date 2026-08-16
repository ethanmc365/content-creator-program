// Add-to-calendar helpers. No dependencies, no server: we generate a standard
// .ics file (opens in Apple Calendar, Google Calendar, Outlook — everything)
// and a Google Calendar "template" URL for one-tap adding on the web.
//
// Times are written in UTC (the trailing Z), so whatever timezone the creator's
// calendar is set to, the event lands at the correct absolute moment.

function pad(n) { return String(n).padStart(2, '0') }

// Date -> "20260814T130000Z" (UTC, calendar-safe).
function stamp(date) {
  const d = new Date(date)
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

// Escape text per RFC 5545 (commas, semicolons, newlines).
function esc(text = '') {
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// Normalise an event to { title, start(Date/ISO), end?, description?, location? }.
// If no end is given we default to a 1-hour block.
function resolve(ev) {
  const start = new Date(ev.start)
  const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 60 * 60 * 1000)
  return { title: ev.title || 'Event', start, end, description: ev.description || '', location: ev.location || '' }
}

export function buildIcs(ev) {
  const { title, start, end, description, location } = resolve(ev)
  const uid = `${stamp(start)}-${Math.random().toString(36).slice(2, 10)}@trypcreators`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tryp.com Creator Program//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(title)}`,
    description && `DESCRIPTION:${esc(description)}`,
    location && `LOCATION:${esc(location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  return lines.join('\r\n')
}

/**
 * THE WHOLE CALENDAR IN ONE FILE.
 *
 * `buildIcs` writes one VEVENT wrapped in its own VCALENDAR, which is right for
 * "add this Q&A to my diary" and useless for the thing people actually want,
 * which is not to have to do that fourteen times. An .ics file may hold as many
 * VEVENTs as you like; concatenating fourteen single-event files does NOT work,
 * because each one carries its own BEGIN:VCALENDAR and every calendar app stops
 * reading at the first END:VCALENDAR.
 *
 * So the envelope is written once and the events go inside it.
 *
 * This is a SNAPSHOT, not a subscription. A subscription needs a stable URL the
 * calendar app can re-fetch, which needs an endpoint and a per-creator token;
 * a file you download today does not know about the Q&A added tomorrow. The
 * button says "Download" for that reason and the difference is worth keeping
 * honest - a "Subscribe" that quietly went stale would be worse than nothing.
 */
export function buildIcsFeed(events, name = 'Tryp.com Creator Program') {
  const body = events.flatMap((ev) => {
    const { title, start, end, description, location } = resolve(ev)
    return [
      'BEGIN:VEVENT',
      `UID:${stamp(start)}-${(ev.uid || title).replace(/[^a-z0-9]+/gi, '')}@trypcreators`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(title)}`,
      description && `DESCRIPTION:${esc(description)}`,
      location && `LOCATION:${esc(location)}`,
      'END:VEVENT',
    ].filter(Boolean)
  })
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tryp.com Creator Program//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(name)}`,
    ...body,
    'END:VCALENDAR',
  ].join('\r\n')
}

/** Download many events as one file. See buildIcsFeed. */
export function downloadIcsFeed(events, filename = 'tryp-calendar') {
  const blob = new Blob([buildIcsFeed(events)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Trigger a download of the .ics file. On mobile, tapping the downloaded file
// opens the default calendar app (Apple Calendar on iOS, etc.).
export function downloadIcs(ev) {
  const blob = new Blob([buildIcs(ev)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeName = (ev.title || 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)
  a.href = url
  a.download = `${safeName}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Google Calendar "add event" template URL (opens prefilled in a new tab).
export function googleCalendarUrl(ev) {
  const { title, start, end, description, location } = resolve(ev)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: description,
    location,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
