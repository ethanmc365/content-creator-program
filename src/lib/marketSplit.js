// WHO TOOK PART, MARKET BY MARKET (22 Sep 2026).
//
// Ethan: "when I click to see the insights on the challenge so far and at the
// end I want to see the participation split between the markets - a graph and
// numbers, like how many submitted from the UK market and from Spain."
//
// A creator belongs to their HOME market (`community_members.is_home`), which
// is the one placement an admin chose on approval. Somebody with no home row is
// counted under `NO_MARKET` rather than dropped, so the columns always add back
// up to the challenge's own totals.
//
// Pure and tested; the page only fetches and draws.

export const NO_MARKET = '__none__'

/**
 * @param {object} args
 * @param {Array<{creator_id, logged_views, submitted_at}>} args.subs
 * @param {Map<string,string>} args.homeOf      creator id -> market id
 * @param {Array<{id, name, slug, country_codes}>} args.markets
 * @param {Map<string,number>} [args.membersOf] market id -> eligible creators
 * @param {Map<string,number>} [args.pointsOf]  creator id -> points on the board
 * @returns {{ rows: Array, totals: object }}
 */
export function marketSplit({ subs = [], homeOf = new Map(), markets = [], membersOf = new Map(), pointsOf = new Map() }) {
  const buckets = new Map()
  const bucket = (id) => {
    if (!buckets.has(id)) {
      buckets.set(id, { creators: new Set(), entries: 0, views: 0, measured: 0, best: 0 })
    }
    return buckets.get(id)
  }
  for (const s of subs) {
    const b = bucket(homeOf.get(s.creator_id) ?? NO_MARKET)
    b.creators.add(s.creator_id)
    b.entries += 1
    const v = Number(s.logged_views)
    if (s.logged_views != null && Number.isFinite(v)) {
      b.views += v
      b.measured += 1
      if (v > b.best) b.best = v
    }
  }

  const totalEntries = subs.length
  const totalCreators = new Set(subs.map((s) => s.creator_id)).size
  const totalViews = [...buckets.values()].reduce((n, b) => n + b.views, 0)

  const known = markets.map((m) => ({ id: m.id, name: m.name, slug: m.slug, codes: m.country_codes || [] }))
  if (buckets.has(NO_MARKET)) known.push({ id: NO_MARKET, name: 'No home market', slug: null, codes: [] })

  const rows = known.map((m) => {
    const b = buckets.get(m.id)
    const creators = b ? b.creators.size : 0
    const members = membersOf.get(m.id) ?? null
    const points = b ? [...b.creators].reduce((n, c) => n + (Number(pointsOf.get(c)) || 0), 0) : 0
    return {
      ...m,
      creators,
      entries: b?.entries ?? 0,
      views: b?.views ?? 0,
      points,
      best: b?.best ?? 0,
      // A rate needs a denominator; with none it is unknown, never 0%.
      members,
      rate: members ? creators / members : null,
      perCreator: creators ? (b.entries / creators) : 0,
      perEntry: b?.measured ? Math.round(b.views / b.measured) : 0,
      shareEntries: totalEntries ? (b?.entries ?? 0) / totalEntries : 0,
      shareCreators: totalCreators ? creators / totalCreators : 0,
      shareViews: totalViews ? (b?.views ?? 0) / totalViews : 0,
    }
  })
    // Markets that took part first, biggest first; the rest keep their order
    // underneath so a market with nobody in it is still visibly on the list.
    .sort((a, b) => (b.entries - a.entries) || (b.creators - a.creators) || (b.views - a.views))

  return {
    rows,
    totals: {
      creators: totalCreators,
      entries: totalEntries,
      views: totalViews,
      marketsTakingPart: rows.filter((r) => r.entries > 0 && r.id !== NO_MARKET).length,
    },
  }
}

/**
 * Cumulative entries per market, one point per day from `from` to `to`
 * (inclusive, local calendar days). Feeds the stacked area chart.
 */
export function entriesOverTime({ subs = [], homeOf = new Map(), marketIds = [], from, to }) {
  if (!from || !to) return []
  const day = (d) => {
    const x = new Date(d)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  }
  const start = new Date(from); start.setHours(0, 0, 0, 0)
  const end = new Date(to); end.setHours(0, 0, 0, 0)
  if (end < start) return []
  const perDay = new Map()
  for (const s of subs) {
    if (!s.submitted_at) continue
    const k = day(s.submitted_at)
    const m = homeOf.get(s.creator_id) ?? NO_MARKET
    if (!perDay.has(k)) perDay.set(k, new Map())
    const row = perDay.get(k)
    row.set(m, (row.get(m) || 0) + 1)
  }
  const running = new Map(marketIds.map((id) => [id, 0]))
  const out = []
  // Entries dated before the first day (a clock skew, a test row) still count.
  for (const s of subs) {
    if (s.submitted_at && new Date(s.submitted_at) < start) {
      const m = homeOf.get(s.creator_id) ?? NO_MARKET
      if (running.has(m)) running.set(m, running.get(m) + 1)
    }
  }
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = day(d)
    const hit = perDay.get(k)
    if (hit) for (const [m, n] of hit) if (running.has(m)) running.set(m, running.get(m) + n)
    out.push({ day: k, ...Object.fromEntries(running) })
  }
  return out
}
