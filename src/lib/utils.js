// Small shared helpers used across the app.
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns'

/** "12 Jun 2026" */
export function formatDate(date) {
  if (!date) return '-'
  return format(new Date(date), 'd MMM yyyy')
}

/** "12 Jun, 14:30" */
export function formatDateTime(date) {
  if (!date) return '-'
  return format(new Date(date), 'd MMM, HH:mm')
}

/** The viewer's short timezone label, e.g. "GMT+1". Empty string if unknown. */
export function tzLabel(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date(date))
    return parts.find((p) => p.type === 'timeZoneName')?.value || ''
  } catch {
    return ''
  }
}

/** "12 Jun, 14:30 GMT+1" — same as formatDateTime but with the viewer's zone
 *  appended so a creator anywhere knows the time is shown in THEIR local time.
 *  (Times are stored in UTC and rendered in the browser's zone automatically.) */
export function formatDateTimeTz(date) {
  if (!date) return '-'
  const base = format(new Date(date), 'd MMM, HH:mm')
  const tz = tzLabel(date)
  return tz ? `${base} ${tz}` : base
}

/**
 * The timestamp on a message.
 *
 * WHAT WAS WRONG WITH THE OLD ONES. There were two, and both threw away the
 * thing you wanted. `formatChatTime` gave "Yesterday" and "12 Jun" - a date
 * with no time on it, so you could never tell whether a message landed at
 * breakfast or at midnight. `timeAgo` gave "6 days ago", which is worse: it is
 * arithmetic the reader has to undo before it means anything, and past about a
 * day nobody thinks in days-ago. "11 days ago" is not a time. It is a puzzle
 * whose answer is a time.
 *
 * WHAT THIS DOES. Inside today, relative - "3 hours ago" is genuinely how you
 * think about something that happened this morning, and the exact minute does
 * not matter yet. Beyond today, the actual day AND the actual time, because by
 * then the minute is the only thing that distinguishes one message from
 * another. The year appears only when it is not this one.
 *
 * The full stamp is always available on hover via `messageTimeTitle`.
 */
export function formatMessageTime(date) {
  if (!date) return ''
  const d = new Date(date)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)

  // Clock skew, or a message that arrived a moment ago and is optimistically
  // rendered before the server stamps it. Either way "in 4 seconds" is wrong.
  if (mins < 1) return 'Just now'
  if (isToday(d)) {
    if (mins < 60) return `${mins} min ago`
    const hrs = Math.round(mins / 60)
    return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`
  }
  if (isYesterday(d)) return `Yesterday at ${format(d, 'HH:mm')}`
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return format(d, sameYear ? "d MMM 'at' HH:mm" : "d MMM yyyy 'at' HH:mm")
}

/** The unabbreviated stamp, for a `title` tooltip next to the short one. */
export function messageTimeTitle(date) {
  if (!date) return ''
  return formatDateTimeTz(date)
}

/** Chat-friendly timestamp: "14:30" today, "Yesterday", else "12 Jun". */
export function formatChatTime(date) {
  const d = new Date(date)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'd MMM')
}

/** "3 days ago" */
// "3 days ago" up to three days, then a plain date.
//
// Ethan: "rather than 9 days ago, or 1 month ago, if it was over 3 days ago
// always just show the date in date format dd/mm/yyyy." He is right about where
// the line is. Relative time is useful exactly while it is still a mental
// shortcut - today, yesterday, a couple of days - and past that it becomes work:
// "1 month ago" is a number you have to convert back into a date before it
// means anything, and it is wrong by up to a month while you do it.
export function postedOn(date) {
  if (!date) return ''
  const d = new Date(date)
  const days = (Date.now() - d.getTime()) / 86400000
  if (days < 3) return timeAgo(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function timeAgo(date) {
  if (!date) return ''
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

/**
 * "2h", "3d", "5w" - the timestamp a CHAT LIST uses.
 *
 * `timeAgo` writes a sentence ("about 2 hours ago"), which is right beside a
 * notification and wrong at the end of a room row: on a 375px phone it took a
 * third of the line and squeezed the room's own name down to "Announce…". A
 * list of rooms wants the shape of the time, not a reading of it.
 */
export function shortAgo(date) {
  if (!date) return ''
  const then = new Date(date).getTime()
  if (!Number.isFinite(then)) return ''
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 60) return 'now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.round(days / 7)
  if (weeks < 53) return `${weeks}w`
  return `${Math.round(days / 365)}y`
}

/** 184230 → "184.2k" - used for logged view counts. */
export function formatViews(n) {
  if (n == null) return '-'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

// Prizes we handed out running challenges on WhatsApp before this platform
// existed. The public + in-app "prizes awarded" totals start from this baseline
// and add everything distributed on-platform. Keep in sync with the same literal

/** "£150" for whole amounts, "£12.50" when there are pennies. */
// EUROS BY DEFAULT, because that is what the programme reports in.
//
// THE BUG THIS FIXES: the default was GBP, and half a dozen surfaces called
// this with no currency at all over figures that had ALREADY been converted
// into euros - so the admin panel's "Cash prizes paid" showed €190 of spend
// wearing a pound sign. Ethan: "rewards/invoices payouts are in pounds and
// should be euros." Anything that genuinely is pounds passes 'GBP' and always
// did; nothing that is actually a per-row amount relies on this default.
export function formatMoney(amount, currency = 'EUR') {
  const whole = Number.isInteger(Number(amount))
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount || 0)
}

/**
 * Detect which platform a pasted video link belongs to -  * used to auto-select the platform on the submission form.
 */
export function detectPlatform(url = '') {
  const u = url.toLowerCase()
  if (u.includes('instagram.com')) return 'Instagram'
  if (u.includes('tiktok.com')) return 'TikTok'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube'
  if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.me')) return 'Facebook'
  return 'Other'
}

// WHY AN EXPORT LOOKED "VERY MESSY" WHEN IT OPENED.
//
// Ethan opened an admin export in Excel and got a mess. It was not the data -
// it was three things this function did not do, and all three are invisible
// until a spreadsheet reads the file:
//
//   1. NO BYTE ORDER MARK. Excel opens a .csv as the system codepage, not
//      UTF-8, unless the file starts with a BOM. So "Denisa Hadarau" with its
//      real diacritics, every Spanish and Romanian name, and every emoji in a
//      market column arrived as mojibake.
//   2. BARE NEWLINES. Excel on Windows wants CRLF between records; with LF
//      alone a value containing a line break can run rows together.
//   3. NO FORMULA GUARD. A cell starting with = + - or @ is evaluated as a
//      FORMULA. Every phone number beginning "+44" opened as an error, and a
//      value like "-3" could too. Prefixing a tab tells the spreadsheet it is
//      text, and is also what stops a CSV export being an injection vector into
//      whoever opens it.
//
// Headers are titled from the key ("countries_visited" -> "Countries visited")
// so a column reads like a heading rather than a database field. Pass
// `columns` to control the order and the labels exactly.

/** "countries_visited" -> "Countries visited" */
export function csvHeader(key) {
  const words = String(key).replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** One CSV cell: quoted when it has to be, and never a formula. */
export function csvCell(value) {
  let s = value == null ? '' : String(value)
  // A tab in front keeps the value text without changing what a human reads.
  if (/^[=+\-@\t\r]/.test(s)) s = '\t' + s
  return /["\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** The whole file as a string, so it can be tested without a DOM. */
export function toCsv(rows, columns) {
  if (!rows?.length) return ''
  const cols = columns?.length
    ? columns.map((c) => (typeof c === 'string' ? { key: c, label: csvHeader(c) } : c))
    : Object.keys(rows[0]).map((k) => ({ key: k, label: csvHeader(k) }))
  const lines = [
    cols.map((c) => csvCell(c.label)).join(','),
    ...rows.map((r) => cols.map((c) => csvCell(r[c.key])).join(',')),
  ]
  return lines.join('\r\n')
}

/**
 * Download an array of objects as a CSV file (used by admin exports).
 * `columns` is optional: a list of keys, or of { key, label }.
 */
export function downloadCsv(filename, rows, columns) {
  if (!rows?.length) return
  // \uFEFF is the BOM. Without it Excel is not reading UTF-8, whatever the
  // charset in the mime type says.
  const blob = new Blob(['\uFEFF' + toCsv(rows, columns)], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

// ---- Date of birth (typed as DD/MM/YYYY, stored as an ISO date) ----

/** "25/01/2005" → "2005-01-25" for storage. Returns null if invalid/incomplete. */
export function parseDob(input = '') {
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const day = +m[1], month = +m[2], year = +m[3]
  const d = new Date(year, month - 1, day)
  // Reject impossible dates (e.g. 31/02) and absurd years.
  if (d.getDate() !== day || d.getMonth() !== month - 1 || d.getFullYear() !== year) return null
  if (year < 1900 || d > new Date()) return null
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** "2005-01-25" → "25/01/2005" for showing in the edit field. */
export function formatDobInput(iso) {
  if (!iso) return ''
  const [y, mo, d] = iso.split('-')
  return `${d}/${mo}/${y}`
}

/** Whole years between a dob (ISO date) and today. Null if no dob. */
export function ageFromDob(iso) {
  if (!iso) return null
  const dob = new Date(iso)
  if (Number.isNaN(dob.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age >= 0 ? age : null
}

/**
 * The moment a challenge actually closes. A challenge dated "30 Jul" should stay
 * open for the whole of the 30th and close at midnight — i.e. 00:00 on the 31st.
 * So we take the end_date's calendar day and return the start of the next day
 * (local time). Used for the countdown and to gate late submissions.
 */
export function challengeDeadline(endDate) {
  const d = new Date(endDate)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
  return d
}

// ---- Typed date + time (no calendar picker) ----

/** "25/01/2026" + "14:30" -> ISO string, or null if invalid/incomplete. */
export function parseDateTime(dateStr = '', timeStr = '') {
  const d = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const t = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!d || !t) return null
  const day = +d[1], month = +d[2], year = +d[3], hh = +t[1], mm = +t[2]
  if (month < 1 || month > 12 || day < 1 || day > 31 || hh > 23 || mm > 59) return null
  const dt = new Date(year, month - 1, day, hh, mm)
  if (dt.getDate() !== day || dt.getMonth() !== month - 1) return null
  return dt.toISOString()
}

/** ISO -> "25/01/2026" */
export function isoToDateInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** ISO -> "14:30" */
export function isoToTimeInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The two DM participants are stored unordered; get "the other person". */
export function otherParticipant(conversation, myId) {
  return conversation.participant_a === myId ? conversation.participant_b : conversation.participant_a
}

/** Tiny classNames combiner: cx('a', cond && 'b') → "a b" */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}
