// CCC TARGETS AND PROFIT (20 Oct 2026). The maths behind Analytics > Targets & profit, pure and tested.
//
// Ethan and Francesco's sheet had, per month: a view target, an estimated EPM (what 1,000 views earn Tryp) and CPM
// (what 1,000 views cost), estimated earnings/costs/margin from the TARGET, and actual earnings/costs/margin from the
// views achieved. Its "actual costs" were achieved x 0.50 because nothing better was to hand; here they are the money
// the platform actually committed (prize pots, vouchers, VIP pay) plus whatever the team adds as other costs.
//
// THE PLAN RUNS ITSELF (migration 446). Each side has one ANCHOR (a month and its view target) and a monthly GROWTH:
// every month's target is anchor x (1 + growth) ^ (months from the anchor), forwards and backwards, so January at 17M
// and 7% gives every other month, and a month that has not come yet is simply the next step. A month can still be
// SET BY HAND (`pinned` in ccc_targets); that changes that month only.
//
// A month is one of three things, and every figure says which:
//   done    the month is over: final views, final costs.
//   live    today is inside it: views so far, and the pace they set for the whole month (on track / behind).
//   future  nothing measured yet: the plan only.
import { convert, FALLBACK_RATES } from './programme'

export const SEGMENTS = [
  { key: 'community', label: 'Community', hint: 'Every creator in the challenges' },
  { key: 'vip', label: 'VIP', hint: 'Paid creators: VIP and official' },
  { key: 'all', label: 'Combined', hint: 'Community and VIP together' },
]

const DAY = 86_400_000
export const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`
export const parseMonth = (key) => { const [y, m] = String(key).split('-').map(Number); return { year: y, month: m } }
export const monthStart = (key) => { const { year, month } = parseMonth(key); return Date.UTC(year, month - 1, 1) }
export const monthEnd = (key) => { const { year, month } = parseMonth(key); return Date.UTC(year, month, 1) }
export const daysIn = (key) => Math.round((monthEnd(key) - monthStart(key)) / DAY)
export function addMonths(key, n) {
  const { year, month } = parseMonth(key)
  const d = new Date(Date.UTC(year, month - 1 + n, 1))
  return monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1)
}
export function monthRange(from, to) {
  const out = []
  for (let k = from; k <= to && out.length < 60; k = addMonths(k, 1)) out.push(k)
  return out
}
export function monthLabel(key, style = 'short') {
  const { year, month } = parseMonth(key)
  const d = new Date(Date.UTC(year, month - 1, 1))
  if (style === 'long') return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  if (style === 'pick') return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  if (style === 'month') return d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace(' ', " '")
}

/** Where a month stands against `now`: done, live (with how far in) or future. */
export function monthState(key, now = Date.now()) {
  const t = typeof now === 'number' ? now : now.getTime()
  const s = monthStart(key)
  const e = monthEnd(key)
  const days = daysIn(key)
  if (t >= e) return { state: 'done', days, elapsed: days, left: 0, share: 1 }
  if (t < s) return { state: 'future', days, elapsed: 0, left: days, share: 0 }
  const elapsed = Math.max(0.5, (t - s) / DAY)
  return { state: 'live', days, elapsed, left: Math.max(0, days - elapsed), share: elapsed / days }
}

/** The rates the database last saw (base GBP), with the hardcoded fallback underneath. */
export function ratesFrom(fx) {
  const r = { ...FALLBACK_RATES }
  if (fx && typeof fx === 'object') for (const [k, v] of Object.entries(fx)) if (k !== 'base' && Number(v) > 0) r[k] = Number(v)
  return r
}
const eur = (amount, currency, rates) => convert(Number(amount) || 0, currency || 'EUR', 'EUR', rates) || 0

// WHAT ONE CHALLENGE COST, in euros. The cash pot is committed the moment a challenge runs, so a live challenge counts
// its whole pot (or what was actually paid in cash, if more); vouchers and other rewards count once they are given.
export function challengeCost(c, rates = FALLBACK_RATES) {
  const rewards = c?.rewards || []
  const cashPaid = rewards.filter((r) => r.type === 'cash').reduce((n, r) => n + eur(r.amount, r.currency, rates), 0)
  const vouchers = rewards.filter((r) => r.type !== 'cash').reduce((n, r) => n + eur(r.amount, r.currency, rates), 0)
  const pot = eur(c?.prize_amount, c?.prize_currency, rates)
  const cash = Math.max(pot, cashPaid)
  return { cash, vouchers, total: cash + vouchers, paid: cashPaid + vouchers, planned: c?.status === 'draft' }
}

// A CHALLENGE'S MONEY IS SPREAD OVER THE MONTHS IT RAN, by days. The Global Challenge ran 21 Sep to 18 Oct, so a third
// of it is September's cost and two thirds October's - which is when its views came in, too.
export function allocateChallenges(challenges = [], months = [], { rates = FALLBACK_RATES, includePlanned = false } = {}) {
  const out = Object.fromEntries(months.map((k) => [k, { total: 0, cash: 0, vouchers: 0, lines: [] }]))
  for (const c of challenges) {
    const cost = challengeCost(c, rates)
    if (cost.planned && !includePlanned) continue
    // To the nearest midnight (UTC): a challenge that opens at midnight in Madrid starts at 23:00 UTC the day before,
    // which put an hour of RETO OCTUBRE (EUR 1) into September.
    const s = Math.round(new Date(c.starts_at).getTime() / DAY) * DAY
    const e = Math.round(new Date(c.ends_at).getTime() / DAY) * DAY
    if (!(e > s) || cost.total <= 0) continue
    const span = e - s
    for (const k of months) {
      const overlap = Math.min(e, monthEnd(k)) - Math.max(s, monthStart(k))
      if (overlap <= 0) continue
      const share = overlap / span
      const slot = out[k]
      slot.cash += cost.cash * share
      slot.vouchers += cost.vouchers * share
      slot.total += cost.total * share
      slot.lines.push({ id: c.id, title: c.title, market: c.market, share, amount: cost.total * share, planned: cost.planned, status: c.status })
    }
  }
  return out
}

const num = (v) => (v == null || v === '' ? null : Number(v))

// ---- THE GROWTH PLAN ------------------------------------------------------------------------------------------------
const DEFAULT_PLANS = {
  community: { segment: 'community', start: '2026-09', anchor: '2027-01', anchorViews: 17_000_000, growth: 0.07, epm: 0.9, cpm: 0.5 },
  vip: { segment: 'vip', start: '2026-09', anchor: '2026-10', anchorViews: 16_000_000, growth: 0.07, epm: 0.9, cpm: 0.25 },
}
/** A ccc_plans row (or nothing) as the page uses it. */
export function planOf(plans = [], segment) {
  const r = (plans || []).find((p) => p.segment === segment)
  if (!r) return { ...DEFAULT_PLANS[segment] }
  return {
    segment,
    start: monthKey(r.start_year, r.start_month),
    anchor: monthKey(r.anchor_year, r.anchor_month),
    anchorViews: Number(r.anchor_views) || 0,
    growth: Number(r.growth) || 0,
    epm: Number(r.epm),
    cpm: Number(r.cpm),
  }
}
/** Whole months from a to b (b later = positive). */
export function monthsBetween(a, b) {
  const x = parseMonth(a)
  const y = parseMonth(b)
  return (y.year - x.year) * 12 + (y.month - x.month)
}
/** The plan's target for a month: the anchor grown (or shrunk) by the growth, to the nearest 1,000. */
export function planTarget(plan, key) {
  if (!plan || !key || key < plan.start) return null
  const v = plan.anchorViews * (1 + plan.growth) ** monthsBetween(plan.anchor, key)
  return Math.round(v / 1000) * 1000
}
/** The months the page shows by default: the plan's first month to nine months from now (it grows on its own). */
export function defaultRange(plans = [], nowKey) {
  const ps = ['community', 'vip'].map((s) => planOf(plans, s))
  const from = ps.map((p) => p.start).sort()[0]
  const ends = [addMonths(nowKey, 9), ...ps.map((p) => p.anchor)].sort()
  return { from, to: ends[ends.length - 1] }
}

// A CHALLENGE THAT RAN OFF THE PLATFORM (challenge_history, migration 446): its views and its prize money, spread over
// the days it ran like a platform challenge's cost. `ends_at` is the last DAY, so it runs to the end of it.
function importedAsChallenge(h) {
  return {
    id: `h-${h.id}`, title: h.title, market: h.country_code, status: 'imported', imported: true,
    starts_at: `${h.starts_at}T00:00:00Z`, ends_at: new Date(Date.parse(`${h.ends_at}T00:00:00Z`) + DAY).toISOString(),
    prize_amount: h.prize_total, prize_currency: h.prize_currency, rewards: [], views: Number(h.total_views) || 0,
  }
}
export function spreadViews(items = [], months = []) {
  const out = Object.fromEntries(months.map((k) => [k, 0]))
  for (const c of items) {
    const s = Math.round(new Date(c.starts_at).getTime() / DAY) * DAY
    const e = Math.round(new Date(c.ends_at).getTime() / DAY) * DAY
    if (!(e > s) || !(c.views > 0)) continue
    for (const k of months) {
      const overlap = Math.min(e, monthEnd(k)) - Math.max(s, monthStart(k))
      if (overlap > 0) out[k] += c.views * (overlap / (e - s))
    }
  }
  return out
}

/**
 * One segment's months: plan, measured, projected and money, ready to draw.
 * `segment` is 'community' or 'vip'; use combineSegments for both.
 */
export function buildMonths({ segment, months, plans = [], targets = [], actuals, now = Date.now(), costMode = 'real', includePlanned = false }) {
  const rates = ratesFrom(actuals?.fx)
  const byKey = Object.fromEntries((actuals?.months || []).map((m) => [m.month, m]))
  const growthPlan = planOf(plans, segment)
  const plan = Object.fromEntries(targets.filter((t) => t.segment === segment).map((t) => [monthKey(t.year, t.month), t]))
  const imported = segment === 'community' ? (actuals?.imported || []).map(importedAsChallenge) : []
  const importedViews = spreadViews(imported, months)
  const challenges = segment === 'community' ? allocateChallenges([...(actuals?.challenges || []), ...imported], months, { rates, includePlanned }) : {}
  const other = {}
  for (const r of actuals?.other_rewards || []) {
    if (segment !== 'community') break
    other[r.month] = (other[r.month] || 0) + eur(r.amount, r.currency, rates)
  }
  const vipPay = {}
  for (const r of actuals?.vip_pay || []) {
    if (segment !== 'vip') break
    const slot = vipPay[r.month] || (vipPay[r.month] = { total: 0, vip: 0, official: 0, live: false, source: r.source })
    const a = eur(r.amount, r.currency, rates)
    slot.total += a
    slot[r.kind === 'official' ? 'official' : 'vip'] += a
    slot.live = slot.live || !!r.live
  }

  return months.map((key) => {
    const t = plan[key]
    const a = byKey[key]
    const st = monthState(key, now)
    const pinned = !!(t?.pinned && t.view_target != null)
    const target = pinned ? Number(t.view_target) : planTarget(growthPlan, key)
    const epm = num(t?.epm) ?? growthPlan.epm
    const cpm = num(t?.cpm) ?? growthPlan.cpm
    const otherCosts = t ? Number(t.other_costs) || 0 : 0
    const override = t ? num(t.achieved_override) : null

    let measured = null
    let source = 'platform'
    const offPlatform = Math.round(importedViews[key] || 0)
    if (a) {
      if (segment === 'community') measured = (Number(a.community_views) || 0) + offPlatform
      else if (a.vip_sheet_views != null) { measured = Number(a.vip_sheet_views) || 0; source = 'sheet' }
      else measured = (Number(a.vip_views) || 0) + (Number(a.official_views) || 0)
    }
    const measuredOn = st.state !== 'future' && measured != null
    const achieved = st.state === 'future' ? null : (override != null ? override : measuredOn ? measured : null)
    if (override != null && st.state !== 'future') source = 'override'
    const projected = achieved == null ? null : st.state === 'live' ? achieved / st.share : achieved

    // MONEY THE PLATFORM SAW, in euros.
    const ch = challenges[key] || { total: 0, cash: 0, vouchers: 0, lines: [] }
    const rewardsOther = other[key] || 0
    const pay = vipPay[key] || { total: 0, vip: 0, official: 0, live: false }
    const platformCost = segment === 'community' ? ch.total + rewardsOther : pay.total
    // The live month's VIP pay is "so far"; it grows with the views. Prize pots do not: they are the whole pot already.
    const platformProjected = segment === 'vip' && st.state === 'live' ? platformCost / st.share : platformCost
    const realCost = st.state === 'future' ? null : platformCost + otherCosts
    const realProjected = st.state === 'future' ? null : platformProjected + otherCosts
    const targetCost = achieved == null ? null : achieved * cpm / 1000 + otherCosts
    const actualCost = costMode === 'target' ? targetCost : realCost
    const projectedCost = costMode === 'target' ? (projected == null ? null : projected * cpm / 1000 + otherCosts) : realProjected

    const estEarnings = target == null ? null : target * epm / 1000
    const estCost = target == null ? null : target * cpm / 1000 + otherCosts
    const actualEarnings = achieved == null ? null : achieved * epm / 1000
    const projectedEarnings = projected == null ? null : projected * epm / 1000

    const pct = target && achieved != null ? achieved / target : null
    const projectedPct = target && projected != null ? projected / target : null
    const status = statusOf(st.state, projectedPct)
    const neededPerDay = st.state === 'live' && target != null && st.left > 0 ? Math.max(0, (target - achieved) / st.left) : null

    return {
      key, label: monthLabel(key), longLabel: monthLabel(key, 'long'), ...st,
      hasPlan: target != null, pinned, note: t?.note || null, id: t?.id || null, offPlatform,
      target, epm, cpm, otherCosts, override, measured: measuredOn ? measured : null, source,
      achieved, projected, pct, projectedPct, status, neededPerDay,
      perDay: achieved != null && st.elapsed > 0 ? achieved / st.elapsed : null,
      estEarnings, estCost, estMargin: estEarnings == null ? null : estEarnings - estCost,
      actualEarnings, actualCost, actualMargin: actualEarnings == null || actualCost == null ? null : actualEarnings - actualCost,
      projectedEarnings, projectedCost, projectedMargin: projectedEarnings == null || projectedCost == null ? null : projectedEarnings - projectedCost,
      actualCpm: achieved > 0 && actualCost != null ? actualCost / achieved * 1000 : null,
      realCost, targetCost,
      costs: segment === 'community'
        ? { challenges: ch.total, cash: ch.cash, vouchers: ch.vouchers, rewards: rewardsOther, other: otherCosts, lines: ch.lines }
        : { vip: pay.vip, official: pay.official, other: otherCosts, live: pay.live, source: pay.source },
      videos: a ? Number(segment === 'community' ? a.community_videos : a.vip_videos) || 0 : null,
      creators: a ? Number(segment === 'community' ? a.community_creators : a.vip_creators) || 0 : null,
    }
  })
}

export function statusOf(state, projectedPct) {
  if (state === 'future' || projectedPct == null) return state === 'future' ? 'upcoming' : 'no-target'
  if (state === 'done') return projectedPct >= 1 ? 'hit' : projectedPct >= 0.9 ? 'near' : 'missed'
  return projectedPct >= 1 ? 'on-track' : projectedPct >= 0.9 ? 'close' : 'behind'
}

export const STATUS = {
  hit: { label: 'Target hit', tone: 'good' },
  near: { label: 'Just missed', tone: 'warn' },
  missed: { label: 'Missed', tone: 'bad' },
  'on-track': { label: 'On track', tone: 'good' },
  close: { label: 'Close', tone: 'warn' },
  behind: { label: 'Behind', tone: 'bad' },
  upcoming: { label: 'Upcoming', tone: 'idle' },
  'no-target': { label: 'No target', tone: 'idle' },
}

const add = (a, b) => (a == null && b == null ? null : (a || 0) + (b || 0))

/** Community + VIP, month by month. Rates (EPM/CPM) become the blended ones the sums imply. */
export function combineSegments(a = [], b = []) {
  return a.map((x, i) => {
    const y = b[i] || {}
    const target = add(x.target, y.target)
    const achieved = add(x.achieved, y.achieved)
    const projected = add(x.projected, y.projected)
    const pct = target && achieved != null ? achieved / target : null
    const projectedPct = target && projected != null ? projected / target : null
    const actualCost = add(x.actualCost, y.actualCost)
    const actualEarnings = add(x.actualEarnings, y.actualEarnings)
    const projectedEarnings = add(x.projectedEarnings, y.projectedEarnings)
    const projectedCost = add(x.projectedCost, y.projectedCost)
    const estEarnings = add(x.estEarnings, y.estEarnings)
    const estCost = add(x.estCost, y.estCost)
    return {
      ...x,
      hasPlan: x.hasPlan || y.hasPlan, pinned: false, note: null, id: null, offPlatform: x.offPlatform || 0,
      target, achieved, projected, pct, projectedPct, status: statusOf(x.state, projectedPct),
      measured: add(x.measured, y.measured), override: null, source: 'platform',
      neededPerDay: x.state === 'live' && target != null && x.left > 0 ? Math.max(0, (target - achieved) / x.left) : null,
      perDay: achieved != null && x.elapsed > 0 ? achieved / x.elapsed : null,
      epm: target ? estEarnings / target * 1000 : x.epm,
      cpm: target ? (estCost - add(x.otherCosts, y.otherCosts)) / target * 1000 : x.cpm,
      otherCosts: add(x.otherCosts, y.otherCosts),
      estEarnings, estCost, estMargin: estEarnings == null ? null : estEarnings - estCost,
      actualEarnings, actualCost, actualMargin: actualEarnings == null || actualCost == null ? null : actualEarnings - actualCost,
      projectedEarnings, projectedCost, projectedMargin: projectedEarnings == null || projectedCost == null ? null : projectedEarnings - projectedCost,
      actualCpm: achieved > 0 && actualCost != null ? actualCost / achieved * 1000 : null,
      costs: { community: x.actualCost, vip: y.actualCost },
      videos: add(x.videos, y.videos), creators: add(x.creators, y.creators),
    }
  })
}

/** The headline: everything measured so far (done months + the live month as it stands), and the whole plan. */
export function summarise(rows = []) {
  const measured = rows.filter((r) => r.state !== 'future' && r.achieved != null)
  const sum = (list, f) => list.reduce((n, r) => n + (Number(r[f]) || 0), 0)
  // THE PLAN TO DATE counts the month in progress only as far as it has got: 20 days into October is 20/31 of
  // October's target, not all of it, or the season reads 46% when it is really 54% of where it should be.
  const due = (list, f) => list.reduce((n, r) => n + (Number(r[f]) || 0) * (r.state === 'live' ? r.share : 1), 0)
  const live = rows.find((r) => r.state === 'live') || null
  const targetToDate = due(measured, 'target')
  const achieved = sum(measured, 'achieved')
  const earnings = sum(measured, 'actualEarnings')
  const cost = sum(measured, 'actualCost')
  const margin = earnings - cost
  const planned = rows.filter((r) => r.target != null)
  const lastDone = [...rows].reverse().find((r) => r.state === 'done' && r.achieved != null) || null
  const bestMonth = measured.reduce((b, r) => (!b || (r.projected || 0) > (b.projected || 0) ? r : b), null)
  return {
    months: rows.length, measuredMonths: measured.length, live, lastDone, bestMonth,
    targetToDate, achieved, pctToDate: targetToDate ? achieved / targetToDate : null,
    earnings, cost, margin, marginPct: earnings > 0 ? margin / earnings : null, cpm: achieved > 0 ? cost / achieved * 1000 : null,
    estEarnings: due(measured, 'estEarnings'), estCost: due(measured, 'estCost'), estMargin: due(measured, 'estMargin'),
    planViews: sum(planned, 'target'), planEarnings: sum(planned, 'estEarnings'), planCost: sum(planned, 'estCost'), planMargin: sum(planned, 'estMargin'),
    hits: measured.filter((r) => r.state === 'done' && r.status === 'hit').length,
    doneMonths: measured.filter((r) => r.state === 'done').length,
  }
}

/** Month-on-month change, as a fraction (0.07 = +7%), or null without a base. */
export const growth = (now, before) => (before > 0 && now != null ? now / before - 1 : null)

/** The monthly growth needed to get from `from` to `to` in `months` steps. */
export function neededGrowth(from, to, months) {
  if (!(from > 0) || !(to > 0) || !(months > 0)) return null
  return (to / from) ** (1 / months) - 1
}

/** The sheet as a CSV: one line per month, plain numbers (no symbols), so it opens straight into a spreadsheet. */
export function csvRows(rows, segmentLabel) {
  const r2 = (n) => (n == null ? '' : Math.round(n * 100) / 100)
  const whole = (n) => (n == null ? '' : Math.round(n))
  return rows.map((r) => ({
    segment: segmentLabel, month: r.longLabel,
    state: r.state === 'live' ? 'In progress' : r.state === 'done' ? 'Complete' : 'Upcoming',
    status: STATUS[r.status]?.label || '',
    target: whole(r.target), target_set: r.pinned ? 'Set by hand' : r.target != null ? 'Growth plan' : '',
    achieved: whole(r.achieved), projected: r.state === 'live' ? whole(r.projected) : '',
    pct: r.pct == null ? '' : Math.round(r.pct * 1000) / 10,
    epm: r2(r.epm), cpm: r2(r.cpm),
    est_earnings: r2(r.estEarnings), est_costs: r2(r.estCost), est_margin: r2(r.estMargin),
    actual_earnings: r2(r.actualEarnings), actual_costs: r2(r.actualCost), actual_margin: r2(r.actualMargin), actual_cpm: r2(r.actualCpm),
    note: r.note || '',
  }))
}
export const CSV_COLUMNS = [
  { key: 'segment', label: 'Side' }, { key: 'month', label: 'Month' }, { key: 'state', label: 'Month state' },
  { key: 'status', label: 'Result' }, { key: 'target', label: 'View target' }, { key: 'target_set', label: 'Target from' },
  { key: 'achieved', label: 'Views achieved' }, { key: 'projected', label: 'On pace for' }, { key: 'pct', label: '% of target' },
  { key: 'epm', label: 'EPM (EUR per 1,000 views)' }, { key: 'cpm', label: 'Target CPM (EUR per 1,000 views)' },
  { key: 'est_earnings', label: 'Planned earnings (EUR)' }, { key: 'est_costs', label: 'Planned costs (EUR)' }, { key: 'est_margin', label: 'Planned margin (EUR)' },
  { key: 'actual_earnings', label: 'Actual earnings (EUR)' }, { key: 'actual_costs', label: 'Actual costs (EUR)' }, { key: 'actual_margin', label: 'Actual margin (EUR)' },
  { key: 'actual_cpm', label: 'Actual CPM (EUR)' }, { key: 'note', label: 'Note' },
]
