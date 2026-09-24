import { describe, expect, it } from 'vitest'
import {
  adjacentQuarter, currentQuarter, kpiStatus, mergeKpiRows,
  metricLabel, quarterLabel, quarterProgress, quarterRange,
} from './kpiTracker'

describe('currentQuarter', () => {
  it('reads the calendar quarter off a date', () => {
    expect(currentQuarter(new Date(2026, 0, 15))).toEqual({ year: 2026, quarter: 1 })
    expect(currentQuarter(new Date(2026, 2, 31))).toEqual({ year: 2026, quarter: 1 })
    expect(currentQuarter(new Date(2026, 3, 1))).toEqual({ year: 2026, quarter: 2 })
    expect(currentQuarter(new Date(2026, 8, 23))).toEqual({ year: 2026, quarter: 3 })
    expect(currentQuarter(new Date(2026, 11, 31))).toEqual({ year: 2026, quarter: 4 })
  })
})

describe('quarterLabel', () => {
  it('reads "Q<n> <year>"', () => {
    expect(quarterLabel(2026, 3)).toBe('Q3 2026')
  })
})

describe('adjacentQuarter', () => {
  it('steps within a year', () => {
    expect(adjacentQuarter(2026, 1, 1)).toEqual({ year: 2026, quarter: 2 })
    expect(adjacentQuarter(2026, 2, -1)).toEqual({ year: 2026, quarter: 1 })
  })
  it('wraps forward into the next year', () => {
    expect(adjacentQuarter(2026, 4, 1)).toEqual({ year: 2027, quarter: 1 })
  })
  it('wraps backward into the previous year', () => {
    expect(adjacentQuarter(2026, 1, -1)).toEqual({ year: 2025, quarter: 4 })
  })
  it('is the inverse of itself', () => {
    const a = adjacentQuarter(2026, 3, 1)
    expect(adjacentQuarter(a.year, a.quarter, -1)).toEqual({ year: 2026, quarter: 3 })
  })
})

describe('quarterRange', () => {
  it('spans exactly three calendar months', () => {
    const { start, end } = quarterRange(2026, 3)
    expect(start).toEqual(new Date(2026, 6, 1))
    expect(end).toEqual(new Date(2026, 9, 1))
  })
})

describe('quarterProgress', () => {
  it('is 0 right at the start', () => {
    expect(quarterProgress(2026, 3, new Date(2026, 6, 1))).toBe(0)
  })
  it('is 1 right at the end', () => {
    expect(quarterProgress(2026, 3, new Date(2026, 9, 1))).toBe(1)
  })
  it('is about a half at the midpoint', () => {
    const p = quarterProgress(2026, 3, new Date(2026, 7, 16, 12))
    expect(p).toBeGreaterThan(0.48)
    expect(p).toBeLessThan(0.52)
  })
  it('clamps a quarter that has not started to 0', () => {
    expect(quarterProgress(2027, 1, new Date(2026, 6, 1))).toBe(0)
  })
  it('clamps a long-past quarter to 1', () => {
    expect(quarterProgress(2020, 1, new Date(2026, 6, 1))).toBe(1)
  })
})

describe('kpiStatus', () => {
  const q = { year: 2026, quarter: 3 } // Jul 1 - Oct 1

  it('is met once the actual reaches the target, however early', () => {
    const r = kpiStatus({ target: 100, actual: 100, ...q, now: new Date(2026, 6, 5) })
    expect(r.status).toBe('met')
  })
  it('is on_track when running ahead of a straight-line pace', () => {
    // Exactly at the midpoint, 60 of 100 is ahead of the 50 pace would predict.
    const r = kpiStatus({ target: 100, actual: 60, ...q, now: new Date(2026, 7, 16, 12) })
    expect(r.status).toBe('on_track')
  })
  it('tolerates a 15% cushion under a straight-line pace', () => {
    // Midpoint pace is 50; 43 is within the 15% cushion (42.5).
    const r = kpiStatus({ target: 100, actual: 43, ...q, now: new Date(2026, 7, 16, 12) })
    expect(r.status).toBe('on_track')
  })
  it('is behind once it drops under the cushion', () => {
    const r = kpiStatus({ target: 100, actual: 30, ...q, now: new Date(2026, 7, 16, 12) })
    expect(r.status).toBe('behind')
  })
  it('is missed once the quarter is over and the target was not reached', () => {
    const r = kpiStatus({ target: 100, actual: 80, ...q, now: new Date(2026, 9, 2) })
    expect(r.status).toBe('missed')
  })
  it('is met, not missed, when the quarter ends exactly on target', () => {
    const r = kpiStatus({ target: 100, actual: 100, ...q, now: new Date(2026, 9, 2) })
    expect(r.status).toBe('met')
  })
  it('does not divide by zero on a zero target', () => {
    const r = kpiStatus({ target: 0, actual: 0, ...q, now: new Date(2026, 7, 1) })
    expect(r.status).toBe('met')
    expect(Number.isFinite(r.pct)).toBe(true)
  })
})

describe('mergeKpiRows', () => {
  const targets = [
    { metric: 'views', label: 'Views', target_value: 100000, current_value: null },
    { metric: 'custom', label: 'Zebra idea', target_value: 10, current_value: 4 },
    { metric: 'challenges_run', label: 'Challenges run', target_value: 3, current_value: null },
    { metric: 'custom', label: 'Alpha idea', target_value: 20, current_value: 9 },
  ]
  const actuals = [
    { metric: 'views', value: 76633 },
    { metric: 'challenges_run', value: 1 },
  ]

  it('orders standard metrics first in their canonical order, then customs alphabetically', () => {
    const merged = mergeKpiRows(targets, actuals)
    expect(merged.map((r) => metricLabel(r))).toEqual([
      'Challenges run', 'Views', 'Alpha idea', 'Zebra idea',
    ])
  })

  it('takes a standard row\'s actual from kpi_actuals, never current_value', () => {
    const merged = mergeKpiRows(targets, actuals)
    expect(merged.find((r) => r.metric === 'views').actual).toBe(76633)
  })

  it('takes a custom row\'s actual from its own current_value', () => {
    const merged = mergeKpiRows(targets, actuals)
    expect(merged.find((r) => r.label === 'Alpha idea').actual).toBe(9)
  })

  it('defaults a standard metric missing from actuals to 0, not undefined', () => {
    const merged = mergeKpiRows(
      [{ metric: 'creators_recruited', label: 'Creators recruited', target_value: 5, current_value: null }],
      actuals,
    )
    expect(merged[0].actual).toBe(0)
  })
})

import { adjacentMonth, currentMonth, monthLabel, periodLabel, periodRange } from './kpiTracker'

describe('monthly KPI periods (24 Sep 2026)', () => {
  it('knows the month and its quarter', () => {
    expect(currentMonth(new Date(2026, 8, 24))).toEqual({ year: 2026, quarter: 3, month: 9 })
    expect(monthLabel(2026, 9)).toBe('September 2026')
    expect(periodLabel({ year: 2026, quarter: 3, month: null })).toBe('Q3 2026')
  })
  it('steps across a year boundary and carries the quarter', () => {
    expect(adjacentMonth(2026, 12, 1)).toEqual({ year: 2027, quarter: 1, month: 1 })
    expect(adjacentMonth(2026, 1, -1)).toEqual({ year: 2025, quarter: 4, month: 12 })
    expect(adjacentMonth(2026, 9, 1)).toEqual({ year: 2026, quarter: 4, month: 10 })
  })
  it('judges pace against the month, not the quarter', () => {
    const { start, end } = periodRange({ year: 2026, quarter: 3, month: 9 })
    expect(start.getMonth()).toBe(8)
    expect(end.getMonth()).toBe(9)
    // Half-way through September, half the target is on pace; against the
    // whole quarter it would already read "met" territory at five-sixths.
    const mid = new Date(2026, 8, 16)
    expect(kpiStatus({ target: 100, actual: 20, year: 2026, quarter: 3, month: 9, now: mid }).status).toBe('behind')
    expect(kpiStatus({ target: 100, actual: 50, year: 2026, quarter: 3, month: 9, now: mid }).status).toBe('on_track')
  })
})
