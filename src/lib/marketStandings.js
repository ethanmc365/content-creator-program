import { convert, FALLBACK_RATES } from './programme'

// MARKET AGAINST MARKET.
//
// Ethan, 16 Sep 2026: "Market-vs-market standings, total views by market, per
// month and all time. I think it's good for the community managers to have a
// bit of competition too... this is based on views, but should also show
// numbers of creators, prize money paid etc, like a comparison as well as
// competition."
//
// WHICH MARKET A VIEW BELONGS TO, AND WHY IT IS NOT THE CREATOR'S.
//
// `lib/analyticsScope` answers this question the other way round, on purpose: a
// UK creator who enters a worldwide challenge did that work as a UK creator, so
// their views scope to the UK. That is the right rule for "how is this market's
// roster doing", which is what a market filter is for.
//
// It is the WRONG rule here, for two reasons. The first is that this is a
// league table between the people who RUN the markets, and what a community
// manager actually controls is the challenges they run - crediting them for a
// creator's unrelated entry elsewhere measures the wrong person. The second is
// that it is not available: forty-eight of the fifty challenges in the record
// predate the platform and exist only as aggregates in `challenge_history`,
// with a market and a total and no per-creator rows at all. A rule the history
// cannot express would make the table start in July, against a programme that
// started in January.
//
// So: A CHALLENGE BELONGS TO THE MARKET THAT RAN IT, and its views, posts,
// entries and prize money go with it. That is one rule, it holds over the whole
// record, and it is the rule the Challenges tab already uses.
//
// WHICH MONTH. EVERY month the challenge RAN IN, whole (24 Sep 2026). Ethan:
// "some challenges are run throughout two months, and they both show up, like
// a challenge from the 15th of July to the 15th of August." It used to belong
// to its start month only, so August read "no market ran a challenge" while one
// was running. Splitting its views across the weeks would be inventing a
// distribution nobody measured, so it counts whole in each month it touched;
// all time still counts it once.

/** 'YYYY-MM' for a date, or null. */
export function monthKey(d) {
  if (!d) return null
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return null
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Every 'YYYY-MM' from the month of `from` to the month of `to`, inclusive. */
export function monthsBetween(from, to) {
  const a = monthKey(from)
  if (!a) return []
  const b = monthKey(to) || a
  const out = []
  let [y, m] = a.split('-').map(Number)
  const [yb, mb] = (b < a ? a : b).split('-').map(Number)
  while ((y < yb || (y === yb && m <= mb)) && out.length < 36) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** "August 2026" from '2026-08'. */
export function monthLabel(key) {
  if (!key) return ''
  const [y, m] = key.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

/** Every contest in the record, live or historical, as one shape. */
function contests(raw) {
  const out = []
  for (const h of raw?.history || []) {
    // "NOT MEASURED" IS NOT "MEASURED AS ZERO". Fourteen historical challenges
    // were never measured, and reading `Number(total_views) || 0` puts their
    // prize money in a CPM's numerator and nothing in its denominator - which
    // is a quarter of the headline figure. `known` is what keeps every
    // per-view ratio over one set of challenges.
    const views = h.total_views == null ? null : Number(h.total_views)
    out.push({
      marketId: h.community_id || null,
      month: monthKey(h.starts_at),
      months: monthsBetween(h.starts_at, h.ends_at),
      title: h.title,
      views,
      posts: Number(h.posts || 0),
      entries: Number(h.creators || 0),
      spend: Number(h.prize_total || 0),
      currency: h.prize_currency || 'EUR',
      live: false,
    })
  }

  // Platform challenges. A draft has not happened, so it is not in the record.
  const subsByChallenge = new Map()
  for (const s of raw?.submissions || []) {
    if (!s.challenge_id) continue
    const at = subsByChallenge.get(s.challenge_id) || { posts: 0, views: 0, creators: new Set() }
    at.posts += 1
    at.views += Number(s.logged_views || 0)
    if (s.creator_id) at.creators.add(s.creator_id)
    subsByChallenge.set(s.challenge_id, at)
  }
  // A published RESULT is the verified count and beats the creator's own
  // figure, which is what the Challenges tab does too.
  const resultViews = new Map()
  for (const r of raw?.results || []) {
    if (!r.challenge_id) continue
    resultViews.set(r.challenge_id, (resultViews.get(r.challenge_id) || 0) + Number(r.final_views || 0))
  }

  // A WORLDWIDE CHALLENGE IS EVERY MARKET'S (24 Sep 2026). The Global
  // Challenge runs on the worldwide network, which is not a market, so it was
  // in nobody's row and September read "no market ran a challenge" while all
  // six were running one. Its entries are counted for each ENTRANT'S market -
  // their first market membership - and its prize money is split by the share
  // of entrants each market brought, which is the one split that needs no
  // measurement nobody took.
  const chapterIds = new Set((raw?.marketRows || []).filter((m) => m.kind === 'chapter').map((m) => m.id))
  const homeOf = new Map()
  for (const r of raw?.memberRows || []) {
    if (chapterIds.has(r.community_id) && !homeOf.has(r.profile_id)) homeOf.set(r.profile_id, r.community_id)
  }

  for (const c of raw?.challenges || []) {
    if (c.status === 'draft') continue
    const months = monthsBetween(c.start_date, c.end_date)
    if (c.community_id && !chapterIds.has(c.community_id) && chapterIds.size) {
      const parts = new Map()
      let entrants = 0
      for (const sub of raw?.submissions || []) {
        if (sub.challenge_id !== c.id) continue
        const home = homeOf.get(sub.creator_id)
        if (!home) continue
        const at = parts.get(home) || { posts: 0, views: 0, creators: new Set() }
        at.posts += 1
        at.views += Number(sub.logged_views || 0)
        at.creators.add(sub.creator_id)
        parts.set(home, at)
      }
      for (const p of parts.values()) entrants += p.creators.size
      for (const [home, p] of parts) {
        out.push({
          marketId: home,
          month: monthKey(c.start_date),
          months,
          title: c.title,
          views: p.views,
          posts: p.posts,
          entries: p.creators.size,
          spend: entrants ? Number(c.prize_amount || 0) * (p.creators.size / entrants) : 0,
          currency: c.prize_currency || 'EUR',
          live: true,
          shared: true,
        })
      }
      continue
    }
    const s = subsByChallenge.get(c.id) || { posts: 0, views: 0, creators: new Set() }
    // A points board stores the SCORE in `final_views`, so only a views
    // board's results are a view count.
    const verified = c.scoring === 'points' ? null : resultViews.get(c.id)
    out.push({
      marketId: c.community_id || null,
      month: monthKey(c.start_date),
      months,
      title: c.title,
      views: verified != null && verified > 0 ? verified : s.views,
      posts: s.posts,
      entries: s.creators.size,
      spend: Number(c.prize_amount || 0),
      currency: c.prize_currency || 'EUR',
      live: true,
    })
  }
  return out
}

/**
 * Every month from the programme's first through THIS one, newest first
 * (24 Sep 2026). It was only the months a challenge STARTED in, so a month a
 * challenge merely ran into was missing, and a new month did not appear until
 * something started in it. Ethan: "ensure the new months always show up".
 */
export function monthsInRecord(raw, now = new Date()) {
  let first = null
  let last = null
  for (const c of contests(raw)) {
    for (const m of c.months?.length ? c.months : [c.month]) {
      if (!m) continue
      if (!first || m < first) first = m
      if (!last || m > last) last = m
    }
  }
  if (!first) return []
  const current = monthKey(now)
  const end = current && current > last ? current : last
  return monthsBetween(`${first}-01`, `${end}-01`).reverse()
}

/**
 * The table.
 *
 * @param {object} raw   the analytics payload (challenges, history, submissions,
 *                       results, rewards, marketRows, memberRows)
 * @param {object} opts  { currency, rates, month }  month '' = all time
 * @returns {Array} one row per market, ranked by views, highest first
 */
export function marketStandings(raw, { currency = 'EUR', rates = FALLBACK_RATES, month = '' } = {}) {
  if (!raw) return []
  const money = (n, from) => convert(Number(n) || 0, from || 'EUR', currency, rates) || 0

  // THE MARKETS THEMSELVES, INCLUDING THE ONES WITH NOTHING YET. A league table
  // that silently omits a market because it has not run a challenge is one a
  // manager cannot use to ask why - and Nordics is exactly that market today.
  const markets = (raw.marketRows || []).filter((m) => m.kind === 'chapter' && !m.retired_at)

  const members = new Map()
  for (const m of markets) members.set(m.id, 0)
  const counted = new Set()
  const realPeople = new Set(
    (raw.profiles || []).filter((p) => !p.is_test && p.status === 'active').map((p) => p.id),
  )
  for (const r of raw.memberRows || []) {
    if (!members.has(r.community_id)) continue
    if (!realPeople.has(r.profile_id)) continue
    const key = `${r.community_id}|${r.profile_id}`
    if (counted.has(key)) continue
    counted.add(key)
    members.set(r.community_id, members.get(r.community_id) + 1)
  }

  const rows = new Map()
  for (const m of markets) {
    rows.set(m.id, {
      id: m.id,
      slug: m.slug,
      name: m.name,
      countries: m.country_codes || [],
      members: members.get(m.id) || 0,
      views: 0,
      viewsKnown: 0,       // views over the contests we actually measured
      measured: 0,         // how many of those there were
      challenges: 0,
      posts: 0,
      entries: 0,
      spend: 0,            // prize money committed, in `currency`
      spendKnown: 0,       // ... over measured contests only, for the CPM
      paid: 0,             // rewards actually paid out through the platform
      byMonth: {},
    })
  }

  for (const c of contests(raw)) {
    const row = rows.get(c.marketId)
    if (!row) continue                      // worldwide, or a retired market
    const inMonths = c.months?.length ? c.months : [c.month]
    if (month && !inMonths.includes(month)) continue
    const spend = money(c.spend, c.currency)
    row.challenges += 1
    row.posts += c.posts
    row.entries += c.entries
    row.spend += spend
    if (c.views != null) {
      row.views += c.views
      row.viewsKnown += c.views
      row.spendKnown += spend
      row.measured += 1
    }
    for (const m of inMonths) {
      if (!m || (month && m !== month)) continue
      const bucket = (row.byMonth[m] ||= { views: 0, spend: 0, challenges: 0 })
      bucket.views += c.views || 0
      bucket.spend += spend
      bucket.challenges += 1
    }
  }

  // What actually left the bank through the platform. Kept apart from `spend`
  // (which is what the challenges were WORTH) because they are different
  // questions and the historical record only answers the first.
  const marketOf = new Map((raw.challenges || []).map((c) => [c.id, c.community_id]))
  for (const r of raw.rewards || []) {
    const id = r.community_id || marketOf.get(r.challenge_id)
    const row = rows.get(id)
    if (!row) continue
    if (month && monthKey(r.distributed_at || r.created_at) !== month) continue
    row.paid += money(r.amount, r.currency)
  }

  const out = [...rows.values()].map((r) => ({
    ...r,
    // COST PER THOUSAND VIEWS, OVER MEASURED CONTESTS ONLY. Putting an
    // unmeasured challenge's prize money over a view count it contributed
    // nothing to is how the programme CPM came out a quarter too high once
    // already. Null when there is nothing to divide.
    cpm: r.viewsKnown > 0 ? (r.spendKnown / r.viewsKnown) * 1000 : null,
    viewsPerCreator: r.entries > 0 ? Math.round(r.views / r.entries) : null,
    viewsPerPost: r.posts > 0 ? Math.round(r.views / r.posts) : null,
  }))

  return out.sort((a, b) => b.views - a.views || a.name.localeCompare(b.name))
}

/**
 * Where each market placed LAST month, so this month's table can show movement.
 * Returns a Map of market id -> rank (1-based) or null when it did not place.
 */
export function previousRanks(raw, month, opts = {}) {
  if (!month) return new Map()
  const all = monthsInRecord(raw)
  const i = all.indexOf(month)
  const before = i >= 0 ? all[i + 1] : null
  if (!before) return new Map()
  const rows = marketStandings(raw, { ...opts, month: before }).filter((r) => r.challenges > 0)
  return new Map(rows.map((r, n) => [r.id, n + 1]))
}
