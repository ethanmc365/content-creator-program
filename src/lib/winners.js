import { supabase } from './supabase'

/**
 * THE WINNERS PODIUM'S DATA, IN ONE PLACE.
 *
 * Both the main challenges board and a market's own challenges tab draw the
 * same `WinnersPodium` for a finished challenge - or they should. The market
 * tab drew a plain row with an entry count instead, because this ninety lines
 * of assembly lived inside the other page's `useEffect` and copying it was
 * nobody's idea of a good afternoon. Ethan: "for the past challenges it should
 * show the same view it does for the normal challenges page, the actual podium
 * graphic."
 *
 * Extracted verbatim, comments and all, so the two boards cannot drift on any
 * of the four decisions embedded in it - which challenges count as published,
 * where the view numbers come from, how many places a challenge pays, and who
 * earns a participation voucher.
 *
 * @param challenges rows from `challenges`, any status
 * @returns { [challengeId]: { winners, totalScore, voucherWinners } }
 */
export async function loadWinnerGalleries(challenges) {
  // The winners block, but only for challenges an admin has actually
  // PUBLISHED. Results rows exist from the moment views are first logged -
  // including the interim standings posted mid-challenge - so keying the
  // podium off "are there results" published a half-finished leaderboard as
  // a final one the day the archive cron ran.
  const publishedIds = challenges.filter((c) => c.winners_published_at).map((c) => c.id)
  if (publishedIds.length === 0) return {}
  // `group_id` on a result row, and the groups themselves, because a challenge
  // run as two leaderboards has TWO sets of winners and a single podium built
  // off a flat list would show two firsts and a second (ranks are stored per
  // board - migration 154). Almost every challenge returns no groups at all,
  // and then everything below behaves exactly as it did.
  const [{ data: results }, { data: subs }, { data: groups }, { data: members }] = await Promise.all([
    supabase.from('results')
      .select('challenge_id, creator_id, final_views, rank, group_id, profiles:creator_id(id, name, photo_url)')
      .in('challenge_id', publishedIds)
      .order('final_views', { ascending: false }),
    supabase.from('submissions')
      .select('challenge_id, creator_id, video_url, platform, logged_views, profiles:creator_id(id, name, photo_url)')
      .in('challenge_id', publishedIds),
    supabase.from('challenge_groups')
      .select('id, challenge_id, name, position, winners_count')
      .in('challenge_id', publishedIds).order('position'),
    // Membership, so a board's ENTRY count is its own rather than the whole
    // challenge's. Deriving it from the result rows instead would silently drop
    // anybody who entered and never had a view logged, and then the two boards'
    // counts would not add up to the challenge's.
    supabase.from('challenge_group_members')
      .select('challenge_id, group_id, creator_id')
      .in('challenge_id', publishedIds),
  ])

  const bestVideo = new Map()   // `${challenge}:${creator}` -> best submission
  const subCount = new Map()    // `${challenge}:${creator}` -> how many they posted
  const person = new Map()      // creator id -> profile, for the voucher faces
  // VIEWS COME FROM THE SUBMISSIONS, NOT FROM `results.final_views`.
  //
  // THE BUG: the archive said Lisa had 15.2k views and the challenge had
  // 43.4k in total, while the leaderboard on the very next page said 16.8k
  // and 76.6k. Two numbers for the same thing, and Ethan reported it as
  // "the challenge archive is showing the incorrect view counts again".
  //
  // `results.final_views` is a SNAPSHOT, written when an admin saves the
  // results (see AdminResults). Views are read automatically off each
  // entry's link forever after that, so `submissions.logged_views` keeps
  // climbing and the snapshot does not: on this challenge one creator had
  // drifted by nearly twenty thousand views. Every other surface in the
  // product reads the live number, so the archive was the odd one out.
  //
  // The RANK is left exactly as published. This challenge is `best_video`,
  // so its order is a human decision that was made, announced and paid out;
  // views are the reach, not the verdict, and re-ranking a settled result
  // because a video kept being watched would be wrong.
  const liveViews = new Map() // `${challenge}:${creator}` -> summed live views
  const totalViews = new Map() // challenge -> summed live views
  for (const s of subs ?? []) {
    const k = `${s.challenge_id}:${s.creator_id}`
    const cur = bestVideo.get(k)
    if (!cur || (s.logged_views ?? 0) > (cur.logged_views ?? 0)) bestVideo.set(k, s)
    subCount.set(k, (subCount.get(k) || 0) + 1)
    liveViews.set(k, (liveViews.get(k) || 0) + (Number(s.logged_views) || 0))
    totalViews.set(s.challenge_id, (totalViews.get(s.challenge_id) || 0) + (Number(s.logged_views) || 0))
    if (s.profiles) person.set(s.creator_id, s.profiles)
  }

  const byChallenge = {}
  for (const r of results ?? []) (byChallenge[r.challenge_id] ||= []).push(r)
  const groupsFor = {}
  for (const g of groups ?? []) (groupsFor[g.challenge_id] ||= []).push(g)
  // `${challenge}:${creator}` -> group id
  const groupOf = new Map()
  for (const m of members ?? []) groupOf.set(`${m.challenge_id}:${m.creator_id}`, m.group_id)
  const entriesPerBoard = new Map() // `${challenge}:${group||''}` -> count
  for (const sub of subs ?? []) {
    const g = groupOf.get(`${sub.challenge_id}:${sub.creator_id}`) ?? ''
    const k = `${sub.challenge_id}:${g}`
    entriesPerBoard.set(k, (entriesPerBoard.get(k) || 0) + 1)
  }
  const built = {}
  for (const c of challenges) {
    const rows = byChallenge[c.id]
    if (!c.winners_published_at || !rows?.length) continue
    // How many places this challenge actually pays. Three was hard-coded,
    // so a five-winner challenge quietly lost two of its winners.
    const places = Math.max(1, c.winners_count || (Array.isArray(c.prize_structure) ? c.prize_structure.length : 0) || 3)
    const topOf = (list, seats) => list
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.final_views - a.final_views)
      .slice(0, seats)
      .map((r, i) => ({
        ...r,
        rank: i + 1,
        // The live figure, falling back to the snapshot only if this
        // creator somehow has no submission rows left to read.
        final_views: liveViews.get(`${c.id}:${r.creator_id}`) ?? r.final_views ?? 0,
        videoUrl: bestVideo.get(`${c.id}:${r.creator_id}`)?.video_url ?? null,
        platform: bestVideo.get(`${c.id}:${r.creator_id}`)?.platform ?? null,
      }))
    const ranked = topOf([...rows], places)
    // EVERYONE who cleared the participation threshold, podium included.
    // They were excluded before, on the reasoning that the voucher is for
    // turning up rather than for placing - but the row says "for everyone
    // here" and then quietly left out the three people most obviously here,
    // so it read as broken. Placing does not un-earn the voucher.
    const threshold = c.participation_threshold
    const voucherWinners = threshold
      ? [...subCount.entries()]
          .filter(([k, n]) => k.startsWith(`${c.id}:`) && n >= threshold)
          .map(([k]) => person.get(k.split(':')[1]))
          .filter(Boolean)
      : []
    // ONE PODIUM PER BOARD. `boards` is what the pages draw; `winners` is kept
    // for the single-board case and is the same list they would get from it.
    const myGroups = groupsFor[c.id] ?? []
    const boards = myGroups.length > 0
      ? [...myGroups, { id: null, name: 'Not in a group' }]
        .map((g) => {
          const mine = rows.filter((r) => (r.group_id ?? null) === g.id)
          return {
            id: g.id,
            name: g.name,
            winners: topOf(mine, Math.max(1, g.winners_count || places)),
            entries: entriesPerBoard.get(`${c.id}:${g.id ?? ''}`) ?? 0,
            totalScore: mine.reduce((sum, r) => sum + (liveViews.get(`${c.id}:${r.creator_id}`) ?? r.final_views ?? 0), 0),
          }
        })
        .filter((b) => b.winners.length > 0)
      : []

    built[c.id] = {
      winners: ranked,
      boards,
      // The whole challenge's reach, over EVERY entry rather than only the
      // ranked ones - `results` holds one row per ranked creator, so
      // summing it counted eleven people out of thirty-nine entries.
      totalScore: totalViews.get(c.id) ?? rows.reduce((sum, r) => sum + (r.final_views || 0), 0),
      voucherWinners,
    }
  }
  return built
}
