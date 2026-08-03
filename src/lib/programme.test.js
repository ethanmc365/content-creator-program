import { describe, it, expect } from 'vitest'
import { challengeEconomics, blendEconomics, cpmBand, convert, groupBy } from './programme'

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
