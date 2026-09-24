import { describe, it, expect } from 'vitest'
import { buildChallengeRecap, topPercent } from './challengeRecap'

const challenge = { id: 'c', title: 'Global Challenge', scoring: 'points', start_date: '2026-09-21T00:00:00Z', end_date: '2026-10-18T22:59:00Z', prize_amount: 600, prize_currency: 'EUR' }
const subs = [
  { id: 's1', creator_id: 'me', logged_views: 1000, platform: 'TikTok', video_url: 'a' },
  { id: 's2', creator_id: 'me', logged_views: 5000, platform: 'Instagram', video_url: 'b' },
  { id: 's3', creator_id: 'me', logged_views: 200, platform: 'TikTok', video_url: 'c' },
  { id: 's4', creator_id: 'me', logged_views: 50, platform: 'TikTok', video_url: 'd' },
  { id: 's5', creator_id: 'x', logged_views: 9000, platform: 'TikTok', video_url: 'e' },
  { id: 's6', creator_id: 'test', logged_views: 99999, platform: 'TikTok', video_url: 'f' },
]
const me = { id: 'me', name: 'Ana Lopez' }

describe('challenge recap', () => {
  it('sums every entry for the views, never the board figure', () => {
    const r = buildChallengeRecap({ challenge, me, submissions: subs, results: [{ creator_id: 'me', rank: 2, final_views: 18 }], hidden: new Set(['test']) })
    expect(r.totals.views).toBe(6250)
    expect(r.totals.videos).toBe(4)
    expect(r.points).toBe(18)
    expect(r.community.views).toBe(15250)
    expect(r.community.creators).toBe(2)
  })

  it('shows the three best videos, best first', () => {
    const r = buildChallengeRecap({ challenge, me, submissions: subs })
    expect(r.top.map((t) => t.id)).toEqual(['s2', 's1', 's3'])
    expect(r.totals.platforms.sort()).toEqual(['Instagram', 'TikTok'])
  })

  it('says a podium place, a top-half place as a percentage, and nothing below that', () => {
    const field = Array.from({ length: 40 }, (_, i) => ({ creator_id: i === 0 ? 'me' : `p${i}`, rank: i + 1 }))
    const at = (rank) => field.map((r) => (r.creator_id === 'me' ? { ...r, rank } : r))
    expect(buildChallengeRecap({ challenge, me, submissions: subs, results: at(2) }).placing.kind).toBe('podium')
    const top = buildChallengeRecap({ challenge, me, submissions: subs, results: at(8) }).placing
    expect(top).toMatchObject({ kind: 'top', pct: 20 })
    expect(buildChallengeRecap({ challenge, me, submissions: subs, results: at(31) }).placing).toBeNull()
  })

  it('ranks within a split challenge\'s own board', () => {
    const results = [
      { creator_id: 'me', rank: 1, group_id: 'g1' }, { creator_id: 'a', rank: 2, group_id: 'g1' },
      { creator_id: 'b', rank: 1, group_id: 'g2' }, { creator_id: 'c', rank: 2, group_id: 'g2' }, { creator_id: 'd', rank: 3, group_id: 'g2' },
    ]
    expect(buildChallengeRecap({ challenge, me, submissions: subs, results }).field).toBe(2)
  })

  it('adds up what they won', () => {
    const r = buildChallengeRecap({ challenge, me, submissions: subs, rewards: [{ amount: 100, currency: 'EUR', reward_type: 'cash' }, { amount: 10, reward_type: 'voucher' }] })
    expect(r.wonTotal).toBe(110)
    expect(r.won[1].kind).toBe('voucher')
  })

  it('never says 0%', () => {
    expect(topPercent(1, 500)).toBe(1)
    expect(topPercent(null, 10)).toBeNull()
  })
})
