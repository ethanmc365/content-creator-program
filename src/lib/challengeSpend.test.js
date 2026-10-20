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
  it('counts Video of the Week and voucher-day rewards already created, not cancelled ones or place prizes twice', () => {
    const s = challengeSpend(ch, [{ slot: 'participation', status: 'earned', amount: 10 }], 100000, [
      { prize_slot: 'weekly', amount: '10', status: 'pending' },
      { prize_slot: 'weekly', amount: '10', status: 'distributed' },
      { prize_slot: 'voucher_day', amount: '5', status: 'pending' },
      { prize_slot: 'weekly', amount: '10', status: 'cancelled' },
      { prize_slot: 'place', amount: '300', status: 'pending' },
    ])
    expect(s).toMatchObject({ weekly: 20, voucherDays: 5, extras: 25, spend: 635 })
    expect(s.cpm).toBeCloseTo(6.35)
  })
  it('has no CPM without views', () => {
    expect(challengeSpend(ch, [], 0).cpm).toBeNull()
  })
})
