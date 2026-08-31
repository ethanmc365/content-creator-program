import { describe, it, expect } from 'vitest'
import { recentAnnouncements, ANNOUNCEMENT_MAX_AGE_DAYS } from './announcements'

const NOW = Date.parse('2026-08-31T12:00:00Z')
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString()

const row = (over) => ({ id: 'x', community_id: null, deleted: false, created_at: daysAgo(1), ...over })

describe('recentAnnouncements', () => {
  it('keeps the newest one per community', () => {
    const out = recentAnnouncements([
      row({ id: 'uk-old', community_id: 'uk', created_at: daysAgo(5) }),
      row({ id: 'uk-new', community_id: 'uk', created_at: daysAgo(2) }),
      row({ id: 'es', community_id: 'es', created_at: daysAgo(3) }),
    ], { now: NOW })
    expect(out.map((r) => r.id)).toEqual(['uk-new', 'es'])
  })

  it('orders newest first across communities', () => {
    const out = recentAnnouncements([
      row({ id: 'a', community_id: 'a', created_at: daysAgo(9) }),
      row({ id: 'b', community_id: 'b', created_at: daysAgo(1) }),
      row({ id: 'c', community_id: 'c', created_at: daysAgo(4) }),
    ], { now: NOW })
    expect(out.map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  // The point of the cutoff: a quiet month should leave the section empty
  // rather than presenting something from six weeks ago as news.
  it('drops anything older than the cutoff', () => {
    const out = recentAnnouncements([
      row({ id: 'fresh', community_id: 'a', created_at: daysAgo(14) }),
      row({ id: 'stale', community_id: 'b', created_at: daysAgo(16) }),
    ], { now: NOW })
    expect(out.map((r) => r.id)).toEqual(['fresh'])
  })

  it('does not let a stale row hide a fresh one from the same community', () => {
    const out = recentAnnouncements([
      row({ id: 'stale', community_id: 'a', created_at: daysAgo(40) }),
      row({ id: 'fresh', community_id: 'a', created_at: daysAgo(3) }),
    ], { now: NOW })
    expect(out.map((r) => r.id)).toEqual(['fresh'])
  })

  it('treats a null community as worldwide, and keeps it separate from a market', () => {
    const out = recentAnnouncements([
      row({ id: 'world', community_id: null, created_at: daysAgo(2) }),
      row({ id: 'uk', community_id: 'uk', created_at: daysAgo(1) }),
    ], { now: NOW })
    expect(out.map((r) => r.id)).toEqual(['uk', 'world'])
  })

  it('ignores deleted rows and unusable dates', () => {
    const out = recentAnnouncements([
      row({ id: 'gone', community_id: 'a', deleted: true }),
      row({ id: 'bad', community_id: 'b', created_at: 'not a date' }),
      row({ id: 'ok', community_id: 'c' }),
    ], { now: NOW })
    expect(out.map((r) => r.id)).toEqual(['ok'])
  })

  it('is empty, not undefined, for nothing at all', () => {
    expect(recentAnnouncements([], { now: NOW })).toEqual([])
    expect(recentAnnouncements(null, { now: NOW })).toEqual([])
    expect(recentAnnouncements(undefined, { now: NOW })).toEqual([])
  })

  it('defaults to the documented 15 days', () => {
    expect(ANNOUNCEMENT_MAX_AGE_DAYS).toBe(15)
  })
})

// TWO AT MOST ON THE HUB. One-per-room is the rule that stops a chatty market
// burying a quiet one; the cap is what stops an admin in seven markets getting
// a wall of cards where a creator gets a card.
describe('recentAnnouncements limit', () => {
  const at = (days) => new Date(Date.now() - days * 86400000).toISOString()
  const rows = [
    { id: 'a', community_id: 'uk', created_at: at(1) },
    { id: 'b', community_id: 'es', created_at: at(2) },
    { id: 'c', community_id: 'de', created_at: at(3) },
    { id: 'd', community_id: 'no', created_at: at(4) },
  ]

  it('returns the newest `limit` of them, newest first', () => {
    const out = recentAnnouncements(rows, { now: Date.now(), limit: 2 })
    expect(out.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('returns everything when no limit is asked for', () => {
    expect(recentAnnouncements(rows, { now: Date.now() })).toHaveLength(4)
  })

  it('does not pad up to the limit', () => {
    const one = [{ id: 'a', community_id: 'uk', created_at: at(1) }]
    expect(recentAnnouncements(one, { now: Date.now(), limit: 2 })).toHaveLength(1)
  })
})
