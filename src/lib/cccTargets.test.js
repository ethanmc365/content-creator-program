import { describe, expect, it } from 'vitest'
import {
  addMonths, allocateChallenges, buildMonths, buildPlan, challengeCost, combineSegments, csvRows, monthRange, monthState,
  neededGrowth, statusOf, summarise,
} from './cccTargets'

const SHEET = [
  ['2026-09', 7500000], ['2026-10', 9825000], ['2026-11', 12175000], ['2026-12', 14550000], ['2027-01', 16954000],
]
const targets = SHEET.map(([k, v]) => ({ segment: 'community', year: +k.slice(0, 4), month: +k.slice(5), view_target: v, epm: 0.9, cpm: 0.5, other_costs: 0 }))
  .concat([{ segment: 'vip', year: 2026, month: 10, view_target: 12000000, epm: 0.9, cpm: 0.25, other_costs: 100, suggested: true }])

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

describe('the sheet, reproduced', () => {
  const rows = buildMonths({ segment: 'community', months, targets, actuals, now: NOW, costMode: 'target' })
  it('estimated earnings, costs and margin come from the target', () => {
    expect(rows[0].estEarnings).toBeCloseTo(6750)
    expect(rows[0].estCost).toBeCloseTo(3750)
    expect(rows[0].estMargin).toBeCloseTo(3000)
    expect(rows[1].estEarnings).toBeCloseTo(8842.5)
    expect(rows[4].estEarnings).toBeCloseTo(15258.6)
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
    expect(a['2026-09'].total).toBeCloseTo(780 * (10 + 1 / 24) / (27 + 23.98 / 24), 0)
    expect(a['2026-11'].lines.some((l) => l.planned)).toBe(false)
    const withDraft = allocateChallenges(actuals.challenges, months, { includePlanned: true })
    expect(withDraft['2026-11'].lines.some((l) => l.planned)).toBe(true)
  })
  it('community actual cost = challenges + other rewards + other costs', () => {
    const rows = buildMonths({ segment: 'community', months, targets, actuals, now: NOW })
    const oct = rows[1]
    expect(oct.actualCost).toBeCloseTo(oct.costs.challenges + 30)
    expect(oct.actualCpm).toBeGreaterThan(0)
    expect(rows[2].actualCost).toBeNull()
  })
})

describe('VIP', () => {
  const rows = buildMonths({ segment: 'vip', months, targets, actuals, now: NOW })
  it('reads September from the team sheet and October from the platform (VIP + official)', () => {
    expect(rows[0].achieved).toBe(5137612)
    expect(rows[0].source).toBe('sheet')
    expect(rows[1].achieved).toBe(7711354 + 2423615)
  })
  it('projects the live month and its pay at the current pace', () => {
    const oct = rows[1]
    expect(oct.projected).toBeCloseTo(oct.achieved / (19.5 / 31))
    expect(oct.status).toBe('on-track')
    expect(oct.realCost).toBeCloseTo(1620.94 + 923.56 + 100)
    expect(oct.projectedCost).toBeCloseTo((1620.94 + 923.56) / (19.5 / 31) + 100)
    expect(oct.suggested).toBe(true)
  })
})

describe('override, combine, summary', () => {
  it('an override replaces the measured figure and says so', () => {
    const t = targets.map((x) => (x.month === 9 && x.segment === 'community' ? { ...x, achieved_override: 3100000 } : x))
    const rows = buildMonths({ segment: 'community', months, targets: t, actuals, now: NOW })
    expect(rows[0].achieved).toBe(3100000)
    expect(rows[0].measured).toBe(2132298)
    expect(rows[0].source).toBe('override')
  })
  it('combines segments by adding', () => {
    const c = buildMonths({ segment: 'community', months, targets, actuals, now: NOW })
    const v = buildMonths({ segment: 'vip', months, targets, actuals, now: NOW })
    const all = combineSegments(c, v)
    expect(all[1].achieved).toBe(c[1].achieved + v[1].achieved)
    expect(all[1].target).toBe(9825000 + 12000000)
    expect(all[0].target).toBe(7500000)
  })
  it('summarises the months measured so far', () => {
    const rows = buildMonths({ segment: 'community', months, targets, actuals, now: NOW })
    const s = summarise(rows)
    expect(s.measuredMonths).toBe(2)
    expect(s.achieved).toBe(2132298 + 5755005)
    expect(s.targetToDate).toBeCloseTo(7500000 + 9825000 * (19.5 / 31))
    expect(s.live.key).toBe('2026-10')
    expect(s.planViews).toBe(SHEET.reduce((n, [, v]) => n + v, 0))
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
  it('builds a plan: straight line to January, then 7% a month', () => {
    const p = buildPlan({ start: '2026-09', startValue: 7500000, goal: '2027-01', goalValue: 16954000, until: '2027-03', after: 0.07 })
    expect(p.map((x) => x.key)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'])
    expect(p[0].view_target).toBe(7500000)
    expect(p[4].view_target).toBe(16954000)
    expect(p[5].view_target).toBe(18141000) // the sheet's February
    expect(p[6].view_target).toBe(19411000) // and March
  })
  it('builds a compound plan', () => {
    const p = buildPlan({ start: '2026-10', startValue: 100, goal: '2026-12', goalValue: 121, shape: 'compound' })
    expect(p).toHaveLength(3)
  })
  it('exports one CSV row per month', () => {
    const rows = buildMonths({ segment: 'community', months, targets, actuals, now: NOW })
    const csv = csvRows(rows, 'Community')
    expect(csv).toHaveLength(5)
    expect(csv[1].state).toBe('in progress')
  })
})
