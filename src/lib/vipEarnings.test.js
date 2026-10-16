import { describe, it, expect } from 'vitest'
import { earningsByCreator, earningsByMonth, earningsTotals, median } from './vipEarnings'

const row = (key, year, month, views, pay, extra = 0, more = {}) => ({ key, name: key, short: key, year, month, views, pay, extra, source: 'sheet', profile_id: null, ...more })

describe('vip earnings', () => {
  const rows = [
    row('nadia', 2025, 12, 112846, 28.21),
    row('nadia', 2026, 1, 4276, 1.07),
    row('nadia', 2026, 10, 2000, 0.5, 10, { source: 'platform', live: true, profile_id: 'p1', name: 'Nadia Sanchez' }),
    row('mary', 2025, 12, 803000, 200.75),
  ]
  it('folds a creator across the sheet and the platform, with the platform name', () => {
    const [mary, nadia] = earningsByCreator(rows)
    expect(mary.paid).toBeCloseTo(200.75)
    expect(nadia.name).toBe('Nadia Sanchez')
    expect(nadia.short).toBe('nadia')
    expect(nadia.paid).toBeCloseTo(39.78)
    expect(nadia.active).toBe(3)
    expect(nadia.cpm).toBeCloseTo(((28.21 + 1.07 + 0.5) / (112846 + 4276 + 2000)) * 1000)
    expect(nadia.median).toBeCloseTo(10.5)
    expect(nadia.best.paid).toBeCloseTo(28.21)
  })
  it('totals per month and overall, live month apart', () => {
    const months = earningsByMonth(rows)
    expect(months.map((m) => m.key)).toEqual(['2025-12', '2026-01', '2026-10'])
    expect(months[0].creators).toBe(2)
    const t = earningsTotals(earningsByCreator(rows), months)
    expect(t.paid).toBeCloseTo(240.53)
    expect(t.live.paid).toBeCloseTo(10.5)
    expect(t.lastLabel).toBe(months[1].label)
    expect(t.creatorMonths).toBe(4)
  })
  it('median of an even list is the middle pair', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBe(0)
  })
})
