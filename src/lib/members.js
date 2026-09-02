import { isHiddenTestRow } from './testData'

// WHO COUNTS AS A MEMBER OF A MARKET.
//
// The market page said UK & Ireland had 44 creators and the manage page said 51,
// which is the kind of disagreement that makes somebody stop trusting both
// numbers. Neither was lying: they were two different queries written months
// apart, and they filtered different things.
//
// The 51 was the honest row count of `community_members`, and it included six
// people who had APPLIED to the market and not been approved, plus the QA
// account and the view-as-creator sandbox. None of those is a member: a pending
// applicant cannot post, cannot read the rooms, and may yet be declined.
//
// So there is one predicate now and both pages use it. If the definition ever
// needs to change it changes here, and it cannot change in one place only.

/**
 * Is this profile a real person who is really in the market?
 * @param {{status?: string, is_test?: boolean, is_sandbox?: boolean, deletion_requested_at?: string}} p
 */
export function isRealMember(p) {
  if (!p) return false
  if (p.status !== 'active') return false      // pending applicants and suspended accounts
  // `is_test` DEPENDS ON WHO IS ASKING. For everybody in the community it means
  // exactly what it always meant - not a real person, not in the roster. For the
  // demo admin account handed to the Tryp.com team it means the opposite: these
  // are the people the demo is made of. See lib/testData for the whole argument.
  if (isHiddenTestRow(p)) return false
  // `is_sandbox` is NOT viewer-aware and should not be. It marks the internal
  // accounts themselves - the QA logins, the view-as-creator shell, the team's
  // own demo account - and a demo of a community should no more list those than
  // a real one should.
  if (p.is_sandbox) return false
  if (p.deletion_requested_at) return false    // on the way out
  return true
}

/**
 * The people in a market, split the way the pages actually talk about them.
 *
 * ADMINS ARE COUNTED. Ethan runs UK & Ireland and expected to be in its number -
 * he is a member of it, he is in the rooms, and a market that says "44 creators"
 * while he stands in it is describing a room he is not in. He is counted as
 * team rather than as a creator, so both numbers stay true.
 *
 * @param {Array<{profiles?: object, role?: string}>} rows community_members rows with profiles joined
 */
export function splitMembers(rows = []) {
  const real = rows.filter((r) => isRealMember(r.profiles || r))
  const team = real.filter((r) => (r.profiles || r).is_admin)
  const creators = real.filter((r) => !(r.profiles || r).is_admin)
  return { all: real, team, creators, total: real.length }
}

/** The one number a market's headline shows. */
export function memberCount(rows = []) {
  return splitMembers(rows).total
}
