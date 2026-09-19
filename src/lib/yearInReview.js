import { decorate, totals as flightTotals, records as flightRecords, airlineLoyalty, aircraftSeen } from './flightStats'
import { convert, FALLBACK_RATES } from './programme'

// THE YEAR IN REVIEW.
//
// Ethan, 16 Sep 2026: "a personal, shareable recap in December. Like Spotify
// Wrapped... The recap should be related to the community, travel and their
// contributions."
//
// WHAT MAKES ONE OF THESE WORK, and it is not the data.
//
// Spotify does not say "you listened to 47,283 minutes". It says "you spent 788
// hours finding yourself". The number is the same; the second one is about the
// person. So every figure this file produces comes with the material to say it
// that way - a distance comes with how many times round the coast of Ireland
// that is, a view count comes with how many people that would fill a stadium
// with, a rank comes as "top 4%" rather than "9th of 214". The phrasing lives
// in the component; what lives HERE is making sure the component has something
// human to say, which means computing the comparisons as well as the counts.
//
// AND THE HONEST-ZERO RULE. A recap that says "0 flights, 0 videos, 0 messages"
// to somebody who joined in August is not a celebration, it is a report card.
// Every section carries `has`, and the component drops the cards that have
// nothing behind them rather than drawing an empty one. What is left is always
// true and never sad.

/** Kilometres round the Earth at the equator - the distance comparison. */
const EARTH_KM = 40_075
/** London to Sydney, the long-haul everybody has heard of. */
const LHR_SYD_KM = 17_016

const startOfYear = (year) => `${year}-01-01`
const endOfYear = (year) => `${year}-12-31`
const inYear = (d, year) => !!d && String(d).slice(0, 4) === String(year)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Where somebody sits against everyone else on one measure.
 *
 * TOP N PER CENT, NOT NTH OF M. "9th of 214" is a fact about a list; "top 5%"
 * is a fact about you, and it is the one people screenshot. Ties share the
 * better position, and somebody with nothing at all is not ranked - being told
 * you are in the bottom 40% of a community you joined last week is the one
 * thing a recap must never do.
 */
export function standing(values, mine, { includeMine = false } = {}) {
  const scored = values.filter((v) => v > 0).sort((a, b) => b - a)
  if (!mine || mine <= 0) return null
  // THE FIELD HAS TO CONTAIN THE PERSON BEING RANKED IN IT.
  //
  // The tallies are built over ACTIVE, NON-TEST creators, and the recap can be
  // opened for somebody outside that set - a pending account, or an admin
  // looking at a test profile in the lab. Their own figure was then missing
  // from the field while still being ranked against it, which gave "1st of 2"
  // on a community of three. `includeMine` puts them back rather than pretending
  // the question cannot be asked.
  const field = includeMine && !scored.includes(mine) ? [...scored, mine].sort((a, b) => b - a) : scored
  if (!field.length) return null
  const rank = field.filter((v) => v > mine).length + 1
  const pct = Math.max(1, Math.round((rank / field.length) * 100))
  // `top` IS "WORTH SAYING OUT LOUD", NOT "BETTER THAN AVERAGE".
  //
  // It was `pct <= 50`, which put "Top 45% for views" on the share card - a
  // sentence nobody has ever wanted to post, and the one card in the recap that
  // exists to be posted. Roughly the top third is the line where a standing
  // stops being a participation notice and starts being a boast.
  return { rank, of: field.length, percentile: pct, top: pct <= 30 }
}

function monthOf(d) {
  if (!d) return null
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? null : t.getUTCMonth()
}

/**
 * Build one creator's recap.
 *
 * Everything is passed in rather than fetched, so this is a pure function and
 * the testing centre can run it over any creator without a second data layer.
 */
export function buildYearInReview({
  year,
  meId,
  today = `${year}-12-31`,
  profiles = [],
  communities = [],
  memberRows = [],
  flights = [],
  submissions = [],
  results = [],
  rewards = [],
  challenges = [],
  history = [],
  messages = [],
  connections = [],
  collabPosts = [],
  gameScores = [],
  reactions = [],
  milestones = [],
  creatorMilestones = [],
  currency = 'EUR',
  rates = FALLBACK_RATES,
} = {}) {
  const me = profiles.find((p) => p.id === meId) || null
  const from = startOfYear(year)
  const to = endOfYear(year)
  const money = (n, ccy) => convert(Number(n) || 0, ccy || 'EUR', currency, rates) || 0

  // Everyone the community counts: active, real people. The comparisons are
  // against this set, so a test account cannot push somebody down a percentile.
  const peers = profiles.filter((p) => p.status === 'active' && !p.is_test)
  const peerIds = new Set(peers.map((p) => p.id))

  const myMarkets = memberRows
    .filter((r) => r.profile_id === meId)
    .map((r) => communities.find((c) => c.id === r.community_id))
    .filter((c) => c && c.kind === 'chapter')
  const homeMarket = memberRows.find((r) => r.profile_id === meId && r.is_home)
  const home = communities.find((c) => c.id === homeMarket?.community_id) || myMarkets[0] || null

  // ------------------------------------------------------------------ travel
  const myFlights = decorate(flights.filter((f) => f.creator_id === meId))
    .filter((f) => f.flown_on >= from && f.flown_on <= to && f.flown_on <= today)
  const ft = flightTotals(myFlights)
  const rec = flightRecords(myFlights)
  const airlines = airlineLoyalty(myFlights)
  const fleet = aircraftSeen(myFlights)
  const myCollab = collabPosts.filter((c) => c.creator_id === meId && inYear(c.start_date || c.created_at, year))

  const travel = {
    has: myFlights.length > 0 || myCollab.length > 0,
    flights: myFlights.length,
    distance: Math.round(ft.distance),
    hours: Math.round(ft.minutes / 60),
    countries: ft.countries,
    countryList: [...ft.countrySet].sort(),
    airports: ft.airports,
    airlines: ft.airlines,
    aircraftTypes: ft.aircraft,
    fleet: (fleet || []).slice(0, 6),
    longest: rec?.longest || null,
    topAirline: airlines?.[0] || null,
    zonesCrossed: ft.zonesCrossed,
    // THE COMPARISONS. A distance is not a feeling until it is a journey you
    // can picture.
    timesRoundEarth: ft.distance / EARTH_KM,
    londonSydneys: ft.distance / LHR_SYD_KM,
    collabTrips: myCollab.length,
    collabCities: [...new Set(myCollab.map((c) => c.city).filter(Boolean))],
  }

  // ----------------------------------------------------------------- content
  const mySubs = submissions.filter((s) => s.creator_id === meId && inYear(s.submitted_at, year))
  const myChallengeIds = new Set(mySubs.map((s) => s.challenge_id).filter(Boolean))

  // A RESULT ROW HAS NO YEAR OF ITS OWN, AND PRETENDING IT DOES LEAKED VIEWS
  // ACROSS YEARS.
  //
  // THE BUG: `results` was filtered by creator and nothing else, and then every
  // verified total in it was added to this year's count - so a creator with a
  // podium finish in 2025 had those views, that win and that podium counted
  // again in their 2026 recap, on top of whatever they actually did. On a
  // programme whose whole point is the view count, that is the headline number
  // of the whole thing being wrong.
  //
  // A result belongs to a CHALLENGE, so it belongs to the year the creator
  // entered that challenge. `myChallengeIds` is exactly that set and it is
  // already built from submissions that are in the year, so scoping to it needs
  // no extra data and cannot drift from the submissions it sits beside.
  const myResults = results.filter((r) => r.creator_id === meId && myChallengeIds.has(r.challenge_id))
  // THE VERIFIED COUNT REPLACES THE CREATOR'S OWN FIGURE, it does not add to it.
  // Counted per challenge rather than per submission, because one verified
  // total covers every video somebody entered into that contest.
  //
  // ONE DEFINITION, USED TWICE. The community total on the last card is the sum
  // of this over everybody - it used to be a plain sum of `logged_views`, so the
  // personal card and the community card were counting different things and a
  // creator's share of the total was quietly wrong wherever a result had been
  // published.
  // INDEXED ONCE, NOT SCANNED PER CREATOR. This is called for the viewer and
  // then for every peer to build the community total and the ranking, so a
  // filter over the whole submissions table inside it is O(creators x
  // submissions) - fine at a hundred creators and forty videos, and a wall at a
  // thousand and ten thousand.
  const subsByCreator = new Map()
  for (const x of submissions) {
    if (!inYear(x.submitted_at, year)) continue
    const list = subsByCreator.get(x.creator_id)
    if (list) list.push(x); else subsByCreator.set(x.creator_id, [x])
  }
  const resultsByCreator = new Map()
  for (const r of results) {
    const list = resultsByCreator.get(r.creator_id)
    if (list) list.push(r); else resultsByCreator.set(r.creator_id, [r])
  }

  const viewsInYearFor = (id) => {
    const subs = subsByCreator.get(id) || []
    if (!subs.length) return 0
    const entered = new Set(subs.map((x) => x.challenge_id).filter(Boolean))
    const seen = new Map()
    for (const r of resultsByCreator.get(id) || []) {
      if (!entered.has(r.challenge_id)) continue
      const v = Number(r.final_views || 0)
      if (v > 0) seen.set(r.challenge_id, v)
    }
    let n = 0
    for (const x of subs) {
      if (!x.challenge_id) { n += Number(x.logged_views || 0); continue }
      if (seen.has(x.challenge_id)) continue          // counted once, below
      n += Number(x.logged_views || 0)
    }
    for (const [, v] of seen) n += v
    return n
  }
  const views = viewsInYearFor(meId)

  const best = mySubs.slice().sort((a, b) => Number(b.logged_views || 0) - Number(a.logged_views || 0))[0] || null
  const wins = myResults.filter((r) => r.rank === 1).length
  const podiums = myResults.filter((r) => r.rank != null && r.rank <= 3).length

  const myRewards = rewards.filter((r) => r.creator_id === meId && inYear(r.created_at, year))
  const cash = myRewards.filter((r) => r.reward_type !== 'voucher').reduce((n, r) => n + money(r.amount, r.currency), 0)
  const vouchers = myRewards.filter((r) => r.reward_type === 'voucher').reduce((n, r) => n + money(r.amount, r.currency), 0)

  const content = {
    has: mySubs.length > 0,
    videos: mySubs.length,
    views,
    best: best ? {
      views: Number(best.logged_views || 0),
      platform: best.platform,
      url: best.video_url,
      thumbnail: best.thumbnail_url || null,
      challenge: challenges.find((c) => c.id === best.challenge_id)?.title || null,
    } : null,
    challenges: myChallengeIds.size,
    wins,
    podiums,
    cash,
    vouchers,
    currency,
    platforms: [...new Set(mySubs.map((s) => s.platform).filter(Boolean))],
  }

  // --------------------------------------------------------------- community
  const myMessages = messages.filter((m) => m.sender_id === meId && inYear(m.created_at, year) && !m.deleted)
  const myConnections = connections.filter(
    (c) => c.status === 'accepted' && (c.creator_id === meId || c.connected_creator_id === meId) && inYear(c.created_at, year),
  )
  const myReactions = reactions.filter((r) => r.creator_id === meId && inYear(r.created_at, year))
  const myMilestones = creatorMilestones
    .filter((m) => m.profile_id === meId && inYear(m.reached_at, year))
    .map((m) => milestones.find((x) => x.id === m.milestone_id))
    .filter(Boolean)

  const roomTally = {}
  for (const m of myMessages) if (m.channel) roomTally[m.channel] = (roomTally[m.channel] || 0) + 1
  const topRoom = Object.entries(roomTally).sort((a, b) => b[1] - a[1])[0] || null

  const community = {
    has: myMessages.length > 0 || myConnections.length > 0 || myMilestones.length > 0,
    messages: myMessages.length,
    connections: myConnections.length,
    reactions: myReactions.length,
    milestones: myMilestones.map((m) => ({ title: m.title, icon: m.icon })),
    topRoom: topRoom ? { key: topRoom[0], count: topRoom[1] } : null,
    markets: myMarkets.map((m) => m.name),
  }

  // ------------------------------------------------------------------- games
  const myGames = gameScores.filter((g) => g.player_id === meId && inYear(g.created_at, year))
  const modeTally = {}
  for (const g of myGames) modeTally[g.mode] = (modeTally[g.mode] || 0) + 1
  const favouriteMode = Object.entries(modeTally).sort((a, b) => b[1] - a[1])[0] || null
  const dayKeys = [...new Set(myGames.map((g) => g.day_key).filter((d) => d != null))].sort((a, b) => a - b)
  let bestRun = 0, run = 0, prev = null
  for (const d of dayKeys) {
    run = prev != null && d === prev + 1 ? run + 1 : 1
    if (run > bestRun) bestRun = run
    prev = d
  }

  const games = {
    has: myGames.length > 0,
    played: myGames.length,
    days: dayKeys.length,
    bestStreak: bestRun,
    favourite: favouriteMode ? { mode: favouriteMode[0], plays: favouriteMode[1] } : null,
    modes: Object.entries(modeTally).sort((a, b) => b[1] - a[1]).map(([mode, n]) => ({ mode, n })),
  }

  // ------------------------------------------------------------ where I rank
  const tally = (rows, key, pick) => {
    const by = new Map()
    for (const r of rows) {
      const id = r[key]
      if (!peerIds.has(id)) continue
      by.set(id, (by.get(id) || 0) + pick(r))
    }
    return by
  }
  const viewsBy = new Map()
  for (const id of peerIds) {
    const n = viewsInYearFor(id)
    if (n > 0) viewsBy.set(id, n)
  }
  const videosBy = tally(submissions.filter((s) => inYear(s.submitted_at, year)), 'creator_id', () => 1)
  const gamesBy = tally(gameScores.filter((g) => inYear(g.created_at, year)), 'player_id', () => 1)
  const msgsBy = tally(messages.filter((m) => inYear(m.created_at, year) && !m.deleted), 'sender_id', () => 1)
  const kmBy = new Map()
  for (const f of decorate(flights.filter((f) => inYear(f.flown_on, year) && f.flown_on <= today))) {
    if (!peerIds.has(f.creator_id)) continue
    kmBy.set(f.creator_id, (kmBy.get(f.creator_id) || 0) + f.dist)
  }

  // `includeMine` matters when the recap is opened for somebody outside the
  // peer set - see `standing`.
  const mine = { includeMine: !peerIds.has(meId) }
  const ranks = {
    views: standing([...viewsBy.values()], views, mine),
    videos: standing([...videosBy.values()], mySubs.length, mine),
    games: standing([...gamesBy.values()], myGames.length, mine),
    messages: standing([...msgsBy.values()], myMessages.length, mine),
    distance: standing([...kmBy.values()], ft.distance, mine),
  }

  // -------------------------------------------------------- my busiest month
  const monthly = Array.from({ length: 12 }, () => 0)
  for (const s of mySubs) { const m = monthOf(s.submitted_at); if (m != null) monthly[m] += 3 }
  for (const m of myMessages) { const i = monthOf(m.created_at); if (i != null) monthly[i] += 1 }
  for (const g of myGames) { const i = monthOf(g.created_at); if (i != null) monthly[i] += 1 }
  for (const f of myFlights) { const i = monthOf(f.flown_on); if (i != null) monthly[i] += 4 }
  const busiestIndex = monthly.reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0)
  const busiest = monthly[busiestIndex] > 0
    ? { index: busiestIndex, name: MONTHS[busiestIndex], score: monthly[busiestIndex] }
    : null

  // -------------------------------------------------------------- everyone's
  const yearSubs = submissions.filter((s) => inYear(s.submitted_at, year) && peerIds.has(s.creator_id))
  const yearFlights = decorate(flights.filter((f) => inYear(f.flown_on, year) && peerIds.has(f.creator_id) && f.flown_on <= today))
  const everyoneCountries = new Set()
  for (const f of yearFlights) for (const a of [f.from, f.to]) if (a.country) everyoneCountries.add(a.country)

  // THE PROGRAMME'S YEAR IS BOTH HALVES, AND THIS CARD ONLY HAD ONE.
  //
  // Ethan: "the views together, which is showing every creator across every
  // market... I'm not sure why it's only showing 43 because obviously from
  // analytics, you should see that there's a lot of views. So please properly
  // do that. Not just taking the data from the challenge on the platform, but
  // from all the challenge for the year."
  //
  // MEASURED, 20 Sep 2026: the platform's own submissions for 2026 carry 43,412
  // views (which is what "43K" on the card was). `challenge_history` rows with
  // a null `challenge_id` - the challenges the programme ran BEFORE this app
  // existed, which is most of them - carry 19,654,970 across 47 contests. The
  // card was showing 0.2% of the year and calling it "together".
  //
  // AdminAnalytics has always summed both halves (see the note there on
  // `history`), which is exactly why the two screens disagreed so wildly.
  //
  // CREATORS IS DELIBERATELY *NOT* ADDED TO. `history.creators` is a per-contest
  // headcount - 348 across 47 rows - and the same person entering nine
  // challenges is nine of those. Adding it to `peers.length` would claim a
  // community several times its real size. Views and posts are genuine totals
  // and do sum.
  const histInYear = (history || []).filter((h) => !h.challenge_id && inYear(h.starts_at, year))
  const histViews = histInYear.reduce((n, h) => n + Number(h.total_views || 0), 0)
  const histPosts = histInYear.reduce((n, h) => n + Number(h.posts || 0), 0)

  const everyone = {
    creators: peers.length,
    views: [...peerIds].reduce((n, id) => n + viewsInYearFor(id), 0) + histViews,
    videos: yearSubs.length + histPosts,
    flights: yearFlights.length,
    distance: Math.round(yearFlights.reduce((n, f) => n + f.dist, 0)),
    countries: everyoneCountries.size,
    messages: messages.filter((m) => inYear(m.created_at, year) && !m.deleted && peerIds.has(m.sender_id)).length,
    games: gameScores.filter((g) => inYear(g.created_at, year) && peerIds.has(g.player_id)).length,
    connections: connections.filter((c) => c.status === 'accepted' && inYear(c.created_at, year)).length,
    markets: communities.filter((c) => c.kind === 'chapter' && !c.retired_at).length,
    prize: rewards.filter((r) => inYear(r.created_at, year)).reduce((n, r) => n + money(r.amount, r.currency), 0),
    currency,
  }

  return {
    year,
    generatedFor: today,
    me: me ? {
      id: me.id,
      name: me.name,
      photo: me.photo_url,
      city: me.city,
      country: me.country,
      joined: me.accepted_at || me.created_at,
      joinedThisYear: inYear(me.accepted_at || me.created_at, year),
      market: home?.name || null,
    } : null,
    travel, content, community, games, ranks, busiest, everyone,
  }
}
