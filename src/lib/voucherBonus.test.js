import { describe, expect, it } from 'vitest'
import { bonusFor, DEFAULT_BONUS } from './voucherBonus'

describe('bonusFor', () => {
  it('gives +5 under 100 and +10 from 100', () => {
    expect([30, 40, 99.99].map((n) => bonusFor(DEFAULT_BONUS, n))).toEqual([5, 5, 5])
    expect([100, 250].map((n) => bonusFor(DEFAULT_BONUS, n))).toEqual([10, 10])
  })
  it('is zero when switched off or no tier matches', () => {
    expect(bonusFor({ ...DEFAULT_BONUS, enabled: false }, 30)).toBe(0)
    expect(bonusFor({ enabled: true, tiers: [{ from: 50, bonus: 7 }] }, 30)).toBe(0)
  })
  it('lets the team add a higher tier', () => {
    expect(bonusFor({ enabled: true, tiers: [...DEFAULT_BONUS.tiers, { from: 200, bonus: 20 }] }, 220)).toBe(20)
  })
})
