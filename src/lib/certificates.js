// WHAT A CERTIFICATE SAYS, AND WHO GETS ONE.
//
// Pure, and therefore tested. What this module gets wrong is not visible in a
// screenshot: a placeholder that renders as the literal `{challenge}` on a
// milestone certificate looks fine in the builder, where the admin typed a
// challenge into the preview, and wrong on the one an actual creator receives.

/**
 * Fill `{placeholder}` from the facts frozen at award time.
 *
 * A LINE WHOSE DETAIL IS MISSING IS LEFT OUT WHOLE. This is the rule, it is the
 * one the builder tells admins about, and it is worth explaining because the
 * obvious alternative is worse.
 *
 * A design written for challenges ("for winning {challenge} in {market}") gets
 * reused for a milestone sooner or later. Printing `{challenge}` is obviously
 * broken. Dropping just the placeholder gives you "for winning  in ", so the
 * first version of this tried to repair the sentence afterwards - collapse the
 * spaces, strip the dangling preposition, tidy the comma. That is a regex
 * attempting English grammar, it failed its own tests on the second example
 * ("awarded to Sam for winning"), and every fix would have made it guess harder
 * about somebody else's wording.
 *
 * So the unit is the LINE, and the rule has no grammar in it: a line that
 * mentions something we cannot fill is not printed. An admin writes one clause
 * per line, the same way they would write an address, and what they get is
 * always a sentence somebody actually wrote rather than one this function
 * assembled.
 *
 * Returning '' when every line drops is deliberate too - the CARD decides what
 * an empty body looks like, because that is a design decision and this is not
 * the file that makes those.
 */
export function fillTemplate(text, facts = {}) {
  if (!text) return ''
  return String(text)
    .split('\n')
    .map((line) => fillLine(line, facts))
    .filter((line) => line !== null && line.trim() !== '')
    .join('\n')
}

/** One line, or null if it referred to something we do not have. */
function fillLine(line, facts) {
  let missing = false
  const out = line.replace(/\{(\w+)\}/g, (_, key) => {
    const value = factText(key, facts)
    if (value === '') { missing = true; return '' }
    return value
  })
  return missing ? null : out
}

/** One fact, formatted the way a certificate prints it. '' means "not known". */
function factText(key, facts) {
  const raw = facts?.[key]
  // `0` is a real view count and `false` is not a fact any of these carry, so
  // only null/undefined/'' count as missing. `raw || ''` would have printed a
  // zero-view certificate as though the number were unknown.
  if (raw === null || raw === undefined || raw === '') return ''
  if (key === 'views') return Number(raw).toLocaleString()
  if (key === 'place') return ordinal(Number(raw))
  if (key === 'date') return formatAwardDate(raw)
  return String(raw)
}

const ORDINALS = { 1: '1st', 2: '2nd', 3: '3rd' }

/** 1 -> "1st". English only; `tier` carries the meaning everywhere else. */
export function ordinal(n) {
  if (!Number.isFinite(n)) return ''
  return ORDINALS[n] || `${n}th`
}

/** A date on a certificate is a month and a year, never a time. */
export function formatAwardDate(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// THE TIERS, AND WHY THERE ARE FOUR.
//
// If everybody gets the same certificate for turning up, winning one means
// nothing - so the ladder has to be visible at a glance, from across a
// LinkedIn feed, without reading the words. Each tier gets its own accent and
// its own default emblem, and `rank` is what sorts a creator's wall so the rare
// one is at the top of it.
export const TIERS = [
  {
    key: 'achievement', rank: 0, label: 'Achievement',
    hint: 'Finishing on the podium. The rare one - keep it that way.',
    accent: '#d94407', emblem: 'trophy',
  },
  {
    key: 'honour', rank: 1, label: 'Honour',
    hint: 'Given by hand, for something no rule can spot.',
    accent: '#b8860b', emblem: 'star',
  },
  {
    key: 'milestone', rank: 2, label: 'Milestone',
    hint: 'Reaching a number: videos made, views, months in the community.',
    accent: '#0f766e', emblem: 'flag',
  },
  {
    key: 'participation', rank: 3, label: 'Participation',
    hint: 'Entering a challenge. Common on purpose - it is the first one anybody gets.',
    accent: '#475569', emblem: 'check',
  },
]

export const tierOf = (key) => TIERS.find((t) => t.key === key) || TIERS[0]

/** Newest first within a tier, rarest tier first. */
export function sortCertificates(rows = []) {
  return [...rows].sort((a, b) => {
    const byTier = tierOf(a.design?.tier).rank - tierOf(b.design?.tier).rank
    if (byTier !== 0) return byTier
    return new Date(b.awarded_at) - new Date(a.awarded_at)
  })
}

// The placeholders a design may use, for the builder's own help text. Keeping
// the list here rather than in the component means the one place that knows
// what `fillTemplate` understands is the module that implements it.
export const PLACEHOLDERS = [
  { key: 'name', example: 'Roxanna Travels', what: 'the creator' },
  { key: 'challenge', example: 'Hidden Gems', what: 'the challenge title' },
  { key: 'market', example: 'UK & Ireland', what: 'the market it ran in' },
  { key: 'place', example: '1st', what: 'where they finished' },
  { key: 'views', example: '124,500', what: 'their final view count' },
  { key: 'milestone', example: 'Ten videos', what: 'the milestone reached' },
  { key: 'date', example: '30 September 2026', what: 'when it was awarded' },
]
