import { describe, it, expect } from 'vitest'
import {
  groupByCreator, boardsFor, splitByGroup, totalsFor, compareBoards,
  prizeForGroup, dealEvenly, UNGROUPED,
} from './challengeGroups'

const GROUPS = [
  { id: 'g2', name: 'Group B', position: 1 },
  { id: 'g1', name: 'Group A', position: 0 },
]
const MEMBERS = [
  { creator_id: 'a', group_id: 'g1' },
  { creator_id: 'b', group_id: 'g1' },
  { creator_id: 'c', group_id: 'g2' },
]
const SUBS = [
  { id: 's1', creator_id: 'a', logged_views: 1000 },
  { id: 's2', creator_id: 'a', logged_views: 3000 },
  { id: 's3', creator_id: 'b', logged_views: 2000 },
  { id: 's4', creator_id: 'c', logged_views: 4000 },
]

describe('a challenge with no groups is unchanged', () => {
  it('has no boards at all', () => {
    expect(boardsFor([], new Map(), SUBS)).toEqual([])
  })
  it('puts every row in one bucket', () => {
    const split = splitByGroup(SUBS, new Map())
    expect(split.size).toBe(1)
    expect(split.get(null)).toHaveLength(4)
  })
  it('compares nothing and still totals everything', () => {
    const { combined, rows } = compareBoards([], [], SUBS)
    expect(rows).toEqual([])
    expect(combined.views).toBe(10000)
  })
})

describe('boards come back in position order', () => {
  it('sorts by position, not by the order they were fetched', () => {
    const boards = boardsFor(GROUPS, groupByCreator(MEMBERS), SUBS)
    expect(boards.map((b) => b.id)).toEqual(['g1', 'g2'])
  })

  it('adds the unassigned board only when somebody has entered without one', () => {
    const byCreator = groupByCreator(MEMBERS)
    expect(boardsFor(GROUPS, byCreator, SUBS).map((b) => b.id)).toEqual(['g1', 'g2'])
    const withOrphan = [...SUBS, { id: 's5', creator_id: 'z', logged_views: 10 }]
    const boards = boardsFor(GROUPS, byCreator, withOrphan)
    expect(boards[boards.length - 1]).toBe(UNGROUPED)
  })
})

describe('the combined figure is the sum of the boards', () => {
  const { combined, rows } = compareBoards(GROUPS, MEMBERS, SUBS)

  it('adds up, by construction', () => {
    expect(rows.reduce((n, r) => n + r.views, 0)).toBe(combined.views)
    expect(rows.reduce((n, r) => n + r.entries, 0)).toBe(combined.entries)
  })

  it('counts creators per board, not entries', () => {
    expect(rows.find((r) => r.id === 'g1').creators).toBe(2)
    expect(rows.find((r) => r.id === 'g1').entries).toBe(3)
  })

  it('gives each board its share of the views', () => {
    expect(rows.find((r) => r.id === 'g1').share).toBe(60)
    expect(rows.find((r) => r.id === 'g2').share).toBe(40)
  })

  it('reports 0% rather than NaN when nothing has any views yet', () => {
    const empty = compareBoards(GROUPS, MEMBERS, [
      { id: 'x', creator_id: 'a', logged_views: null },
    ])
    expect(empty.rows.every((r) => r.share === 0)).toBe(true)
  })
})

describe('totals', () => {
  it('takes the best single video as well as the sum', () => {
    const t = totalsFor(SUBS)
    expect(t.views).toBe(10000)
    expect(t.best).toBe(4000)
    expect(t.perEntry).toBe(2500)
  })
  it('treats a missing view count as zero, not as NaN', () => {
    expect(totalsFor([{ creator_id: 'a', logged_views: null }]).views).toBe(0)
  })
})

describe('a group prize falls through to the challenge', () => {
  const challenge = { prize_amount: 100, prize_currency: 'EUR', winners_count: 3, prize_structure: [{ place: 1 }] }

  it('uses the group when it states one', () => {
    expect(prizeForGroup({ id: 'g1', prize_amount: 50 }, challenge).prize_amount).toBe(50)
  })
  it('falls back for anything the group leaves blank', () => {
    const p = prizeForGroup({ id: 'g1', prize_amount: 50 }, challenge)
    expect(p.winners_count).toBe(3)
    expect(p.prize_structure).toEqual([{ place: 1 }])
  })
  it('is the challenge itself for the unassigned board', () => {
    expect(prizeForGroup(UNGROUPED, challenge)).toBe(challenge)
  })

  // THE SAME FALL-THROUGH THE PAYOUT DOES IN SQL. Migration 159 gave a board
  // its own reward for taking part; these assert that the app promises exactly
  // what `award_challenge_prizes_internal` pays, in both directions.
  it('takes the challenge participation reward when the group states neither half', () => {
    const p = prizeForGroup({ id: 'g1' }, { ...challenge, participation_threshold: 3, participation_prize: '£10 voucher' })
    expect(p.participation_threshold).toBe(3)
    expect(p.participation_prize).toBe('£10 voucher')
    expect(p.own).toBe(false)
  })
  it('takes the group participation reward when the group states both halves', () => {
    const p = prizeForGroup(
      { id: 'g1', participation_threshold: 2, participation_prize: '€25 voucher' },
      { ...challenge, participation_threshold: 3, participation_prize: '£10 voucher' },
    )
    expect(p.participation_threshold).toBe(2)
    expect(p.participation_prize).toBe('€25 voucher')
    expect(p.own).toBe(true)
  })
  it('ignores a half-stated group participation reward', () => {
    const withThresholdOnly = prizeForGroup(
      { id: 'g1', participation_threshold: 2 },
      { ...challenge, participation_threshold: 3, participation_prize: '£10 voucher' },
    )
    expect(withThresholdOnly.participation_threshold).toBe(3)
    const withPrizeOnly = prizeForGroup(
      { id: 'g1', participation_prize: '€25 voucher' },
      { ...challenge, participation_threshold: 3, participation_prize: '£10 voucher' },
    )
    expect(withPrizeOnly.participation_prize).toBe('£10 voucher')
  })
  it('reports own for a group with prize rows of its own', () => {
    expect(prizeForGroup({ id: 'g1', prize_structure: [{ place: '1st' }] }, challenge).own).toBe(true)
    expect(prizeForGroup({ id: 'g1', prize_structure: [] }, challenge).own).toBe(false)
  })
})

describe('the random split is even, not independent', () => {
  it('never leaves the groups more than one apart', () => {
    // A fixed sequence stands in for the shuffle; the point of the assertion is
    // the DEAL, which cannot be lopsided whatever the shuffle produces.
    for (const n of [1, 2, 3, 7, 20, 45]) {
      const ids = Array.from({ length: n }, (_, i) => `c${i}`)
      const map = dealEvenly(ids, ['g1', 'g2'], () => 0.5)
      const a = [...map.values()].filter((g) => g === 'g1').length
      const b = [...map.values()].filter((g) => g === 'g2').length
      expect(Math.abs(a - b)).toBeLessThanOrEqual(1)
      expect(a + b).toBe(n)
    }
  })

  it('deals across three groups just as evenly', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `c${i}`)
    const map = dealEvenly(ids, ['g1', 'g2', 'g3'], () => 0)
    const counts = ['g1', 'g2', 'g3'].map((g) => [...map.values()].filter((x) => x === g).length)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })

  it('gives everybody exactly one group', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const map = dealEvenly(ids, ['g1', 'g2'], () => 0.3)
    expect(map.size).toBe(5)
    expect(ids.every((id) => map.has(id))).toBe(true)
  })

  it('does nothing when there are no groups to deal into', () => {
    expect(dealEvenly(['a', 'b'], []).size).toBe(0)
  })
})
