import { openingMonth } from '../pages/admin/analytics/MarketLeague'
import { describe, it, expect } from 'vitest'
import { marketStandings, monthsInRecord, monthKey, monthLabel, previousRanks } from './marketStandings'

const SPAIN = 'm-es', UK = 'm-uk', QUIET = 'm-nordics', GONE = 'm-old'

const raw = {
  marketRows: [
    { id: SPAIN, slug: 'spain', name: 'Spain', kind: 'chapter', country_codes: ['ES'], retired_at: null },
    { id: UK, slug: 'uk', name: 'UK & Ireland', kind: 'chapter', country_codes: ['GB', 'IE'], retired_at: null },
    { id: QUIET, slug: 'nordics', name: 'Nordics', kind: 'chapter', country_codes: ['SE'], retired_at: null },
    { id: GONE, slug: 'old', name: 'Retired', kind: 'chapter', country_codes: ['FR'], retired_at: '2026-02-01' },
    { id: 'ww', slug: 'worldwide', name: 'Worldwide', kind: 'network', country_codes: [], retired_at: null },
  ],
  profiles: [
    { id: 'p1', status: 'active' }, { id: 'p2', status: 'active' },
    { id: 'p3', status: 'active' }, { id: 'pt', status: 'active', is_test: true },
    { id: 'pp', status: 'pending' },
  ],
  memberRows: [
    { community_id: SPAIN, profile_id: 'p1' }, { community_id: SPAIN, profile_id: 'p2' },
    // is_test and pending people are not creators in anybody's count
    { community_id: SPAIN, profile_id: 'pt' }, { community_id: SPAIN, profile_id: 'pp' },
    // and the same person listed twice is still one person
    { community_id: SPAIN, profile_id: 'p1' },
    { community_id: UK, profile_id: 'p3' },
  ],
  history: [
    { community_id: SPAIN, starts_at: '2026-03-04', title: 'A', total_views: 1_000_000, posts: 100, creators: 20, prize_total: 500, prize_currency: 'EUR' },
    { community_id: SPAIN, starts_at: '2026-04-02', title: 'B', total_views: 400_000, posts: 40, creators: 10, prize_total: 200, prize_currency: 'EUR' },
    // NEVER MEASURED. Its prize money must not land in a CPM's numerator.
    { community_id: SPAIN, starts_at: '2026-04-20', title: 'C', total_views: null, posts: 12, creators: 4, prize_total: 300, prize_currency: 'EUR' },
    { community_id: UK, starts_at: '2026-03-18', title: 'D', total_views: 50_000, posts: 9, creators: 6, prize_total: 100, prize_currency: 'GBP' },
    // a worldwide challenge belongs to no market
    { community_id: 'ww', starts_at: '2026-03-20', title: 'E', total_views: 9_000_000, posts: 900, creators: 90, prize_total: 4000, prize_currency: 'EUR' },
  ],
  challenges: [
    { id: 'c1', community_id: UK, status: 'archived', start_date: '2026-04-10T00:00:00Z', title: 'Live UK', prize_amount: 190, prize_currency: 'GBP' },
    // a draft has not happened
    { id: 'c2', community_id: SPAIN, status: 'draft', start_date: '2026-05-01T00:00:00Z', title: 'Draft', prize_amount: 999, prize_currency: 'EUR' },
  ],
  submissions: [
    { challenge_id: 'c1', creator_id: 'p3', logged_views: 30_000 },
    { challenge_id: 'c1', creator_id: 'p3', logged_views: 20_000 },
  ],
  results: [],
  rewards: [{ challenge_id: 'c1', community_id: UK, amount: 190, currency: 'GBP', created_at: '2026-04-30' }],
}

const bySlug = (rows, slug) => rows.find((r) => r.slug === slug)

describe('market standings', () => {
  it('reads a month off any date shape', () => {
    expect(monthKey('2026-03-04')).toBe('2026-03')
    expect(monthKey('2026-12-31T23:30:00Z')).toBe('2026-12')
    expect(monthKey(null)).toBeNull()
    expect(monthKey('nonsense')).toBeNull()
    expect(monthLabel('2026-08')).toBe('August 2026')
  })

  it('lists every month from the first through this one, newest first', () => {
    expect(monthsInRecord(raw, new Date('2026-04-15T00:00:00Z'))).toEqual(['2026-04', '2026-03'])
    // A month with nothing in it yet still appears once it is here.
    expect(monthsInRecord(raw, new Date('2026-06-02T00:00:00Z'))).toEqual(['2026-06', '2026-05', '2026-04', '2026-03'])
  })

  it('counts a challenge in every month it ran in', () => {
    const spanning = {
      ...raw,
      history: [{ community_id: SPAIN, starts_at: '2026-07-15', ends_at: '2026-08-15', title: 'Summer', total_views: 10_000, posts: 5, creators: 2, prize_total: 50, prize_currency: 'EUR' }],
      challenges: [], submissions: [], rewards: [],
    }
    expect(bySlug(marketStandings(spanning, { month: '2026-07' }), 'spain').challenges).toBe(1)
    expect(bySlug(marketStandings(spanning, { month: '2026-08' }), 'spain').challenges).toBe(1)
    expect(bySlug(marketStandings(spanning, {}), 'spain').challenges).toBe(1)
  })

  it('counts a worldwide platform challenge for each entrant\'s market', () => {
    const global = {
      ...raw,
      history: [],
      challenges: [{ id: 'g', community_id: 'ww', status: 'active', scoring: 'points', start_date: '2026-09-21T00:00:00Z', end_date: '2026-10-18T22:59:00Z', title: 'Global', prize_amount: 600, prize_currency: 'EUR' }],
      submissions: [
        { challenge_id: 'g', creator_id: 'p1', logged_views: 1000 },
        { challenge_id: 'g', creator_id: 'p3', logged_views: 500 },
      ],
      // A points board's results hold the SCORE, not views.
      results: [{ challenge_id: 'g', final_views: 7 }],
      rewards: [],
    }
    const sept = marketStandings(global, { month: '2026-09' })
    expect(bySlug(sept, 'spain').views).toBe(1000)
    expect(bySlug(sept, 'uk').views).toBe(500)
    expect(bySlug(sept, 'spain').spend).toBe(300)
    expect(bySlug(marketStandings(global, { month: '2026-10' }), 'uk').challenges).toBe(1)
  })

  it('ranks by views, all time', () => {
    const rows = marketStandings(raw, { currency: 'EUR' })
    expect(rows.map((r) => r.slug)).toEqual(['spain', 'uk', 'nordics'])
    expect(bySlug(rows, 'spain').views).toBe(1_400_000)
    // 50k from the historical March contest plus 50k from the live April one
    expect(bySlug(rows, 'uk').views).toBe(100_000)
  })

  it('leaves a retired market and the worldwide network out of the league', () => {
    const rows = marketStandings(raw, { currency: 'EUR' })
    expect(rows.some((r) => r.slug === 'old')).toBe(false)
    expect(rows.some((r) => r.slug === 'worldwide')).toBe(false)
    // and the worldwide challenge's nine million views are in nobody's total
    expect(rows.reduce((n, r) => n + r.views, 0)).toBe(1_500_000)
  })

  it('counts a market\'s creators once each, and only the real ones', () => {
    const rows = marketStandings(raw, { currency: 'EUR' })
    expect(bySlug(rows, 'spain').members).toBe(2)   // p1 (listed twice), p2
    expect(bySlug(rows, 'uk').members).toBe(1)
    expect(bySlug(rows, 'nordics').members).toBe(0)
  })

  it('keeps an unmeasured challenge out of the cost per thousand', () => {
    // THE BUG THIS GUARDS. Spain ran three historical challenges worth EUR 1,000
    // and only two of them were ever measured. Counting the third's EUR 300 over
    // 1.4M views gives EUR 0.71; the honest figure over the challenges we can
    // actually see is EUR 0.50, and the row says it covers three of three
    // contests... which is why `measured` is on the row and drawn on the page.
    const spain = bySlug(marketStandings(raw, { currency: 'EUR' }), 'spain')
    expect(spain.challenges).toBe(3)
    expect(spain.measured).toBe(2)
    expect(spain.spend).toBe(1000)
    expect(spain.spendKnown).toBe(700)
    expect(spain.cpm).toBeCloseTo(0.5, 5)
  })

  it('converts every market into one currency before comparing them', () => {
    const inEur = bySlug(marketStandings(raw, { currency: 'EUR' }), 'uk')
    const inGbp = bySlug(marketStandings(raw, { currency: 'GBP' }), 'uk')
    // The UK's prizes are in pounds, so the euro figure has to be the larger of
    // the two - a league that just relabelled the symbol would make them equal.
    expect(inEur.spend).toBeGreaterThan(inGbp.spend)
    expect(inGbp.spend).toBeCloseTo(290, 0) // 100 + 190, already sterling
  })

  it('ignores a draft challenge entirely', () => {
    const spain = bySlug(marketStandings(raw, { currency: 'EUR' }), 'spain')
    // the draft is worth EUR 999 and has not happened
    expect(spain.spend).toBe(1000)
  })

  it('scopes to one month', () => {
    const march = marketStandings(raw, { currency: 'EUR', month: '2026-03' })
    expect(bySlug(march, 'spain').views).toBe(1_000_000)
    expect(bySlug(march, 'spain').challenges).toBe(1)
    expect(bySlug(march, 'uk').views).toBe(50_000)
    const april = marketStandings(raw, { currency: 'EUR', month: '2026-04' })
    expect(bySlug(april, 'spain').views).toBe(400_000)
    expect(bySlug(april, 'uk').views).toBe(50_000)   // the live challenge alone
    expect(bySlug(april, 'nordics').challenges).toBe(0)
  })

  it('remembers where each market placed the month before', () => {
    const before = previousRanks(raw, '2026-04', { currency: 'EUR' })
    // March: Spain 1M, UK 50k
    expect(before.get(SPAIN)).toBe(1)
    expect(before.get(UK)).toBe(2)
    expect(before.get(QUIET)).toBeUndefined()
    // and there is nothing before the earliest month
    expect(previousRanks(raw, '2026-03', { currency: 'EUR' }).size).toBe(0)
    expect(previousRanks(raw, '', { currency: 'EUR' }).size).toBe(0)
  })

  it('keeps a per-month breakdown for the sparklines', () => {
    const spain = bySlug(marketStandings(raw, { currency: 'EUR' }), 'spain')
    expect(spain.byMonth['2026-03'].views).toBe(1_000_000)
    expect(spain.byMonth['2026-04'].views).toBe(400_000)
    expect(spain.byMonth['2026-04'].challenges).toBe(2)
  })

  it('survives an empty programme', () => {
    expect(marketStandings(null)).toEqual([])
    expect(marketStandings({}, {})).toEqual([])
    expect(monthsInRecord({})).toEqual([])
  })
})

describe('openingMonth', () => {
  it('opens on all time', () => {
    expect(openingMonth(null)).toBe('')
    expect(openingMonth(undefined)).toBe('')
  })
  it('an explicit month choice sticks', () => {
    expect(openingMonth('2026-07')).toBe('2026-07')
    expect(openingMonth('')).toBe('')
  })
})
