import { dateTag } from './utils'

// A WINDOW IN WORDS (7 Oct 2026).
//
// Ethan, of the double points boost: rather than "from Thursday 00:01", "just say 'Videos posted on Thursday and
// Friday', or just Friday, whatever the date I put in". A window that covers whole days is said as the days; one
// that starts or ends inside a day keeps its times. A start a few minutes after midnight (the boost above was saved
// for 00:01) and an end a few minutes either side of the next midnight still count as whole days.
const SLACK_MS = 10 * 60000

const dayName = (d) => d.toLocaleDateString(dateTag(), { weekday: 'long' })
const dayDate = (d) => d.toLocaleDateString(dateTag(), { weekday: 'long', day: 'numeric', month: 'short' })
const time = (d) => d.toLocaleTimeString(dateTag(), { hour: '2-digit', minute: '2-digit' })

function midnightOf(d) {
  const m = new Date(d)
  m.setHours(0, 0, 0, 0)
  return m
}

/** The whole days a window covers, or null when it starts or ends part-way through a day. */
export function wholeDays(startIso, endIso) {
  const s = new Date(startIso)
  const e = new Date(endIso)
  if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime()) || e <= s) return null
  const s0 = midnightOf(s)
  if (s - s0 > SLACK_MS) return null
  // The end lands near a midnight: either just after it (00:01 the next day) or just before it (23:59).
  let e0 = midnightOf(e)
  if (e - e0 > SLACK_MS) {
    const next = new Date(e0); next.setDate(next.getDate() + 1)
    if (next - e > SLACK_MS) return null
    e0 = next
  }
  const days = []
  for (const d = new Date(s0); d < e0; d.setDate(d.getDate() + 1)) days.push(new Date(d))
  return days.length ? days : null
}

/**
 * "on Thursday", "on Thursday and Friday", "from Thursday to Sunday", or with times when the window is not whole days:
 * "on Thursday, 14:00 to 17:00" / "from Thursday 14:00 to Friday 09:00". Within the coming week it names the weekday;
 * further out it adds the date so "Thursday" cannot mean the wrong one.
 */
export function windowPhrase(startIso, endIso, tr = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v?.[k] ?? '')) {
  const s = new Date(startIso)
  const e = new Date(endIso)
  const far = s - Date.now() > 6 * 86400000 || Date.now() - s > 6 * 86400000
  const name = far ? dayDate : dayName
  const days = wholeDays(startIso, endIso)
  if (days) {
    if (days.length === 1) return tr('on {a}', { a: name(days[0]) })
    if (days.length === 2) return tr('on {a} and {b}', { a: name(days[0]), b: name(days[1]) })
    return tr('from {a} to {b}', { a: name(days[0]), b: name(days[days.length - 1]) })
  }
  if (midnightOf(s).getTime() === midnightOf(e).getTime()) return tr('on {a}, {t1} to {t2}', { a: name(s), t1: time(s), t2: time(e) })
  return tr('from {a} {t1} to {b} {t2}', { a: name(s), t1: time(s), b: name(e), t2: time(e) })
}
