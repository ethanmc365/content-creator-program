import { describe, expect, it } from 'vitest'
import { challengeDaysLeft } from './utils'

// The October Global Challenge: last day 18 Oct (London), closes 19 Oct 00:00 London = 18 Oct 23:00 UTC.
const ch = { end_date: '2026-10-18T22:59:00Z', closes_at: '2026-10-18T23:00:00Z', timezone: 'Europe/London' }
const at = (iso) => Date.parse(iso)

describe('challengeDaysLeft', () => {
  it('is 0 all through the last day, never "1 day left"', () => {
    expect(challengeDaysLeft(ch, at('2026-10-17T23:30:00Z'))).toBe(0) // 00:30 London on the 18th
    expect(challengeDaysLeft(ch, at('2026-10-18T10:00:00Z'))).toBe(0)
    expect(challengeDaysLeft(ch, at('2026-10-18T22:59:00Z'))).toBe(0)
  })
  it('is 1 the day before and -1 once closed', () => {
    expect(challengeDaysLeft(ch, at('2026-10-17T09:00:00Z'))).toBe(1)
    expect(challengeDaysLeft(ch, at('2026-10-18T23:00:00Z'))).toBe(-1)
  })
  it('counts on the challenge clock without a zone too', () => {
    const noTz = { end_date: ch.end_date, closes_at: ch.closes_at }
    expect(challengeDaysLeft(noTz, at('2026-10-18T10:00:00Z'))).toBe(0)
    expect(challengeDaysLeft(noTz, at('2026-10-16T10:00:00Z'))).toBe(2)
  })
})
