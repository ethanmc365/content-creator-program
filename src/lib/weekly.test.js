import { describe, expect, it } from 'vitest'
import { cleanWeekly, weeklyRounds } from './weekly'

describe('weeklyRounds', () => {
  it('cuts the Global Challenge into four weeks, the last one ending with the challenge', () => {
    const r = weeklyRounds('2026-09-20T23:00:00Z', '2026-10-18T22:59:00Z', 7)
    expect(r).toHaveLength(4)
    expect(r[3].endsAt).toBe('2026-10-18T22:59:00.000Z')
  })
  it('folds a short remainder into the last round and keeps a long one', () => {
    expect(weeklyRounds('2026-10-23T23:00:00Z', '2026-11-22T00:00:00Z', 7)).toHaveLength(4)
    expect(weeklyRounds('2026-10-01T00:00:00Z', '2026-10-26T00:00:00Z', 7)).toHaveLength(4)
  })
  it('keeps nothing without an amount', () => {
    expect(cleanWeekly({ amount: '' })).toBe(null)
    expect(cleanWeekly({ amount: '10', type: 'cash' })).toEqual({ amount: 10, currency: 'EUR', type: 'cash', every_days: 7 })
  })
})
