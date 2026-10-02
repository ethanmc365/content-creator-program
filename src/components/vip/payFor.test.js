import { describe, expect, it } from 'vitest'
import { payFor } from './adminA'

// The settings sheet's live "what this deal pays" line must agree with the database's vip_views_pay.
describe('payFor', () => {
  it('pays a flat rate when the creator has their own and no steps', () => {
    expect(payFor(100000, 0.25, [], 0.4)).toBe(40)
  })
  it('pays the base rate with no steps', () => {
    expect(payFor(100000, 0.25, [], null)).toBe(25)
  })
  it('pays each step on the views above it', () => {
    // 500k at 0.25 + 500k at 0.35
    expect(payFor(1000000, 0.25, [{ from_views: 500000, cpm: 0.35 }], null)).toBe(300)
  })
  it('pays nothing for no views', () => {
    expect(payFor(0, 0.25, [], null)).toBe(0)
  })
})
