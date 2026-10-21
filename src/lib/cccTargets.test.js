import { describe, expect, it } from 'vitest'
import {
  addMonths, allocateChallenges, buildMonths, challengeCost, combineSegments, csvRows, defaultRange, monthRange, monthState,
  challengeProfit, neededGrowth, planOf, planTarget, spreadViews, statusOf, summarise,
} from './cccTargets'

// The plans as migration 446 seeded them: community January 2027 = 17M at 7% a month; VIP October 2026 = 12M here.
const plans = [
  { segment: 'community', start_year: 2026, start_month: 9, anchor_year: 2027, anchor_month: 1, anchor_views: 17000000, growth: 0.07, epm: 0.9, cpm: 0.5 },
  { segment: 'vip', start_year: 2026, start_month: 9, anchor_year: 2026, anchor_month: 10, anchor_views: 12000000, growth: 0.07, epm: 0.9, cpm: 0.25 },
]
const PLAN = { '2026-09': 13000000, '2026-10': 13900000, '2026-11': 14800000, '2026-12': 15900000, '2027-01': 17000000 }
// Exceptions only: October VIP has other costs, nothing is set by hand.
const targets = [{ segment: 'vip', year: 2026, month: 10, view_target: null, pinned: false, epm: null, cpm: null, other_costs: 100 }]

// The real platform figures on 20 Oct 2026 (admin_ccc_actuals).
const actuals = {
  fx: { base: 'GBP', EUR: 1.1876 },
  months: [
    { month: '2026-09', community_views: 2132298, vip_views: 10600, official_views: 0, vip_sheet_views: 5137612, community_videos: 255, vip_videos: 1, community_creators: 29, vip_creators: 1 },
    { month: '2026-10', community_views: 5755005, vip_views: 7711354, official_views: 2423615, vip_sheet_views: null, community_videos: 717, vip_videos: 458, community_creators: 58, vip_creators: 19 },
  ],
  challenges: [
    { id: 'g', title: 'Global Challenge', status: 'archived', starts_at: '2026-09-20T23:00:00Z', ends_at: '2026-10-18T22:59:00Z', prize_amount: 600, prize_currency: 'EUR',
      rewards: [{ type: 'cash', amount: 570, currency: 'EUR' }, { type: 'cash', amount: 30, currency: 'EUR' }, { type: 'voucher', amount: 180, currency: 'EUR' }] },
    { id: 'es', title: 'RETO OCTUBRE', status: 'active', starts_at: '2026-10-01T11:00:00Z', ends_at: '2026-11-01T22:59:00Z', prize_amount: 720, prize_currency: 'EUR', rewards: [] },
    { id: 'd', title: 'Autumn Edition', status: 'draft', starts_at: '2026-10-23T23:00:00Z', ends_at: '2026-11-22T00:00:00Z', prize_amount: 1350, prize_currency: 'EUR', rewards: [] },
  ],
  other_rewards: [{ month: '2026-10', source: 'milestone', type: 'voucher', currency: 'EUR', amount: 30, n: 3 }],
  vip_pay: [
    { month: '2026-09', kind: 'vip', source: 'sheet', live: false, amount: 1061.3, currency: 'EUR' },
    { month: '2026-10', kind: 'vip', source: 'live', live: true, amount: 1620.94, currency: 'EUR' },
    { month: '2026-10', kind: 'official', source: 'live', live: true, amount: 923.56, currency: 'EUR' },
  ],
}
const NOW = Date.UTC(2026, 9, 20, 12) // 20 Oct 2026, midday
const months = monthRange('2026-09', '2027-01')

describe('months', () => {
  it('walks months across a year end', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(monthRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
  it('knows done, live and future', () => {
    expect(monthState('2026-09', NOW).state).toBe('done')
    const oct = monthState('2026-10', NOW)
    expect(oct.state).toBe('live')
    expect(oct.elapsed).toBeCloseTo(19.5)
    expect(monthState('2026-11', NOW).state).toBe('future')
  })
})

describe('the growth plan', () => {
  it('January is 17M and every other month is 7% a step, backwards and forwards', () => {
    const p = planOf(plans, 'community')
    for (const [k, v] of Object.entries(PLAN)) expect(planTarget(p, k)).toBe(v)
    expect(planTarget(p, '2027-02')).toBe(18200000)
    expect(planTarget(p, '2026-01')).toBeGreaterThan(0) // the plan reaches back to January 2026
    expect(planTarget(p, '2025-12')).toBeNull()
  })
  it('moving the anchor moves every month (October to 10M -> November 10.7M)', () => {
    const p = { ...planOf(plans, 'community'), anchor: '2026-10', anchorViews: 10000000 }
    expect(planTarget(p, '2026-11')).toBe(10700000)
    expect(planTarget(p, '2026-09')).toBe(9300000)
  })
  it('a month set by hand changes only that month', () => {
    const t = [{ segment: 'community', year: 2026, month: 11, view_target: 20000000, pinned: true }]
    const rows = buildMonths({ segment: 'community', months, plans, targets: t, actuals, now: NOW })
    expect(rows[2].target).toBe(20000000)
    expect(rows[2].pinned).toBe(true)
    expect(rows[3].target).toBe(PLAN['2026-12'])
  })
  it('shows nine months ahead, so new months arrive on their own', () => {
    expect(defaultRange(plans, '2026-10')).toEqual({ from: '2026-09', to: '2027-07' })
    expect(defaultRange(plans, '2027-03')).toEqual({ from: '2026-09', to: '2027-12' })
  })
})

describe('the sheet, reproduced', () => {
  const rows = buildMonths({ segment: 'community', months, plans, targets, actuals, now: NOW, costMode: 'target' })
  it('estimated earnings, costs and margin come from the target', () => {
    expect(rows[0].estEarnings).toBeCloseTo(13000000 * 0.9 / 1000)
    expect(rows[0].estCost).toBeCloseTo(13000000 * 0.5 / 1000)
    expect(rows[0].estMargin).toBeCloseTo(13000000 * 0.4 / 1000)
    expect(rows[4].estEarnings).toBeCloseTo(15300)
  })
  it('October achieved is the platform figure the sheet copied (5,755k)', () => {
    expect(rows[1].achieved).toBe(5755005)
    expect(rows[1].actualEarnings).toBeCloseTo(5179.5, 0)
    expect(rows[1].actualCost).toBeCloseTo(2877.5, 0) // the sheet's method: achieved x 0.50
  })
})

describe('real costs', () => {
  it('a challenge costs its pot (or more if paid) plus vouchers; drafts are planned', () => {
    expect(challengeCost(actuals.challenges[0]).total).toBe(780)
    expect(challengeCost(actuals.challenges[1]).total).toBeCloseTo(720)
    expect(challengeCost(actuals.challenges[2]).planned).toBe(true)
  })
  it('spreads a challenge over the months it ran, by days, and leaves drafts out unless asked', () => {
    const a = allocateChallenges(actuals.challenges, months)
    expect(a['2026-09'].total + a['2026-10'].total + a['2026-11'].total).toBeCloseTo(1500)
    expect(a['2026-09'].total).toBeCloseTo(780 * 10 / 28, 5) // 21 Sep - 18 Oct, whole days
    expect(a['2026-09'].lines.some((l) => l.id === 'es')).toBe(false) // opens at midnight in Madrid = 1 Oct
    expect(a['2026-11'].lines.some((l) => l.planned)).toBe(false)
    const withDraft = allocateChallenges(actuals.challenges, months, { includePlanned: true })
    expect(withDraft['2026-11'].lines.some((l) => l.planned)).toBe(true)
  })
  it('community actual cost = challenges + other rewards + other costs', () => {
    const rows = buildMonths({ segment: 'community', months, plans, targets, actuals, now: NOW })
    const oct = rows[1]
    expect(oct.actualCost).toBeCloseTo(oct.costs.challenges + 30)
    expect(oct.actualCpm).toBeGreaterThan(0)
    expect(rows[2].actualCost).toBeNull()
  })
})

describe('VIP', () => {
  const rows = buildMonths({ segment: 'vip', months, plans, targets, actuals, now: NOW })
  it('reads September from the team sheet and October from the platform, VIP creators only (no official)', () => {
    expect(rows[0].achieved).toBe(5137612)
    expect(rows[0].source).toBe('sheet')
    expect(rows[1].achieved).toBe(7711354)
  })
  it('projects the live month and its pay at the current pace', () => {
    const oct = rows[1]
    expect(oct.projected).toBeCloseTo(oct.achieved / (19.5 / 31))
    expect(oct.status).toBe('on-track')
    expect(oct.realCost).toBeCloseTo(1620.94 + 100) // official pay (923.56) is not VIP pay
    expect(oct.projectedCost).toBeCloseTo(1620.94 / (19.5 / 31) + 100)
  })
})

describe('override, combine, summary', () => {
  it('an override replaces the measured figure and says so', () => {
    const t = [...targets, { segment: 'community', year: 2026, month: 9, achieved_override: 3100000 }]
    const rows = buildMonths({ segment: 'community', months, plans, targets: t, actuals, now: NOW })
    expect(rows[0].achieved).toBe(3100000)
    expect(rows[0].measured).toBe(2132298)
    expect(rows[0].source).toBe('override')
  })
  it('combines segments by adding', () => {
    const c = buildMonths({ segment: 'community', months, plans, targets, actuals, now: NOW })
    const v = buildMonths({ segment: 'vip', months, plans, targets, actuals, now: NOW })
    const all = combineSegments(c, v)
    expect(all[1].achieved).toBe(c[1].achieved + v[1].achieved)
    expect(all[1].target).toBe(PLAN['2026-10'] + 12000000)
    expect(all[0].target).toBe(PLAN['2026-09'] + 11200000)
  })
  it('summarises the months measured so far', () => {
    const rows = buildMonths({ segment: 'community', months, plans, targets, actuals, now: NOW })
    const s = summarise(rows)
    expect(s.measuredMonths).toBe(2)
    expect(s.achieved).toBe(2132298 + 5755005)
    expect(s.targetToDate).toBeCloseTo(PLAN['2026-09'] + PLAN['2026-10'] * (19.5 / 31))
    expect(s.live.key).toBe('2026-10')
    expect(s.planViews).toBe(Object.values(PLAN).reduce((n, v) => n + v, 0))
  })
})

describe('status and growth', () => {
  it('reads status from pace', () => {
    expect(statusOf('live', 1.02)).toBe('on-track')
    expect(statusOf('live', 0.93)).toBe('close')
    expect(statusOf('live', 0.5)).toBe('behind')
    expect(statusOf('done', 1)).toBe('hit')
    expect(statusOf('future', null)).toBe('upcoming')
  })
  it('finds the monthly growth to a goal', () => {
    expect(neededGrowth(100, 121, 2)).toBeCloseTo(0.1)
    expect(neededGrowth(0, 10, 2)).toBeNull()
  })
  it('counts challenges run off the platform, spread by days (Desafio Setembro, 27 Aug - 27 Sep)', () => {
    const imp = { ...actuals, imported: [{ id: 'h1', title: 'Desafio Setembro', country_code: 'PO', starts_at: '2026-08-27', ends_at: '2026-09-27', total_views: 184184, prize_total: 290, prize_currency: 'EUR' }] }
    const rows = buildMonths({ segment: 'community', months, plans, targets, actuals: imp, now: NOW })
    expect(rows[0].offPlatform).toBe(Math.round(184184 * 27 / 32))
    expect(rows[0].achieved).toBe(2132298 + Math.round(184184 * 27 / 32))
    expect(rows[0].costs.lines.some((l) => l.title === 'Desafio Setembro')).toBe(true)
    expect(spreadViews([], months)['2026-09']).toBe(0)
  })
  it('exports one CSV row per month', () => {
    const rows = buildMonths({ segment: 'community', months, plans, targets, actuals, now: NOW })
    const csv = csvRows(rows, 'Community')
    expect(csv).toHaveLength(5)
    expect(csv[1].state).toBe('In progress')
    expect(csv[1].target_set).toBe('Growth plan')
  })
})

describe('a challenge for Tryp.com', () => {
  it('earns views x EPM and keeps what is left after the spend', () => {
    const p = challengeProfit({ views: 7278549, spend: 780 }, 0.9) // the October Global Challenge
    expect(p.earnings).toBeCloseTo(6550.69, 1)
    expect(p.profit).toBeCloseTo(5770.69, 1)
    expect(challengeProfit({ views: 100000, spend: 500 }, 0.9).profit).toBeCloseTo(-410)
    expect(challengeProfit({ views: 0, spend: 0 }).margin).toBeNull()
  })
})

describe('plan to date', () => {
  it('holds only months with a target against it', () => {
    const rows = buildMonths({ segment: 'vip', months, plans: [...plans.filter((p) => p.segment !== 'vip'), { ...plans[1], start_month: 10 }], targets, actuals, now: NOW })
    const s = summarise(rows)
    expect(rows[0].target).toBe(11200000) // September now has a target too (the plan reaches back to Jan 2026)
    expect(s.pctToDate).toBeCloseTo(s.achieved / s.targetToDate)
  })
})
