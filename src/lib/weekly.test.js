import { describe, expect, it } from 'vitest'
import { cleanWeekly, weeklyRounds } from './weekly'
import { challengeCloses, challengeEndIso, challengeStartIso, ymdInZone, zonedMidnight } from './zonedDate'

// The same answers migration 442's rehearsal printed for `weekly_rounds` on the Autumn/Winter Global Challenge.
const START = '2026-10-23T23:00:00Z' // Sat 24 Oct 00:00 London (BST)
const END = '2026-11-22T00:00:00Z' // Sun 22 Nov, London (GMT): the last day

describe('weeklyRounds (mirrors weekly_rounds in SQL)', () => {
  it('cuts 24 Oct - 22 Nov into four whole-day rounds, the last one taking the two spare days', () => {
    const r = weeklyRounds(START, END, 7)
    expect(r.map((x) => [x.startsAt, x.endsAt])).toEqual([
      ['2026-10-23T23:00:00.000Z', '2026-10-31T00:00:00.000Z'],
      ['2026-10-31T00:00:00.000Z', '2026-11-07T00:00:00.000Z'],
      ['2026-11-07T00:00:00.000Z', '2026-11-14T00:00:00.000Z'],
      ['2026-11-14T00:00:00.000Z', '2026-11-23T00:00:00.000Z'],
    ])
    expect(r.map((x) => x.days)).toEqual([7, 7, 7, 9])
    expect(r[0]).toMatchObject({ startDay: '2026-10-24', lastDay: '2026-10-30' })
  })
  it('ends every round at midnight across the clock change', () => {
    for (const x of weeklyRounds(START, END, 7)) {
      expect(new Date(x.endsAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/London' })).toBe('00:00:00')
    }
  })
  it('keeps a remainder of half a round or more as its own round', () => {
    // 11 days: 7 + 4
    expect(weeklyRounds('2026-10-01T00:00:00Z', '2026-10-11T12:00:00Z', 7, { tz: 'UTC' }).map((x) => x.days)).toEqual([7, 4])
    // 5-day rounds over 30 days
    expect(weeklyRounds(START, END, 5)).toHaveLength(6)
  })
  it('takes custom rounds and ignores days outside the challenge', () => {
    const r = weeklyRounds(START, END, 7, { roundEnds: ['2026-11-07', '2026-10-31', '2026-12-25', '2026-11-22'] })
    expect(r.map((x) => [x.startDay, x.lastDay])).toEqual([
      ['2026-10-24', '2026-10-31'],
      ['2026-11-01', '2026-11-07'],
      ['2026-11-08', '2026-11-22'],
    ])
  })
  it('works in another market clock', () => {
    const r = weeklyRounds('2026-09-30T22:00:00Z', '2026-11-01T22:59:00Z', 7, { tz: 'Europe/Madrid' })
    expect(r[0].startsAt).toBe('2026-09-30T22:00:00.000Z')
    expect(r.at(-1).endsAt).toBe('2026-11-01T23:00:00.000Z')
  })
})

describe('cleanWeekly', () => {
  it('keeps nothing without an amount', () => {
    expect(cleanWeekly({ amount: '' })).toBe(null)
    expect(cleanWeekly({ amount: '10', type: 'cash' })).toEqual({ amount: 10, currency: 'EUR', type: 'cash', every_days: 7, auto_award: true })
  })
  it('keeps custom rounds and a switched-off auto award', () => {
    expect(cleanWeekly({ amount: 10, round_ends: ['2026-11-07', 'x', '2026-10-31'], auto_award: false }))
      .toMatchObject({ round_ends: ['2026-10-31', '2026-11-07'], auto_award: false })
  })
})

describe('a challenge runs on whole days in its own zone', () => {
  it('opens at the start of the start date and stores 23:59 on the end date', () => {
    expect(challengeStartIso('2026-10-24', 'Europe/London')).toBe('2026-10-23T23:00:00.000Z')
    expect(challengeEndIso('2026-11-22', 'Europe/London')).toBe('2026-11-22T23:59:00.000Z')
    expect(challengeStartIso('2026-10-24', 'Europe/Madrid')).toBe('2026-10-23T22:00:00.000Z')
  })
  it('reads dates back in the same zone, whatever the viewer clock', () => {
    expect(ymdInZone('2026-10-23T23:00:00Z', 'Europe/London')).toBe('2026-10-24')
    expect(ymdInZone('2026-10-23T23:00:00Z', 'UTC')).toBe('2026-10-23')
    expect(zonedMidnight('2026-10-25', 'Europe/London')).toBe('2026-10-24T23:00:00.000Z')
    expect(zonedMidnight('2026-10-26', 'Europe/London')).toBe('2026-10-26T00:00:00.000Z')
  })
  it('closes at closes_at, or at the end of the end date in the challenge zone', () => {
    expect(challengeCloses({ closes_at: '2026-11-23T00:00:00Z' }).toISOString()).toBe('2026-11-23T00:00:00.000Z')
    expect(challengeCloses({ end_date: '2026-11-22T00:00:00Z', timezone: 'Europe/London' }).toISOString()).toBe('2026-11-23T00:00:00.000Z')
  })
})
