import { describe, it, expect } from 'vitest'
import { prizeBudget, followAmount, numberIn, participationExtras } from './PrizeBreakdownFields'

const GLOBAL = {
  prizes: [150, 100, 75, 65, 55, 45, 35, 30, 25, 20].map((a, i) => ({ place: `${i + 1}th`, prize: `€${a} cash`, amount: String(a), type: 'cash' })),
  awards: [{ id: 'mc', label: 'Most committed', prize: '€20 Tryp.com voucher', amount: 20, type: 'voucher' }],
  participation: { threshold: 6, prize: '€15 Tryp.com voucher', cap: 33, amount: 15, type: 'voucher', scope: 'outside_prizes' },
}

describe('prizeBudget', () => {
  it('counts vouchers as well as cash, and the taking-part reward as a range', () => {
    const b = prizeBudget(GLOBAL)
    expect(b.places).toEqual({ cash: 600, voucher: 0, count: 10 })
    expect(b.min).toEqual({ cash: 600, voucher: 20, total: 620 })
    expect(b.max).toEqual({ cash: 600, voucher: 20 + 33 * 15, total: 1115 })
    expect(b.part).toMatchObject({ each: 15, cap: 33, scope: 'outside_prizes', max: 495 })
  })
  it('has no top when the taking-part reward is uncapped', () => {
    const b = prizeBudget({ ...GLOBAL, participation: { ...GLOBAL.participation, cap: '' } })
    expect(b.max.voucher).toBeNull()
    expect(b.max.total).toBeNull()
    expect(b.min.total).toBe(620)
  })
  it('uncapped, the ceiling is every eligible creator in the market', () => {
    const b = prizeBudget({ ...GLOBAL, participation: { ...GLOBAL.participation, cap: '' }, creators: 110 })
    // outside the prize places: 110 creators minus the 10 who can win a place
    expect(b.part).toMatchObject({ cap: null, reach: 100, max: 1500 })
    expect(b.max.total).toBe(620 + 1500)
    const all = prizeBudget({ ...GLOBAL, participation: { ...GLOBAL.participation, cap: '', scope: 'everyone' }, creators: 110 })
    expect(all.part.max).toBe(110 * 15)
  })
  it('a cap wins over the roster', () => {
    expect(prizeBudget({ ...GLOBAL, creators: 110 }).part.max).toBe(495)
  })
  it('reads the value out of the words when none was typed', () => {
    const b = prizeBudget({ participation: { threshold: '3', prize: '€10 voucher', cap: '5' } })
    expect(b.part.each).toBe(10)
    expect(b.max.voucher).toBe(50)
  })
  it('ignores a taking-part reward with nothing to win', () => {
    expect(prizeBudget({ participation: { threshold: '3', prize: '' } }).part).toBeNull()
  })
})

describe('followAmount', () => {
  it('follows the words while the value came from them', () => {
    expect(followAmount('€150 cash', '20 cash', '150')).toBe('20')
    expect(followAmount('', '2', '')).toBe('2')
    expect(followAmount('2', '20 cash', '2')).toBe('20')
  })
  it('keeps a value somebody typed by hand', () => {
    expect(followAmount('€150 cash and a jacket', '€150 cash and a hoodie', '180')).toBe('180')
  })
  it('reads a thousands separator', () => {
    expect(numberIn('€1,500 cash')).toBe('1500')
  })
})

describe('participationExtras', () => {
  it('falls back to the number in the words for the value', () => {
    expect(participationExtras({ participation_threshold: 6, participation_prize: '€15 voucher', participation_cap: '33' }))
      .toMatchObject({ participation_cap: 33, participation_amount: 15, participation_reward_type: 'voucher' })
  })
})

// Migration 241: the taking-part reward can be earned on points.
describe('participation basis', () => {
  const base = { participation_threshold: 20, participation_prize: '€10 Tryp.com voucher' }
  it('saves points only on a points challenge', () => {
    expect(participationExtras({ ...base, scoring: 'points', participation_basis: 'points' }).participation_basis).toBe('points')
    expect(participationExtras({ ...base, scoring: 'total_views', participation_basis: 'points' }).participation_basis).toBe('entries')
  })
  it('defaults to videos, and resets with the prize', () => {
    expect(participationExtras({ ...base, scoring: 'points' }).participation_basis).toBe('entries')
    expect(participationExtras({ scoring: 'points', participation_basis: 'points' }).participation_basis).toBe('entries')
  })
  it('keeps the basis in the budget', () => {
    const b = prizeBudget({ participation: { threshold: 20, prize: '€10 Tryp.com voucher', basis: 'points', cap: 5 } })
    expect(b.part).toMatchObject({ basis: 'points', threshold: 20, each: 10, max: 50 })
  })
})
