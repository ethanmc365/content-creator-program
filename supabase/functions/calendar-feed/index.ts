// Supabase Edge Function: calendar-feed
//
// THE CALENDAR AS A URL, WHICH IS THE ONLY THING APPLE AND GOOGLE WILL SYNC.
//
// Ethan: "it's a pain having to just click add events or add all events,
// download the file and then click to open the file, it would be much smoother
// if you could build in a way to actually automatically show the events on the
// creators personal calendars too."
//
// The honest answer to "automatic sync" for a web app is NOT the Google
// Calendar API. That is an OAuth consent screen, a verification review, a
// refresh-token store and a write path that has to reconcile edits and
// deletions in somebody else's calendar - and it would still do nothing for
// Apple Calendar, which has no equivalent API at all.
//
// What both of them DO support, and have since forever, is subscribing to an
// iCalendar URL and re-fetching it on their own. Apple polls it, Google polls
// it, Outlook polls it. Add an event on the platform and it appears in their
// diary without anybody pressing anything. That is the feature; this endpoint
// is all of it.
//
// AUTHENTICATION IS THE TOKEN AND NOTHING ELSE. The fetcher is Apple's server,
// not the creator's browser: there is no session, no cookie and no header we
// control. So the URL carries a 48-character secret, `verify_jwt` is OFF for
// this function, and the token maps to exactly one creator through
// `calendar_feed_tokens`. It can be rotated from Settings, which is the reason
// that RPC exists.
//
// WHAT IT CONTAINS is decided in Postgres by `calendar_feed(token)`, not here.
// The scoping rules - your markets' events, your own personal events, your
// challenge dates, your own flights - belong next to the data. This function
// formats.
//
// Deploy:  supabase functions deploy calendar-feed --no-verify-jwt

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function pad(n: number) { return String(n).padStart(2, '0') }

// Date -> "20260814T130000Z". Everything is written in UTC so the reader's own
// timezone setting decides what it shows, which is what we want: one creator's
// feed opened on a phone in Lisbon and a laptop in Bucharest must agree.
function stamp(value: string | Date) {
  const d = new Date(value)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

// RFC 5545 escaping. Backslash first or it escapes its own output.
function esc(text: string) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// RFC 5545 says no line may exceed 75 OCTETS, and continuation lines begin with
// a single space. Most readers tolerate long lines; Outlook is the one that does
// not, and a description with a meeting link in it is exactly the field that
// goes over. Folding on octets rather than characters matters because a creator
// writing an accented city name would otherwise be cut mid-codepoint.
function fold(line: string) {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let start = 0
  while (start < bytes.length) {
    let take = Math.min(start === 0 ? 75 : 74, bytes.length - start)
    // Do not split a UTF-8 sequence: continuation bytes are 10xxxxxx.
    while (take > 1 && (bytes[start + take] & 0xc0) === 0x80) take--
    const chunk = new TextDecoder().decode(bytes.slice(start, start + take))
    out.push(start === 0 ? chunk : ` ${chunk}`)
    start += take
  }
  return out.join('\r\n')
}

type Row = {
  uid: string
  title: string
  starts_at: string
  ends_at: string
  description: string | null
  location: string | null
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') ?? ''

  // A short, constant reply for a bad token. Calendar clients retry for months
  // after somebody rotates their key, and a 404 is what tells them to stop.
  if (!/^[a-f0-9]{32,96}$/.test(token)) {
    return new Response('Not found', { status: 404 })
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/calendar_feed`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_token: token }),
  })
  if (!res.ok) return new Response('Not found', { status: 404 })
  const rows: Row[] = await res.json()

  const now = stamp(new Date())
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tryp.com Creator Program//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Tryp.com Creator Program',
    'X-WR-CALDESC:Your events, challenge dates and flights',
    // How often the client should come back. Apple honours the first, Google
    // the second; both are hints and both are ignored often enough that the
    // help text on the page says "within a day" rather than promising an hour.
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    // THE SUBSCRIPTION ARRIVES IN TRYP.COM ORANGE RATHER THAN WHATEVER COLOUR
    // WAS NEXT IN THE ROTA. Two spellings because the readers disagree:
    // RFC 7986 COLOR takes a CSS3 colour NAME (a hex triplet there is invalid
    // and gets dropped), and Apple's own extension takes hex with alpha. Google
    // honours neither and assigns its own; it is a hint everywhere, so nothing
    // downstream depends on it landing.
    'COLOR:orangered',
    'X-APPLE-CALENDAR-COLOR:#D94407FF',
  ]

  for (const r of rows) {
    lines.push(
      'BEGIN:VEVENT',
      // A STABLE UID IS WHAT MAKES THIS A SYNC RATHER THAN A RE-IMPORT. If the
      // uid changed between fetches, every poll would add a second copy of
      // every event instead of updating the one already there.
      `UID:${r.uid}@trypcreators`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(r.starts_at)}`,
      `DTEND:${stamp(r.ends_at)}`,
      fold(`SUMMARY:${esc(r.title)}`),
    )
    if (r.description) lines.push(fold(`DESCRIPTION:${esc(r.description)}`))
    if (r.location) lines.push(fold(`LOCATION:${esc(r.location)}`))
    // Per-event colour as well as per-calendar: a reader that merges the feed
    // into an existing calendar (rather than creating its own) only ever sees
    // this one. Same CSS3 name, same caveat - a hint, not a guarantee.
    lines.push('COLOR:orangered')
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')

  return new Response(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="tryp-creator-calendar.ics"',
      // Let the fetchers cache briefly but never let a shared proxy hold one
      // creator's calendar and hand it to another.
      'Cache-Control': 'private, max-age=300',
    },
  })
})
