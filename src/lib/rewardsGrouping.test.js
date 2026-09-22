import { describe, expect, it } from 'vitest'
import { groupRewards } from './rewardsGrouping'

const reward = (over) => ({
  id: Math.random().toString(36).slice(2),
  creator_id: 'c1',
  challenge_id: null,
  source: 'challenge',
  reward_type: 'cash',
  amount: 10,
  currency: 'EUR',
  status: 'pending',
  ...over,
})

describe('groupRewards', () => {
  it('groups rewards by challenge_id', () => {
    const rows = [
      reward({ id: 'a', challenge_id: 'ch1' }),
      reward({ id: 'b', challenge_id: 'ch1' }),
      reward({ id: 'c', challenge_id: 'ch2' }),
    ]
    const groups = groupRewards(rows, {
      ch1: { title: 'Challenge One', status: 'archived', end_date: '2026-01-01' },
      ch2: { title: 'Challenge Two', status: 'archived', end_date: '2026-02-01' },
    })
    expect(groups).toHaveLength(2)
    expect(groups.find((g) => g.id === 'ch1').rows).toHaveLength(2)
    expect(groups.find((g) => g.id === 'ch2').rows).toHaveLength(1)
  })

  it('excludes referral rewards entirely', () => {
    const rows = [
      reward({ id: 'a', challenge_id: 'ch1' }),
      reward({ id: 'b', challenge_id: null, source: 'referral' }),
    ]
    const groups = groupRewards(rows, { ch1: { title: 'Challenge One', status: 'active' } })
    const allRows = groups.flatMap((g) => g.rows)
    expect(allRows.some((r) => r.source === 'referral')).toBe(false)
    expect(allRows).toHaveLength(1)
  })

  it('buckets milestone rewards with no challenge into their own group', () => {
    const rows = [reward({ id: 'a', challenge_id: null, source: 'milestone' })]
    const groups = groupRewards(rows, {})
    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('milestone')
    expect(groups[0].title).toBe('Milestone rewards')
  })

  it('buckets manual/legacy rewards with no challenge into "Other rewards"', () => {
    const rows = [reward({ id: 'a', challenge_id: null, source: 'manual' })]
    const groups = groupRewards(rows, {})
    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('other')
  })

  it('orders a running challenge before ended ones', () => {
    const rows = [
      reward({ id: 'a', challenge_id: 'ended' }),
      reward({ id: 'b', challenge_id: 'live' }),
    ]
    const groups = groupRewards(rows, {
      ended: { title: 'Ended', status: 'archived', end_date: '2020-01-01' },
      live: { title: 'Live', status: 'active', end_date: '2099-01-01' },
    })
    expect(groups.map((g) => g.id)).toEqual(['live', 'ended'])
  })

  it('orders ended challenges by most recently ended first', () => {
    const rows = [
      reward({ id: 'a', challenge_id: 'old' }),
      reward({ id: 'b', challenge_id: 'recent' }),
    ]
    const groups = groupRewards(rows, {
      old: { title: 'Old', status: 'archived', end_date: '2020-01-01' },
      recent: { title: 'Recent', status: 'archived', end_date: '2026-01-01' },
    })
    expect(groups.map((g) => g.id)).toEqual(['recent', 'old'])
  })

  it('returns an empty array for no rewards', () => {
    expect(groupRewards([], {})).toEqual([])
  })
})
