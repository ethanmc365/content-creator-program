import { describe, expect, it } from 'vitest'
import { applyPeriod, buckets, bucketFor, change, inRange, overlaps, periodHeadline, periodRange } from './analyticsPeriod'

// Thursday 2 Oct 2026, 15:00 local.
const NOW = new Date(2026, 9, 2, 15, 0, 0)
const d = (y, m, day, h = 0) => new Date(y, m - 1, day, h)

describe('periodRange', () => {
  it('all time is open at both ends', () => {
    const r = periodRange('all', NOW)
    expect(r.start).toBeNull()
    expect(r.end).toBeNull()
    expect(r.prev).toBeNull()
  })

  it('this month runs from the 1st to now and compares with the same stretch of last month', () => {
    const r = periodRange('this_month', NOW)
    expect(r.start).toEqual(d(2026, 10, 1))
    expect(r.end).toEqual(NOW)
    expect(r.prev.start).toEqual(d(2026, 9, 1))
    expect(r.prev.end).toEqual(d(2026, 9, 2, 15))
  })

  it('last month is the whole of September, compared with August', () => {
    const r = periodRange('last_month', NOW)
    expect(r.start).toEqual(d(2026, 9, 1))
    expect(r.end).toEqual(d(2026, 10, 1))
    expect(r.prev.start).toEqual(d(2026, 8, 1))
    expect(r.label).toBe('September 2026')
  })

  it('weeks start on Monday', () => {
    expect(periodRange('this_week', NOW).start).toEqual(d(2026, 9, 28))
    const lw = periodRange('last_week', NOW)
    expect(lw.start).toEqual(d(2026, 9, 21))
    expect(lw.end).toEqual(d(2026, 9, 28))
  })

  it('last 7 days includes today and the six before it', () => {
    const r = periodRange('last_7', NOW)
    expect(r.start).toEqual(d(2026, 9, 26))
    expect(r.end).toEqual(d(2026, 10, 3))
    expect(r.prev.start).toEqual(d(2026, 9, 19))
  })

  it('custom dates are inclusive and fall back to all time when invalid', () => {
    const r = periodRange('custom', NOW, { from: '2026-09-01', to: '2026-09-10' })
    expect(r.start).toEqual(d(2026, 9, 1))
    expect(r.end).toEqual(d(2026, 9, 11))
    expect(r.prev.start).toEqual(d(2026, 8, 22))
    expect(periodRange('custom', NOW, { from: '2026-09-10', to: '2026-09-01' }).key).toBe('all')
  })
})

describe('inRange / overlaps', () => {
  const sept = periodRange('last_month', NOW)
  it('is half-open', () => {
    expect(inRange(d(2026, 9, 1), sept)).toBe(true)
    expect(inRange(d(2026, 10, 1), sept)).toBe(false)
    expect(inRange(null, sept)).toBe(false)
    expect(inRange(null, periodRange('all', NOW))).toBe(true)
  })
  it('a challenge counts in every period it was open in', () => {
    expect(overlaps('2026-08-20', '2026-09-03', sept)).toBe(true)
    expect(overlaps('2026-09-30', '2026-10-20', sept)).toBe(true)
    expect(overlaps('2026-08-01', '2026-08-31', sept)).toBe(false)
    expect(overlaps('2026-10-01', '2026-10-20', sept)).toBe(false)
  })
})

describe('change', () => {
  it('never divides by zero into a fake percentage', () => {
    expect(change(12, 10)).toBe(20)
    expect(change(5, 0)).toBeNull()
    expect(change(0, 0)).toBe(0)
    expect(change(5, null)).toBeNull()
  })
})

describe('buckets', () => {
  it('cuts short periods by day and fills the gaps', () => {
    const r = periodRange('last_7', NOW)
    expect(bucketFor(r)).toBe('day')
    expect(buckets(r, 'day')).toHaveLength(7)
  })
  it('cuts a quarter by week and all time by month', () => {
    expect(bucketFor(periodRange('last_90', NOW))).toBe('week')
    expect(bucketFor(periodRange('all', NOW))).toBe('month')
  })
})

describe('applyPeriod / periodHeadline', () => {
  const sept = periodRange('last_month', NOW)
  const raw = {
    profiles: [
      { id: 'a', created_at: '2026-09-05T10:00:00', status: 'active' },
      { id: 'b', created_at: '2026-08-05T10:00:00', status: 'active' },
      { id: 'q', created_at: '2026-09-06T10:00:00', status: 'active', is_test: true },
    ],
    challenges: [
      { id: 'c1', start_date: '2026-08-25', end_date: '2026-09-05' },
      { id: 'c2', start_date: '2026-10-01', end_date: '2026-10-20' },
    ],
    history: [{ id: 'h1', ends_at: '2026-09-20T00:00:00', total_views: 1000, prize_total: 10, prize_currency: 'EUR', posts: 4 }],
    submissions: [
      { id: 's1', challenge_id: 'c1', submitted_at: '2026-09-01T09:00:00', logged_views: 2000 },
      { id: 's2', challenge_id: 'c1', submitted_at: '2026-08-28T09:00:00', logged_views: 500 },
    ],
    rewards: [
      { status: 'distributed', reward_type: 'cash', amount: 20, currency: 'EUR', distributed_at: '2026-09-10T00:00:00' },
      { status: 'distributed', reward_type: 'voucher', amount: 10, currency: 'EUR', distributed_at: '2026-10-01T00:00:00' },
    ],
    messages: [], results: [], feedback: [], gameScores: [], connections: [], decisions: [], voucherCounts: [],
  }
  const money = (n) => Number(n) || 0

  it('keeps what happened inside the period and challenges open in it', () => {
    const ps = applyPeriod(raw, sept)
    expect(ps.challenges.map((c) => c.id)).toEqual(['c1'])
    expect(ps.submissions.map((s) => s.id)).toEqual(['s1'])
    expect(ps.rewards).toHaveLength(1)
    expect(ps.profiles).toHaveLength(3)
  })

  it('adds up the headline like for like', () => {
    const h = periodHeadline(raw, sept, money)
    expect(h).toMatchObject({ newCreators: 1, challenges: 2, submissions: 5, views: 3000, cash: 30, vouchers: 0 })
    expect(h.cashCpm).toBeCloseTo(10)
  })

  it('all time is the data untouched', () => {
    expect(applyPeriod(raw, periodRange('all', NOW))).toBe(raw)
  })
})
