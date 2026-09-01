// ONE CHALLENGE, MORE THAN ONE LEADERBOARD.
//
// Spain runs a single brief with the community split in two, each half racing
// its own board for its own prize. Ethan: "we need to build this feature into
// challenges when creating them and also the functionality and the UI to have
// multiple leaderboards for the same challenge."
//
// A group is a PARTITION OF THE ENTRANTS, not a copy of the contest - see
// migration 154 for why that distinction is the whole design. Everything in
// this file follows from it:
//
//   * a challenge with no groups behaves exactly as it always has. Every
//     function here returns the single-board answer for an empty group list,
//     so no caller needs an `if`.
//   * a creator is in at most one group, so "which board am I on" is a lookup
//     and never a decision.
//   * the COMBINED number is the sum of the groups' numbers, always. That is
//     what lets the analytics page show one figure for the challenge and the
//     breakdown behind it without two queries that can disagree.
//
// Pure functions, so the arithmetic behind a leaderboard people compete on is
// testable without a database. See challengeGroups.test.js.

/** The pseudo-group everybody who has not been dealt into one lands in. */
export const UNGROUPED = { id: null, name: 'Not in a group' }

/**
 * creatorId -> groupId, from the membership rows.
 * @param {Array<{creator_id: string, group_id: string}>} members
 */
export function groupByCreator(members = []) {
  const m = new Map()
  for (const row of members) m.set(row.creator_id, row.group_id)
  return m
}

/**
 * The boards a challenge actually has, in order, INCLUDING the unassigned one
 * when somebody has entered without being dealt in.
 *
 * The unassigned board is not decoration. A creator an admin forgot to place
 * still submits, still has views, and dropping them off the page entirely would
 * be the platform quietly disqualifying them - so they get a board of their own
 * with a name that says what has happened and can be fixed.
 *
 * @param {Array} groups   challenge_groups rows
 * @param {Map}   byCreator  from groupByCreator
 * @param {Array} rows     anything with a creator_id (submissions or results)
 */
export function boardsFor(groups = [], byCreator = new Map(), rows = []) {
  if (groups.length === 0) return []
  const ordered = [...groups].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const orphan = rows.some((r) => !byCreator.get(r.creator_id))
  return orphan ? [...ordered, UNGROUPED] : ordered
}

/**
 * Split rows (submissions or results) by the group their creator is in.
 * @returns {Map<string|null, Array>} keyed by group id, null for unassigned
 */
export function splitByGroup(rows = [], byCreator = new Map()) {
  const out = new Map()
  for (const r of rows) {
    const key = byCreator.get(r.creator_id) ?? null
    if (!out.has(key)) out.set(key, [])
    out.get(key).push(r)
  }
  return out
}

/**
 * What one board amounts to: how many creators entered, how many entries, how
 * many views, and the best single video on it.
 *
 * `views` sums every entry, which is the figure the programme is measured on;
 * `best` is the top single video, which is what a best-video challenge ranks
 * by. Both are here because which one matters depends on the scoring mode and
 * the comparison table shows them side by side either way.
 */
export function totalsFor(submissions = []) {
  const creators = new Set()
  let views = 0
  let best = 0
  for (const s of submissions) {
    creators.add(s.creator_id)
    const v = Number(s.logged_views) || 0
    views += v
    if (v > best) best = v
  }
  return {
    creators: creators.size,
    entries: submissions.length,
    views,
    best,
    // Views per entry, which is the only fair way to compare two groups of
    // different sizes - and comparing them is the point of splitting them.
    perEntry: submissions.length ? Math.round(views / submissions.length) : 0,
  }
}

/**
 * The comparison table behind a challenge's analytics: one row per board plus
 * the combined figure, with each board's share of the total.
 *
 * Ethan: "the analytics page should combine the data as just the one challenge,
 * but clicking in on the challenge data should reveal more data and analytics
 * from the different groups and comparing each."
 *
 * The combined row is computed from the SAME submissions the per-group rows
 * come from, so the two can never disagree - it is not a second query.
 */
export function compareBoards(groups = [], members = [], submissions = []) {
  const byCreator = groupByCreator(members)
  const boards = boardsFor(groups, byCreator, submissions)
  const split = splitByGroup(submissions, byCreator)
  const combined = totalsFor(submissions)
  const rows = boards.map((g) => {
    const t = totalsFor(split.get(g.id) ?? [])
    return {
      id: g.id,
      name: g.name,
      ...t,
      // A share of zero total is 0, not NaN. A brand new challenge shows a row
      // of zeroes rather than a row of "NaN%".
      share: combined.views > 0 ? Math.round((t.views / combined.views) * 100) : 0,
    }
  })
  return { combined, rows }
}

/**
 * The prize a board is playing for. Null fields fall through to the
 * challenge's own, so a two-group challenge with one prize pot does not have to
 * state the same prize twice.
 */
export function prizeForGroup(group, challenge) {
  if (!group?.id) return challenge
  return {
    prize_amount: group.prize_amount ?? challenge?.prize_amount ?? null,
    prize_currency: group.prize_currency ?? challenge?.prize_currency ?? 'EUR',
    prize_type: group.prize_type ?? challenge?.prize_type ?? null,
    winners_count: group.winners_count ?? challenge?.winners_count ?? null,
    prize_structure: (Array.isArray(group.prize_structure) && group.prize_structure.length > 0)
      ? group.prize_structure
      : (challenge?.prize_structure ?? []),
  }
}

/**
 * Deal creators round-robin over a shuffled list - the same rule
 * `split_challenge_groups` uses in the database, so the preview an admin sees
 * before pressing the button matches what the button does.
 *
 * INDEPENDENT RANDOM CHOICES ARE NOT A SPLIT. Picking a random group per
 * creator gives 13/7 out of 20 about one time in eight, and a split that can
 * come out lopsided is not what anybody means by splitting evenly. Shuffling
 * once and dealing in turn is random in the only way that matters - who ends up
 * where - and exactly even by construction.
 *
 * @param {Array<string>} creatorIds
 * @param {Array<string>} groupIds
 * @param {function} rnd  injectable for the test; defaults to Math.random
 */
export function dealEvenly(creatorIds = [], groupIds = [], rnd = Math.random) {
  if (groupIds.length === 0) return new Map()
  const shuffled = [...creatorIds]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const out = new Map()
  shuffled.forEach((id, i) => out.set(id, groupIds[i % groupIds.length]))
  return out
}
