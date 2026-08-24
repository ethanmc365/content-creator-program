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
export function timeAgo(date) {
  if (!date) return ''
  return formatDistanceToNow(new Date(date), { addSuffix: true })
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
// in landing_stats() (migration 060).
export const PRIZE_BASELINE = 500

/** "£150" for whole amounts, "£12.50" when there are pennies. */
export function formatMoney(amount, currency = 'GBP') {
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

/**
 * Download an array of objects as a CSV file (used by admin exports).
 * Handles commas/quotes/newlines inside values safely.
 */
export function downloadCsv(filename, rows) {
  if (!rows?.length) return
  const headers = Object.keys(rows[0])
  const escape = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
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
