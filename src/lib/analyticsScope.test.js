import { describe, it, expect } from 'vitest'
import { growthByMonth, membershipMap, monthLabel, perCreator, scopeToMarket } from './analyticsScope'

const MEMBERS = [
  { profile_id: 'a', community_id: 'uk' },
  { profile_id: 'b', community_id: 'uk' },
  { profile_id: 'c', community_id: 'es' },
  { profile_id: 'a', community_id: 'world' },
]

const RAW = {
  profiles: [
    { id: 'a', name: 'Ann', created_at: '2026-01-10', status: 'active' },
    { id: 'b', name: 'Ben', created_at: '2026-02-04', status: 'active' },
    { id: 'c', name: 'Cal', created_at: '2026-02-20', status: 'active' },
    { id: 'x', name: 'Test', created_at: '2026-02-20', is_test: true },
  ],
  challenges: [
    { id: 'c1', community_id: 'uk' },
    { id: 'c2', community_id: 'es' },
    { id: 'c3', community_id: null },
  ],
  submissions: [
    { id: 's1', creator_id: 'a', challenge_id: 'c1', logged_views: 10000 },
    { id: 's2', creator_id: 'a', challenge_id: 'c3', logged_views: 5000 },
    { id: 's3', creator_id: 'c', challenge_id: 'c2', logged_views: 2000 },
  ],
  rewards: [
    { creator_id: 'a', amount: 100, currency: 'EUR', reward_type: 'cash', status: 'distributed' },
    { creator_id: 'a', amount: 50, currency: 'EUR', reward_type: 'voucher', status: 'pending' },
    { creator_id: 'c', amount: 20, currency: 'EUR', reward_type: 'cash', status: 'distributed' },
  ],
  messages: [
    { id: 'm1', sender_id: 'a' }, { id: 'm2', sender_id: 'c' },
  ],
}

describe('membershipMap', () => {
  it('collects every market a person belongs to', () => {
    const m = membershipMap(MEMBERS)
    expect([...m.get('a')].sort()).toEqual(['uk', 'world'])
    expect(m.has('x')).toBe(false)
  })

  it('ignores half-written rows rather than throwing on them', () => {
    const m = membershipMap([{ profile_id: null, community_id: 'uk' }, { profile_id: 'a' }, null])
    expect(m.size).toBe(0)
  })
})

describe('scopeToMarket', () => {
  it('passes everything through for the whole programme', () => {
    expect(scopeToMarket(RAW, '', MEMBERS)).toBe(RAW)
  })

  it('keeps only the market’s people', () => {
    const uk = scopeToMarket(RAW, 'uk', MEMBERS)
    expect(uk.profiles.map((p) => p.id)).toEqual(['a', 'b'])
  })

  // THE DECISION WORTH PINNING. A UK creator's entry into a WORLDWIDE challenge
  // counts to the UK's numbers, because a market's work is its people's work
  // wherever they did it - but the worldwide challenge itself belongs to no
  // market. Get this backwards and every market's CPM is wrong.
  it('counts a member’s work wherever they did it', () => {
    const uk = scopeToMarket(RAW, 'uk', MEMBERS)
    expect(uk.submissions.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(uk.challenges.map((c) => c.id)).toEqual(['c1'])
  })

  it('scopes the money and the chat with the people', () => {
    const es = scopeToMarket(RAW, 'es', MEMBERS)
    expect(es.rewards).toHaveLength(1)
    expect(es.messages.map((m) => m.id)).toEqual(['m2'])
  })

  it('survives a null payload', () => {
    expect(scopeToMarket(null, 'uk', MEMBERS)).toBe(null)
  })
})

describe('perCreator', () => {
  const rows = perCreator(RAW, { currency: 'EUR' })

  it('leaves test and admin accounts out', () => {
    expect(rows.map((r) => r.id).sort()).toEqual(['a', 'b', 'c'])
    expect(rows.some((r) => r.id === 'x')).toBe(false)
  })

  // A creator who has posted nothing still gets a row. That is the whole point
  // of the table: "who delivers and who costs" has to include the people who do
  // neither, or the page only ever shows you the ones already working.
  it('keeps a creator who has done nothing', () => {
    const ben = rows.find((r) => r.id === 'b')
    expect(ben).toBeTruthy()
    expect(ben.videos).toBe(0)
    expect(ben.spend).toBe(0)
  })

  it('adds up the work', () => {
    const ann = rows.find((r) => r.id === 'a')
    expect(ann.videos).toBe(2)
    expect(ann.views).toBe(15000)
    expect(ann.challenges).toBe(2)
    expect(ann.messages).toBe(1)
  })

  // Cash alone, and cash-plus-vouchers. Never vouchers alone - nobody makes a
  // decision on that number.
  it('reports the two CPMs Ethan asked for', () => {
    const ann = rows.find((r) => r.id === 'a')
    expect(ann.cash).toBe(100)
    expect(ann.vouchers).toBe(50)
    expect(ann.cashCpm).toBeCloseTo((100 / 15000) * 1000, 6)
    expect(ann.combinedCpm).toBeCloseTo((150 / 15000) * 1000, 6)
  })

  it('counts money that has not gone out yet', () => {
    const ann = rows.find((r) => r.id === 'a')
    expect(ann.voucherPending).toBe(50)
    expect(ann.cashPending).toBe(0)
  })

  // A creator with no views has no cost per view. Zero would rank them as the
  // most efficient person in the programme, which is the opposite of true.
  it('gives no CPM at all to somebody with no views', () => {
    const only = perCreator({
      profiles: [{ id: 'z', name: 'Zed' }],
      rewards: [{ creator_id: 'z', amount: 40, currency: 'EUR', reward_type: 'cash' }],
    }, { currency: 'EUR' })
    expect(only[0].views).toBe(0)
    expect(only[0].cashCpm).toBe(null)
    expect(only[0].combinedCpm).toBe(null)
  })

  it('sorts by views, biggest first', () => {
    expect(rows[0].id).toBe('a')
  })
})

describe('growthByMonth', () => {
  it('buckets joins by month and runs a total', () => {
    const g = growthByMonth(RAW.profiles)
    expect(g).toEqual([
      { month: '2026-01', joined: 1, left: 0, net: 1, total: 1 },
      { month: '2026-02', joined: 2, left: 0, net: 2, total: 3 },
    ])
  })

  it('counts a departure in the month it happened', () => {
    const g = growthByMonth([
      { id: 'a', created_at: '2026-01-05' },
      { id: 'b', created_at: '2026-01-06', deletion_requested_at: '2026-03-02' },
    ])
    expect(g.map((m) => [m.month, m.joined, m.left, m.total]))
      .toEqual([['2026-01', 2, 0, 2], ['2026-03', 0, 1, 1]])
  })

  it('prefers the accepted date over the signup date', () => {
    const g = growthByMonth([{ id: 'a', created_at: '2026-01-05', accepted_at: '2026-04-05' }])
    expect(g[0].month).toBe('2026-04')
  })

  it('skips unparseable and missing dates instead of producing NaN months', () => {
    const g = growthByMonth([{ id: 'a' }, { id: 'b', created_at: 'nonsense' }])
    expect(g).toEqual([])
  })
})

describe('monthLabel', () => {
  it('shortens a bucket key for an axis', () => {
    expect(monthLabel('2026-08')).toBe('Aug 26')
    expect(monthLabel('2026-01')).toBe('Jan 26')
  })
})
