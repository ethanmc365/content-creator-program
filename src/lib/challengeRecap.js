// THE END-OF-CHALLENGE RECAP: THE NUMBERS (24 Sep 2026).
//
// Ethan: "the end-of-challenge recap card... the Spotify wrap-style stats
// engine that the creators can then share if they want to. This just shows
// their own stats, like where they placed, the percentage of the creators that
// they've come in, and their top videos... take a lot of design inspo from
// that end of year card."
//
// Pure, so it is tested; the cards are components/wrapped/challengeStory.jsx
// and the runner is the Year in Review's own. The same rules the year recap
// learned the hard way apply here:
//
//   - VIEWS ARE THE SUM OF THE ENTRIES, never `results.final_views`: that is
//     the best single video on a views board and the SCORE on a points board.
//   - A PLACE IS SAID OUT LOUD ONLY WHEN IT IS WORTH SAYING. Podium, or the top
//     half as "top N%". Anybody else gets their work, not their rank - a recap
//     that tells somebody they came 31st of 40 is the one thing it must not do.
//   - The field is people who ENTERED, test accounts excluded.

const num = (v) => Number(v) || 0

/** Top N% of `field`, for rank `rank` (1 = best). Never 0%. */
export function topPercent(rank, field) {
  if (!rank || !field) return null
  return Math.max(1, Math.ceil((rank / field) * 100))
}

/**
 * @param {object} input
 * @param {object} input.challenge   the challenge row
 * @param {object} input.me          { id, name, photo_url, country }
 * @param {Array}  input.submissions every entry in the challenge
 *                                   { id, creator_id, logged_views, platform, video_url, thumbnail_url }
 * @param {Array}  input.results     { creator_id, rank, final_views, group_id }
 * @param {Array}  input.rewards     MY rewards in this challenge { amount, currency, reward_type, prize_slot }
 * @param {Set}    [input.hidden]    creator ids to leave out of the field (test accounts)
 */
export function buildChallengeRecap({ challenge, me, submissions = [], results = [], rewards = [], hidden = new Set() }) {
  if (!challenge || !me) return null
  const real = (s) => !hidden.has(s.creator_id)
  const entries = submissions.filter(real)
  const mine = entries.filter((s) => s.creator_id === me.id)
  const points = challenge.scoring === 'points'

  const creators = new Set(entries.map((s) => s.creator_id))
  const myResult = results.find((r) => r.creator_id === me.id) || null
  // Ranked WITHIN a board when the challenge was split into groups.
  const board = myResult ? results.filter((r) => real(r) && (r.group_id ?? null) === (myResult.group_id ?? null)) : []
  const field = board.length || creators.size
  const rank = myResult?.rank ? Number(myResult.rank) : null
  const pct = topPercent(rank, field)

  const views = mine.reduce((sum, s) => sum + num(s.logged_views), 0)
  const top = mine.slice()
    .sort((a, b) => num(b.logged_views) - num(a.logged_views))
    .slice(0, 3)
    .map((s) => ({
      id: s.id,
      views: num(s.logged_views),
      platform: s.platform,
      url: s.video_url,
      thumbnail: s.thumbnail_url || null,
    }))
  const platforms = [...new Set(mine.map((s) => s.platform).filter(Boolean))]

  const won = rewards
    .filter((r) => num(r.amount) > 0)
    .map((r) => ({
      amount: num(r.amount),
      currency: r.currency || challenge.prize_currency || 'EUR',
      kind: r.reward_type === 'voucher' ? 'voucher' : 'cash',
      slot: r.prize_slot || null,
    }))

  const communityViews = entries.reduce((sum, s) => sum + num(s.logged_views), 0)
  const days = challenge.start_date && challenge.end_date
    ? Math.max(1, Math.round((Date.parse(challenge.end_date) - Date.parse(challenge.start_date)) / 86400000))
    : null

  // What there is to say about the place, if anything.
  let placing = null
  if (rank && rank <= 3) placing = { kind: 'podium', rank, field, pct }
  else if (rank && pct != null && pct <= 50) placing = { kind: 'top', rank, field, pct }

  return {
    challenge: {
      id: challenge.id,
      title: challenge.title,
      start: challenge.start_date,
      end: challenge.end_date,
      days,
      scoring: challenge.scoring,
      pot: num(challenge.prize_amount),
      currency: challenge.prize_currency || 'EUR',
    },
    me: { id: me.id, name: me.name, photo: me.photo_url || null, country: me.country || null },
    entered: mine.length > 0,
    placing,
    rank,
    field,
    points: points && myResult ? num(myResult.final_views) : null,
    totals: {
      videos: mine.length,
      views,
      best: top[0]?.views || 0,
      platforms,
      share: communityViews > 0 ? Math.round((views / communityViews) * 1000) / 10 : null,
    },
    top,
    won,
    wonTotal: won.reduce((sum, w) => sum + w.amount, 0),
    community: {
      creators: creators.size,
      videos: entries.length,
      views: communityViews,
    },
  }
}
