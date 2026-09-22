// GROUPING FOR THE PAYOUTS TAB (23 Sep 2026).
//
// Ethan: "everything seems mixed in with each other, this could be confusing
// when we have multiple challenges going on at once. I think they should be
// split into sections like for each challenge, or if referral reward or
// milestone."
//
// One section per challenge (the running ones first, then the most recently
// ended), then milestone rewards, then anything left over. REFERRAL REWARDS
// ARE NOT INCLUDED HERE - `ReferralSection` on the page already gives them
// their own section with their own explanation, and grouping them a second
// time here would show every referral twice.
export function groupRewards(rewards, challengesById = {}) {
  const byChallenge = new Map()
  const milestone = []
  const other = []

  for (const r of rewards) {
    if (r.source === 'referral') continue
    if (r.challenge_id) {
      if (!byChallenge.has(r.challenge_id)) byChallenge.set(r.challenge_id, [])
      byChallenge.get(r.challenge_id).push(r)
    } else if (r.source === 'milestone') {
      milestone.push(r)
    } else {
      other.push(r)
    }
  }

  const challengeGroups = [...byChallenge.entries()].map(([id, rows]) => {
    const ch = challengesById[id] || {}
    return {
      key: `challenge:${id}`,
      kind: 'challenge',
      id,
      title: ch.title || rows[0]?.challenges?.title || 'Untitled challenge',
      status: ch.status || null,
      endDate: ch.end_date || null,
      rows,
    }
  })

  // RUNNING FIRST, THEN MOST RECENTLY ENDED. A challenge still taking entries
  // is the one an admin is checking today; a challenge that ended a year ago
  // is the one they are checking least.
  const isRunning = (g) => g.status === 'active' && (!g.endDate || new Date(g.endDate) >= new Date())
  challengeGroups.sort((a, b) => {
    const ar = isRunning(a)
    const br = isRunning(b)
    if (ar !== br) return ar ? -1 : 1
    const ad = a.endDate ? new Date(a.endDate).getTime() : 0
    const bd = b.endDate ? new Date(b.endDate).getTime() : 0
    return bd - ad
  })

  const groups = [...challengeGroups]
  if (milestone.length) groups.push({ key: 'milestone', kind: 'milestone', title: 'Milestone rewards', rows: milestone })
  if (other.length) groups.push({ key: 'other', kind: 'other', title: 'Other rewards', rows: other })
  return groups
}
