import { describe, expect, it } from 'vitest'
import { BRIEF_METRICS, PERK_KINDS, PERK_METRICS, monthIndex, safeAccent, unitLabel, vipJoinLink } from './vip'
import { buildVipCards } from '../components/wrapped/vipStory'

// THE THIRD VIP PASS (30 Sep 2026, migration 299): the helpers the new screens share, and the recap's cards.

const tr = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`))

describe('vip v3 helpers', () => {
  it('only lets a plain #rrggbb colour into a style', () => {
    expect(safeAccent('#0d6b57')).toBe('#0d6b57')
    expect(safeAccent('red; background:url(x)')).toBe('#d94407')
    expect(safeAccent(null)).toBe('#d94407')
    expect(safeAccent('#abc', '#111111')).toBe('#111111')
  })

  it('says a threshold in the right unit', () => {
    expect(unitLabel('lifetime_views', 1000000, tr)).toMatch(/views/)
    expect(unitLabel('lifetime_videos', 6, tr)).toBe('6 videos')
    expect(unitLabel('months_active', 3, tr)).toBe('3 months')
    expect(unitLabel('streak_months', 3, tr)).toBe('3 months')
    expect(unitLabel('videos', 6, tr, BRIEF_METRICS)).toBe('6 videos')
  })

  it('has a manual perk kind with no unit and unique keys everywhere', () => {
    expect(PERK_METRICS.find((m) => m.key === 'manual').unit).toBe('')
    for (const list of [PERK_METRICS, PERK_KINDS, BRIEF_METRICS]) expect(new Set(list.map((x) => x.key)).size).toBe(list.length)
  })

  it('numbers months so two can be compared without dates', () => {
    expect(monthIndex(2026, 10)).toBeGreaterThan(monthIndex(2026, 9))
    expect(monthIndex(2027, 1)).toBe(monthIndex(2026, 12) + 1)
  })

  it('builds the sign-up link from a token, and nothing from no token', () => {
    expect(vipJoinLink('abc123')).toMatch(/\/vip\/join\/abc123$/)
    expect(vipJoinLink('')).toBe('')
  })
})

describe('the VIP month recap', () => {
  const base = {
    programme: 'VIP Spain', currency: 'EUR', accent: null, headline: null,
    month: { id: 'm', year: 2026, month: 8, status: 'closed' },
    views: 120000, videos: 5, base: 30, total: 45, statement_status: 'approved', bonuses: [{ label: 'Top of the month', reward: 'cash' }],
    rank: 2, of: 8, global_rank: 4, global_of: 20,
    best: { id: 'v', platform: 'TikTok', url: 'https://x', thumb: null, caption: 'Madrid in a day', views: 50000 },
    platforms: [{ platform: 'TikTok', views: 80000, videos: 3 }, { platform: 'Instagram', views: 40000, videos: 2 }],
    next: { title: '1 million views: your trip', kind: 'trip', value: 120000, threshold: 1000000 },
    streak_months: 3, lifetime_views: 120000, lifetime_videos: 5, months_active: 2,
  }
  const keys = (recap) => buildVipCards({ me: { name: 'Lucía Demo' }, recap }, tr).map((c) => c.key)

  it('tells the whole story when there is one', () => {
    expect(keys(base)).toEqual(['open', 'views', 'earned', 'rank', 'best', 'platforms', 'next'])
  })

  it('drops every card that has nothing true to say', () => {
    const quiet = { ...base, views: 0, videos: 0, total: 0, bonuses: [], rank: null, best: null, platforms: [] }
    expect(keys(quiet)).toEqual(['open', 'next'])
  })

  it('does not rank a creator who is alone in their market, and skips a single platform', () => {
    const k = keys({ ...base, rank: 1, of: 1, platforms: [{ platform: 'TikTok', views: 120000, videos: 5 }] })
    expect(k).not.toContain('rank')
    expect(k).not.toContain('platforms')
  })

  it('every card renders without throwing', () => {
    for (const c of buildVipCards({ me: { name: 'Lucía Demo' }, recap: base }, tr)) expect(() => c.render()).not.toThrow()
  })
})
