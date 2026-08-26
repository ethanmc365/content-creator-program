import { formatViews } from './utils'

// What a milestone measures, and how to say it.
//
// ONE PLACE, because the same five sentences were being written three times.
// The route drew "3 of 10 videos", the profile snippet drew "3 of 10", and the
// admin editor called the same metric "Creators brought in" while the creator's
// summary tile called it "Creators referred". None of those disagreed by
// intent; they disagreed because there were three copies. A milestone is now a
// SET of requirements rather than one, so there would have been three copies of
// a loop as well.

export const METRICS = [
  {
    value: 'views',
    label: 'Views',
    noun: 'views',
    hint: 'Every logged view across every entry, added up.',
    fmt: (n) => formatViews(Math.floor(n)),
    icon: 'eye',
  },
  {
    value: 'videos',
    label: 'Videos posted',
    noun: 'videos',
    one: 'video',
    hint: 'Entries submitted to any challenge.',
    fmt: (n) => String(Math.floor(n)),
    icon: 'video',
  },
  {
    // RENAMED FROM "creators brought in". Same number, and "referred" is the
    // word used by the referrals page, the invoice line and the admin panel,
    // so this was the only surface calling it something else.
    value: 'referrals',
    label: 'Creators referred',
    noun: 'referred',
    hint: 'Referrals who went on to post a video.',
    fmt: (n) => String(Math.floor(n)),
    icon: 'share',
  },
  {
    value: 'challenges',
    label: 'Challenges entered',
    noun: 'challenges',
    one: 'challenge',
    hint: 'Distinct challenges, however many entries in each.',
    fmt: (n) => String(Math.floor(n)),
    icon: 'trophy',
  },
  {
    value: 'podiums',
    label: 'Top-three finishes',
    noun: 'podiums',
    one: 'podium',
    hint: 'Finishing first, second or third on a published leaderboard.',
    fmt: (n) => String(Math.floor(n)),
    icon: 'star',
  },
  {
    value: 'best_video',
    label: 'Best single video',
    noun: 'on one video',
    hint: 'Views on the single best-performing entry, not the total.',
    fmt: (n) => formatViews(Math.floor(n)),
    icon: 'chart',
  },
  {
    // RENAMED FROM "days in the programme". A creator is in a community, and
    // the word "programme" appears nowhere else a creator can see.
    value: 'days',
    label: 'Time in the community',
    noun: 'in',
    hint: 'Since being accepted. Set it in days, months or years.',
    fmt: (n) => String(Math.floor(n)),
    icon: 'clock',
  },
]

export const METRIC_BY_VALUE = Object.fromEntries(METRICS.map((m) => [m.value, m]))

// The hints are gone on purpose. "Merch" needs no gloss, and a form that
// explains every one of its own labels is a form nobody reads. Only `role`
// keeps one, because it is the only kind that changes something outside this
// page - it puts a word beside the creator's name.
export const REWARD_KINDS = [
  { value: 'merch', label: 'Merch' },
  { value: 'voucher', label: 'Voucher' },
  { value: 'role', label: 'Role', hint: 'A title worn beside their name.' },
  { value: 'other', label: 'Something else' },
]

// WHAT KIND OF REWARD IT IS, SAID IN A WORD.
//
// It used to be said in a COLOUR - merch orange, voucher green, role black -
// which asked the reader to learn a key nobody published, and put a slab of
// solid ink in the middle of an orange drawing whenever a stop granted a title.
// A word costs six characters and needs no decoding.
export const REWARD_NOUN = {
  merch: 'Merch',
  voucher: 'Voucher',
  role: 'Role',
  other: '',
}

// TIME IS STORED IN DAYS AND TYPED IN WHATEVER SUITS.
//
// "180 days" is not a milestone anybody would set on purpose; "six months" is.
// But comparing months needs a calendar and the ladder compares numbers, so
// days is the canonical unit and the unit the admin picked rides along for the
// round trip. The factors are the mean lengths, which is why 6 months is 183
// days rather than 180 - the conversion is reversible, which matters more here
// than matching any particular calendar month.
export const UNIT_FACTOR = { days: 1, months: 30.4375, years: 365.25 }
export const UNITS = [
  { value: 'days', label: 'days' },
  { value: 'months', label: 'months' },
  { value: 'years', label: 'years' },
]

/** Days, from a number the admin typed and the unit they picked. */
export function toDays(value, unit) {
  return Math.max(1, Math.round(Number(value || 0) * (UNIT_FACTOR[unit] || 1)))
}

/**
 * Back the other way, for putting the stored threshold into the input.
 *
 * THE ROUND TRIP HAS TO BE EXACT, and dividing is not enough to make it so.
 * Six months is stored as 183 days, and 183 / 30.4375 is 6.0123 - so an admin
 * who typed "6 months", saved, and reopened the form was shown "6.01 months",
 * and saving again would have stored 183 again but displayed 6.01 forever. The
 * error is small and it is also permanent and visible, which is the worst
 * combination for a number somebody has to trust.
 *
 * So: work out what whole number of this unit would produce exactly this many
 * days, and if there is one, that is what was typed. Only a threshold that
 * genuinely is not a whole number of months falls through to the decimal.
 */
export function fromDays(days, unit) {
  const d = Number(days || 0)
  const n = d / (UNIT_FACTOR[unit] || 1)
  const whole = Math.round(n)
  if (whole >= 1 && toDays(whole, unit) === Math.round(d)) return whole
  return Math.round(n * 100) / 100
}

/**
 * What one requirement asks for, on its own. "10 videos", "six months".
 * @param {{metric: string, threshold: number, unit?: string}} c
 */
export function criterionNeed(c) {
  const m = METRIC_BY_VALUE[c.metric]
  if (!m) return ''
  if (c.metric === 'days') {
    const unit = c.unit || 'days'
    const n = fromDays(c.threshold, unit)
    return `${n} ${n === 1 ? unit.replace(/s$/, '') : unit}`
  }
  // "1 videos" is the kind of thing that makes a page look unfinished, and the
  // first stop on the live ladder asks for exactly one video.
  const noun = Number(c.threshold) === 1 && m.one ? m.one : m.noun
  return `${m.fmt(c.threshold)} ${noun}`
}

/**
 * The same requirement with the creator's own number in front of it, which is
 * the version that belongs anywhere they can see their progress.
 * "23.5k of 100k views".
 */
export function criterionLabel(c) {
  const m = METRIC_BY_VALUE[c.metric]
  if (!m) return ''
  if (c.metric === 'days') {
    const unit = c.unit || 'days'
    const have = fromDays(c.value, unit)
    const need = fromDays(c.threshold, unit)
    return `${Math.floor(have)} of ${need} ${unit}`
  }
  return `${m.fmt(c.value)} of ${m.fmt(c.threshold)} ${m.noun}`
}

/** How far through one requirement, 0..1. */
export function criterionFraction(c) {
  const t = Number(c.threshold || 0)
  if (!(t > 0)) return 0
  return Math.max(0, Math.min(1, Number(c.value || 0) / t))
}

/**
 * How far through a whole stop: the MEAN of its requirements, not the best one.
 *
 * The mean is the honest answer for a stop that needs three things. Taking the
 * furthest-along requirement would show a creator at 95% of a milestone they
 * cannot reach for another four months, and taking the least would hide all the
 * work they have already done behind whichever requirement they started last.
 */
export function milestoneFraction(m) {
  const cs = m?.criteria || []
  if (!cs.length) return 0
  return cs.reduce((a, c) => a + criterionFraction(c), 0) / cs.length
}

/**
 * Reading a whole ladder in one go, so every surface agrees on where somebody is.
 *
 * `next` is the first stop NOT reached, which - because the stops are gated in
 * order - is always the one actually being worked towards. `blocked` are stops
 * whose own numbers are already met but which are waiting on an earlier one:
 * that is the state Ethan described, where a creator is past 100,000 views but
 * has not referred anybody, and it is worth naming rather than showing as an
 * unlit dot with no explanation.
 */
export function routeState(rows = []) {
  const list = rows || []
  const reached = list.filter((r) => r.reached).length
  const next = list.find((r) => !r.reached) || null
  const last = [...list].reverse().find((r) => r.reached) || null
  const blocked = list.filter((r) => r.blocked)
  return { rows: list, total: list.length, reached, next, last, blocked }
}

/**
 * A span of days, said the way a person would say it.
 *
 * "47 days" is right for a new creator and "486 days" is not - nobody counts
 * past a year in days. The thresholds are all in days underneath; this is only
 * ever the label.
 */
export function humanDays(days) {
  const d = Math.floor(Number(days || 0))
  if (d < 60) return `${d} ${d === 1 ? 'day' : 'days'}`
  if (d < 365) {
    const m = Math.round(d / UNIT_FACTOR.months)
    return `${m} ${m === 1 ? 'month' : 'months'}`
  }
  const y = Math.round((d / UNIT_FACTOR.years) * 10) / 10
  return `${y} ${y === 1 ? 'year' : 'years'}`
}
