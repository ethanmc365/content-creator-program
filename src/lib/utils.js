// Small shared helpers used across the app.
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns'

/** "12 Jun 2026" */
export function formatDate(date) {
  if (!date) return '—'
  return format(new Date(date), 'd MMM yyyy')
}

/** "12 Jun, 14:30" */
export function formatDateTime(date) {
  if (!date) return '—'
  return format(new Date(date), 'd MMM, HH:mm')
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

/** 184230 → "184.2k" — used for logged view counts. */
export function formatViews(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

/** "£150.00" */
export function formatMoney(amount, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount)
}

/**
 * Detect which platform a pasted video link belongs to —
 * used to auto-select the platform on the submission form.
 */
export function detectPlatform(url = '') {
  const u = url.toLowerCase()
  if (u.includes('instagram.com')) return 'Instagram'
  if (u.includes('tiktok.com')) return 'TikTok'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube'
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

/** The two DM participants are stored unordered; get "the other person". */
export function otherParticipant(conversation, myId) {
  return conversation.participant_a === myId ? conversation.participant_b : conversation.participant_a
}

/** Tiny classNames combiner: cx('a', cond && 'b') → "a b" */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}
