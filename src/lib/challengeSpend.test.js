import { describe, expect, it } from 'vitest'
import { challengeSpend } from './challengeSpend'

describe('challengeSpend', () => {
  const ch = { prize_amount: '600.00', participation_amount: '10' }
  it('adds earned vouchers to the cash pot', () => {
    const s = challengeSpend(ch, [
      { slot: 'participation', status: 'earned', amount: 10 },
      { slot: 'participation', status: 'earned', amount: null },
      { slot: 'participation', status: 'contender', amount: 10 },
      { slot: 'award:most', status: 'earned', amount: 25 },
    ], 200000)
    expect(s).toMatchObject({ cash: 600, vouchers: 20, voucherCount: 2, awards: 25, pot: 625, spend: 645 })
    expect(s.cpm).toBeCloseTo(3.225)
  })
  it('has no CPM without views', () => {
    expect(challengeSpend(ch, [], 0).cpm).toBeNull()
  })
})
