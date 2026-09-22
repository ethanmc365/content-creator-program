import { describe, it, expect } from 'vitest'
import { marketSplit, entriesOverTime, NO_MARKET } from './marketSplit'

const markets = [
  { id: 'uk', name: 'UK & Ireland', slug: 'uk', country_codes: ['GB', 'IE'] },
  { id: 'es', name: 'Spain', slug: 'spain', country_codes: ['ES'] },
  { id: 'pt', name: 'Portugal', slug: 'portugal', country_codes: ['PT'] },
]
const homeOf = new Map([['a', 'es'], ['b', 'es'], ['c', 'uk']])

describe('marketSplit', () => {
  const subs = [
    { creator_id: 'a', logged_views: 1000, submitted_at: '2026-09-21T10:00:00Z' },
    { creator_id: 'a', logged_views: 3000, submitted_at: '2026-09-22T10:00:00Z' },
    { creator_id: 'b', logged_views: null, submitted_at: '2026-09-22T11:00:00Z' },
    { creator_id: 'c', logged_views: 500, submitted_at: '2026-09-22T12:00:00Z' },
    { creator_id: 'z', logged_views: 10, submitted_at: '2026-09-22T12:00:00Z' },
  ]

  it('splits creators, entries and views by home market and adds back up', () => {
    const { rows, totals } = marketSplit({ subs, homeOf, markets })
    const es = rows.find((r) => r.id === 'es')
    expect(es).toMatchObject({ creators: 2, entries: 3, views: 4000, best: 3000, perEntry: 2000 })
    expect(rows.reduce((n, r) => n + r.entries, 0)).toBe(totals.entries)
    expect(rows.reduce((n, r) => n + r.creators, 0)).toBe(totals.creators)
    expect(rows.reduce((n, r) => n + r.views, 0)).toBe(totals.views)
  })

  it('keeps a creator with no home market instead of dropping them', () => {
    const { rows } = marketSplit({ subs, homeOf, markets })
    expect(rows.find((r) => r.id === NO_MARKET)).toMatchObject({ creators: 1, entries: 1 })
  })

  it('lists a market nobody entered from, at the bottom, with zeros', () => {
    const { rows, totals } = marketSplit({ subs, homeOf, markets })
    expect(rows[0].id).toBe('es')
    expect(rows.at(-1)).toMatchObject({ id: 'pt', entries: 0, creators: 0 })
    expect(totals.marketsTakingPart).toBe(2)
  })

  it('gives a rate only when the market size is known', () => {
    const { rows } = marketSplit({ subs, homeOf, markets, membersOf: new Map([['es', 8]]) })
    expect(rows.find((r) => r.id === 'es').rate).toBe(0.25)
    expect(rows.find((r) => r.id === 'uk').rate).toBeNull()
  })

  it('sums each market\'s points from the board', () => {
    const { rows } = marketSplit({ subs, homeOf, markets, pointsOf: new Map([['a', 6], ['b', 4], ['c', 1]]) })
    expect(rows.find((r) => r.id === 'es').points).toBe(10)
  })
})

describe('entriesOverTime', () => {
  it('builds a running total per market, one row per day', () => {
    const subs = [
      { creator_id: 'a', submitted_at: '2026-09-21T10:00:00' },
      { creator_id: 'c', submitted_at: '2026-09-22T10:00:00' },
      { creator_id: 'b', submitted_at: '2026-09-22T11:00:00' },
    ]
    const out = entriesOverTime({ subs, homeOf, marketIds: ['uk', 'es'], from: '2026-09-21T00:00:00', to: '2026-09-23T00:00:00' })
    expect(out).toEqual([
      { day: '2026-09-21', uk: 0, es: 1 },
      { day: '2026-09-22', uk: 1, es: 2 },
      { day: '2026-09-23', uk: 1, es: 2 },
    ])
  })
})
