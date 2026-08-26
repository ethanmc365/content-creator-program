import { convert, FALLBACK_RATES } from './programme'

// READING THE PROGRAMME ONE MARKET AT A TIME.
//
// Every number on the analytics page was worldwide, which is the right default
// and the wrong only option: a country manager asking "how is Spain doing"
// could read a total that Spain is four per cent of and learn nothing. Scoping
// is a filter over the SAME datasets rather than a second set of queries -
// there is one definition of "a view" on this page and it should not fork.
//
// WHAT A MARKET'S NUMBERS MEAN, which is a decision and not an obvious one:
//
//   PEOPLE      the market's members.
//   WORK        everything those people did, wherever they did it. A UK creator
//               who enters a worldwide challenge did that work as a UK creator,
//               and Spain does not get the credit for it.
//   MONEY       every reward those people were paid, on the same reasoning.
//   CHALLENGES  the challenges the market RAN (challenges.community_id), which
//               is the one place the market is a property of the thing rather
//               than of the person. A worldwide challenge belongs to no market
//               even though creators from every market entered it.
//
// So a market's CPM is "what we spent on these creators, against what these
// creators delivered", and the worldwide total is not the sum of the markets -
// worldwide challenges sit outside all of them. That is a real property of the
// programme, not a rounding error, and it is why the challenge list says which
// market ran each one.

/** A profile-id -> Set(community ids) map, from the membership rows. */
export function membershipMap(rows = []) {
  const m = new Map()
  for (const r of rows) {
    if (!r?.profile_id || !r?.community_id) continue
    if (!m.has(r.profile_id)) m.set(r.profile_id, new Set())
    m.get(r.profile_id).add(r.community_id)
  }
  return m
}

/**
 * Narrow every dataset to one market.
 * @param {object} raw the whole loaded payload
 * @param {string} marketId a community id, or '' for the whole programme
 * @param {Array} memberRows community_members rows
 */
export function scopeToMarket(raw, marketId, memberRows = []) {
  if (!raw) return raw
  if (!marketId) return raw

  const byProfile = membershipMap(memberRows)
  const inMarket = (id) => !!byProfile.get(id)?.has(marketId)

  const profiles = (raw.profiles || []).filter((p) => inMarket(p.id))
  const ids = new Set(profiles.map((p) => p.id))

  return {
    ...raw,
    marketId,
    profiles,
    challenges: (raw.challenges || []).filter((c) => c.community_id === marketId),
    submissions: (raw.submissions || []).filter((s) => ids.has(s.creator_id)),
    rewards: (raw.rewards || []).filter((r) => ids.has(r.creator_id)),
    messages: (raw.messages || []).filter((m) => ids.has(m.sender_id)),
    decisions: raw.decisions || [],
  }
}

/**
 * WHO IS DELIVERING, AND WHAT THEY COST.
 *
 * One row per creator: the work, the money, and the two CPMs. The split is the
 * one Ethan asked for and it is not arbitrary - cash is money that leaves the
 * business, and a Tryp.com voucher is a seat we were going to fly anyway. So
 * cash gets a CPM of its own, and the second CPM is cash AND vouchers together,
 * which is the fully-loaded number. There is deliberately no voucher-only CPM:
 * nobody makes a decision on it.
 *
 * @returns {Array} rows sorted by views, highest first
 */
export function perCreator(raw, { currency = 'EUR', rates = FALLBACK_RATES } = {}) {
  if (!raw) return []
  const byId = new Map()

  for (const p of raw.profiles || []) {
    if (p.is_test || p.is_admin) continue
    byId.set(p.id, {
      id: p.id,
      name: p.name || 'Unknown',
      // Carried through so the table can show a face rather than initials.
      photo_url: p.photo_url || null,
      joined: p.accepted_at || p.created_at,
      lastSeen: p.last_seen_at || null,
      status: p.status,
      videos: 0,
      views: 0,
      challenges: new Set(),
      cash: 0,
      vouchers: 0,
      cashPending: 0,
      voucherPending: 0,
      messages: 0,
    })
  }

  for (const s of raw.submissions || []) {
    const row = byId.get(s.creator_id)
    if (!row) continue
    row.videos += 1
    row.views += Number(s.logged_views || 0)
    if (s.challenge_id) row.challenges.add(s.challenge_id)
  }

  for (const r of raw.rewards || []) {
    const row = byId.get(r.creator_id)
    if (!row) continue
    const amt = convert(Number(r.amount || 0), r.currency || 'GBP', currency, rates)
    const pending = r.status !== 'distributed'
    if (r.reward_type === 'cash') {
      row.cash += amt
      if (pending) row.cashPending += amt
    } else {
      row.vouchers += amt
      if (pending) row.voucherPending += amt
    }
  }

  for (const m of raw.messages || []) {
    const row = byId.get(m.sender_id)
    if (row) row.messages += 1
  }

  return [...byId.values()]
    .map((r) => ({
      ...r,
      challenges: r.challenges.size,
      spend: r.cash + r.vouchers,
      // PER THOUSAND VIEWS. Null rather than zero or Infinity when there are no
      // views: a creator who has not posted has no cost per view, and showing
      // "0.00" would rank them as the most efficient person in the programme.
      cashCpm: r.views > 0 ? (r.cash / r.views) * 1000 : null,
      combinedCpm: r.views > 0 ? ((r.cash + r.vouchers) / r.views) * 1000 : null,
      avgViews: r.videos > 0 ? r.views / r.videos : 0,
    }))
    .sort((a, b) => b.views - a.views)
}

/**
 * HOW THE COMMUNITY GREW, month by month and as a running total.
 *
 * Counted from when somebody was ACCEPTED rather than when they signed up: the
 * programme's size is the number of people in it, and an application sitting in
 * the queue is not one of them. Falls back to created_at for the rows that
 * predate the accepted_at column.
 *
 * @returns {Array<{month: string, joined: number, left: number, total: number}>}
 */
export function growthByMonth(profiles = [], { months = 18 } = {}) {
  const real = profiles.filter((p) => !p.is_test && !p.is_admin)
  const buckets = new Map()

  const key = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`

  for (const p of real) {
    const raw = p.accepted_at || p.created_at
    if (!raw) continue
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) continue
    const k = key(d)
    if (!buckets.has(k)) buckets.set(k, { month: k, joined: 0, left: 0 })
    buckets.get(k).joined += 1

    if (p.deletion_requested_at) {
      const g = new Date(p.deletion_requested_at)
      if (!Number.isNaN(g.getTime())) {
        const gk = key(g)
        if (!buckets.has(gk)) buckets.set(gk, { month: gk, joined: 0, left: 0 })
        buckets.get(gk).left += 1
      }
    }
  }

  const ordered = [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month))
  let running = 0
  const withTotals = ordered.map((b) => {
    running += b.joined - b.left
    return { ...b, net: b.joined - b.left, total: running }
  })
  return months ? withTotals.slice(-months) : withTotals
}

/** "2026-08" -> "Aug 26", for an axis that has to fit twelve of them. */
export function monthLabel(key) {
  const [y, m] = String(key).split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[Number(m) - 1] || m} ${String(y).slice(2)}`
}
