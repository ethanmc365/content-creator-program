import { describe, it, expect } from 'vitest'
import { challengeEconomics, blendEconomics, cpmBand, convert, groupBy, rewardsTotal } from './programme'

// A challenge row shaped like admin_challenge_metrics() returns.
const row = (over = {}) => ({
  id: 'c1', title: 'Test', status: 'archived',
  prize_amount: 100, prize_currency: 'GBP', winners_count: 2, cpm_target: 0.5,
  total_views: 200_000, posts: 10, creators: 5, median_views: 15_000, best_views: 60_000,
  ...over,
})

describe('cpmBand', () => {
  it('bands against the challenge target, not a fixed number', () => {
    expect(cpmBand(0.4, { target: 0.5 })).toBe('on_target')
    expect(cpmBand(0.5, { target: 0.5 })).toBe('on_target')
    expect(cpmBand(0.8, { target: 0.5 })).toBe('watch')
    expect(cpmBand(1.0, { target: 0.5 })).toBe('watch')
    expect(cpmBand(1.2, { target: 0.5 })).toBe('over_target')
    // A looser target moves every band with it.
    expect(cpmBand(1.2, { target: 1.5 })).toBe('on_target')
  })

  it('separates "no result yet" from "a bad result"', () => {
    expect(cpmBand(null, { hasViews: false, ended: false })).toBe('awaiting')
    expect(cpmBand(null, { hasViews: false, ended: true })).toBe('no_views')
  })
})

describe('challengeEconomics', () => {
  it('computes the spreadsheet metrics', () => {
    const e = challengeEconomics(row())
    expect(e.cpm).toBeCloseTo(0.5)          // £100 / 200k views
    expect(e.costPerPost).toBeCloseTo(10)   // £100 / 10 posts
    expect(e.costPerCreator).toBeCloseTo(20)
    expect(e.perWinner).toBeCloseTo(50)
    expect(e.postsPerCreator).toBeCloseTo(2)
    expect(e.viewsPerPost).toBeCloseTo(20_000)
    expect(e.viewsPerCreator).toBeCloseTo(40_000)
    expect(e.band).toBe('on_target')
  })

  it('leaves ratios null when the denominator is missing', () => {
    // The important one: an unscored challenge must not read as a £0.00 CPM,
    // which would rank it as the best performer on the board.
    const e = challengeEconomics(row({ total_views: 0, posts: 0, creators: 0 }))
    expect(e.cpm).toBeNull()
    expect(e.costPerPost).toBeNull()
    expect(e.viewsPerPost).toBeNull()
    expect(e.band).toBe('no_views')
  })

  it('converts into the reporting currency', () => {
    const e = challengeEconomics(row(), { currency: 'EUR', rates: { GBP: 1, EUR: 1.2 } })
    expect(e.spend).toBeCloseTo(120)
    expect(e.cpm).toBeCloseTo(0.6)
  })

  it('reports how concentrated the reach was', () => {
    const e = challengeEconomics(row())
    expect(e.topVideoShare).toBeCloseTo(0.3) // 60k of 200k came from one video
  })
})

describe('blendEconomics', () => {
  it('blends on totals rather than averaging averages', () => {
    // A small cheap challenge and a large expensive one. The mean of the two
    // CPMs is 1.25; the blended figure is what the money actually bought.
    const rows = [
      challengeEconomics(row({ id: 'a', prize_amount: 10, total_views: 5_000, posts: 1, creators: 1 })),
      challengeEconomics(row({ id: 'b', prize_amount: 500, total_views: 1_000_000, posts: 20, creators: 10 })),
    ]
    const b = blendEconomics(rows)
    expect(rows[0].cpm).toBeCloseTo(2)
    expect(rows[1].cpm).toBeCloseTo(0.5)
    expect(b.cpm).toBeCloseTo(510 / 1005) // ~0.507, not 1.25
    expect(b.spend).toBe(510)
    expect(b.posts).toBe(21)
  })

  it('measures on-target share against scored challenges only', () => {
    const rows = [
      challengeEconomics(row({ id: 'a' })),                                        // on target
      challengeEconomics(row({ id: 'b', total_views: 0, status: 'active' })),      // awaiting
    ]
    const b = blendEconomics(rows)
    expect(b.scored).toBe(1)
    expect(b.onTargetPct).toBe(100) // not 50: the live one has no result yet
  })

  it('survives a set with nothing scored', () => {
    const b = blendEconomics([challengeEconomics(row({ total_views: 0, posts: 0, creators: 0 }))])
    expect(b.cpm).toBeNull()
    expect(b.onTargetPct).toBeNull()
  })
})

describe('convert', () => {
  it('round-trips through the base currency', () => {
    const rates = { GBP: 1, EUR: 1.2 }
    expect(convert(100, 'GBP', 'EUR', rates)).toBeCloseTo(120)
    expect(convert(120, 'EUR', 'GBP', rates)).toBeCloseTo(100)
    expect(convert(null, 'GBP', 'EUR', rates)).toBeNull()
  })
})

describe('groupBy', () => {
  it('groups and blends, heaviest spend first', () => {
    const rows = [
      challengeEconomics(row({ id: 'a', market: 'UK', prize_amount: 50 })),
      challengeEconomics(row({ id: 'b', market: 'ES', prize_amount: 500 })),
      challengeEconomics(row({ id: 'c', market: 'UK', prize_amount: 60 })),
    ]
    const groups = groupBy(rows, (r) => r.market)
    expect(groups[0].key).toBe('ES')
    expect(groups[1].key).toBe('UK')
    expect(groups[1].rows).toHaveLength(2)
    expect(groups[1].blended.spend).toBe(110)
  })

  it('buckets missing values rather than dropping them', () => {
    const groups = groupBy([challengeEconomics(row({ market: null }))], (r) => r.market)
    expect(groups[0].key).toBe('Unspecified')
  })
})


// CASH AND VOUCHERS ARE NOT THE SAME MONEY.
//
// A Tryp.com voucher is redeemed against a booking we make margin on, so it does
// not cost what its face value says. Summing it with cash inflates spend by
// about a third on a real challenge, and every CPM derived from that total is
// then wrong in the same direction - which is the kind of error that looks like
// a business problem rather than a bug.
describe('what a challenge actually cost', () => {
  const row = {
    total_views: 100000, posts: 20, creators: 10, status: 'ended',
    prize_amount: 190, prize_currency: 'GBP', reward_currency: 'GBP',
    cash_paid: 105, cash_pending: 85, voucher_paid: 40, voucher_pending: 20,
    cpm_target: 0.5, winners_count: 3,
  }

  it('counts awarded money, pending included, not the number in the brief', () => {
    const e = challengeEconomics(row, { currency: 'GBP' })
    expect(e.cashSpend).toBe(190)      // 105 paid + 85 still to pay
    expect(e.voucherSpend).toBe(60)    // 40 + 20
    expect(e.awarded).toBe(250)
    expect(e.isPlanned).toBe(false)
  })

  // Two CPMs: cash on its own, and cash plus vouchers. Not a voucher-only one.
  it('reports cash alone and cash-plus-vouchers', () => {
    const e = challengeEconomics(row, { currency: 'GBP' })
    expect(e.cashCpm).toBeCloseTo(1.9, 5)       // 190 / 100 thousand
    expect(e.combinedCpm).toBeCloseTo(2.5, 5)   // (190 + 60) / 100 thousand
    expect(e.voucherCpm).toBeUndefined()
    // `spend` - the headline - is the CASH figure, so the headline CPM is too.
    expect(e.spend).toBe(190)
    expect(e.cpm).toBeCloseTo(1.9, 5)
  })

  it('falls back to the brief only while nothing has been awarded', () => {
    const e = challengeEconomics(
      { ...row, cash_paid: 0, cash_pending: 0, voucher_paid: 0, voucher_pending: 0 },
      { currency: 'GBP' },
    )
    expect(e.spend).toBe(190)
    expect(e.isPlanned).toBe(true)
    expect(e.cashCpm).toBeNull()
    expect(e.combinedCpm).toBeNull()
  })

  it('converts awarded money into the reporting currency', () => {
    const e = challengeEconomics(row, { currency: 'EUR', rates: { GBP: 1, EUR: 2 } })
    expect(e.cashSpend).toBe(380)
    expect(e.voucherSpend).toBe(120)
  })

  it('gives no CPM at all when there are no views to divide by', () => {
    const e = challengeEconomics({ ...row, total_views: 0 }, { currency: 'GBP' })
    expect(e.cashCpm).toBeNull()
    expect(e.combinedCpm).toBeNull()
  })

  it('blends by summing first and dividing once', () => {
    const a = challengeEconomics(row, { currency: 'GBP' })
    const b = challengeEconomics({ ...row, total_views: 300000 }, { currency: 'GBP' })
    const blended = blendEconomics([a, b], { currency: 'GBP' })
    expect(blended.cashSpend).toBe(380)
    expect(blended.voucherSpend).toBe(120)
    // 380 / 400 thousand, NOT the mean of 1.9 and 0.633
    expect(blended.cashCpm).toBeCloseTo(0.95, 5)
    // and the combined one sums both pots before dividing, the same way
    expect(blended.combinedCpm).toBeCloseTo(1.25, 5)
  })
})

describe('rewardsTotal', () => {
  // Always euros, always whole. The rows under the total still show what was
  // actually paid; this figure is the one-number answer.
  it('converts a pounds-only set into whole euros', () => {
    const t = rewardsTotal([{ amount: 100, currency: 'GBP' }, { amount: 150, currency: 'GBP' }])
    // 250 GBP at the 1.17 fallback rate is 292.50, reported as 293.
    expect(t).toEqual({ amount: 293, currency: 'EUR', converted: true })
  })

  it('leaves euros alone and does not flag them as converted', () => {
    const t = rewardsTotal([{ amount: 40, currency: 'EUR' }, { amount: 5, currency: 'EUR' }])
    expect(t).toEqual({ amount: 45, currency: 'EUR', converted: false })
  })

  // The bug this exists to stop: pounds added to euros and printed as pounds.
  it('never simply adds across currencies', () => {
    const t = rewardsTotal([{ amount: 50, currency: 'GBP' }, { amount: 40, currency: 'EUR' }])
    expect(t.currency).toBe('EUR')
    expect(t.converted).toBe(true)
    // 50 GBP -> 58.50 EUR, plus 40 already in euros, rounded.
    expect(t.amount).toBe(99)
    expect(t.amount).not.toBe(90)
  })

  it('never reports cents', () => {
    for (const rows of [
      [{ amount: 33.33, currency: 'EUR' }],
      [{ amount: 10.5, currency: 'GBP' }],
      [{ amount: 1, currency: 'GBP' }, { amount: 0.4, currency: 'EUR' }],
    ]) {
      expect(Number.isInteger(rewardsTotal(rows).amount)).toBe(true)
    }
  })

  it('treats a missing currency as the reporting currency rather than guessing', () => {
    const t = rewardsTotal([{ amount: 10 }, { amount: 5 }], 'EUR')
    expect(t).toEqual({ amount: 15, currency: 'EUR', converted: false })
  })

  it('is zero, not NaN, for no rows or unusable amounts', () => {
    expect(rewardsTotal([])).toEqual({ amount: 0, currency: 'EUR', converted: false })
    expect(rewardsTotal(null)).toEqual({ amount: 0, currency: 'EUR', converted: false })
    expect(rewardsTotal([{ amount: null, currency: 'EUR' }, { amount: 'x', currency: 'EUR' }]).amount).toBe(0)
  })
})
