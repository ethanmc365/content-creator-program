import { describe, it, expect } from 'vitest'
import { PINPOINT_COUNTRIES, pinpointForDay, pinpointMatches } from './pinpoint'
import { ukDayIndex, ukDayStartIso, untilNextUkMidnight } from './daily'

describe('guess-the-country data', () => {
  it('has at least 100 countries, each with three sets of five clues', () => {
    expect(PINPOINT_COUNTRIES.length).toBeGreaterThanOrEqual(100)
    for (const c of PINPOINT_COUNTRIES) {
      expect(c.sets, c.name).toHaveLength(3)
      for (const set of c.sets) {
        expect(set, c.name).toHaveLength(5)
        for (const w of set) expect(typeof w, c.name).toBe('string')
      }
      // no duplicate clue inside a single set
      for (const set of c.sets) expect(new Set(set).size, c.name).toBe(5)
      expect(c.iso2, c.name).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('daily pick is deterministic and rotates the clue sets over time', () => {
    const a = pinpointForDay(20650)
    const b = pinpointForDay(20650)
    expect(a.name).toBe(b.name)
    expect(a.words).toEqual(b.words)
    // over a year, every set index appears
    const seen = new Set()
    for (let d = 20650; d < 20650 + 366; d++) {
      const p = pinpointForDay(d)
      seen.add(p.sets.indexOf(p.words))
    }
    expect(seen).toEqual(new Set([0, 1, 2]))
  })

  it('matches names and aliases, ignoring case and accents', () => {
    const uk = PINPOINT_COUNTRIES.find((c) => c.name === 'United Kingdom')
    expect(pinpointMatches(uk, 'uk')).toBe(true)
    expect(pinpointMatches(uk, 'Great Britain')).toBe(true)
    expect(pinpointMatches(uk, 'France')).toBe(false)
  })
})

describe('uk daily clock', () => {
  it('rolls over at midnight London time, not UTC', () => {
    // 15 July 2026 is BST (UTC+1): 23:30 UTC on the 14th is already the 15th in London
    const utc2330 = Date.UTC(2026, 6, 14, 23, 30)
    const utc2230 = Date.UTC(2026, 6, 14, 22, 30)
    expect(ukDayIndex(utc2330)).toBe(ukDayIndex(utc2230) + 1)
  })

  it('day start ISO is within the current day and countdown formats', () => {
    const now = Date.UTC(2026, 6, 15, 12, 0)
    const start = new Date(ukDayStartIso(now)).getTime()
    expect(start).toBeLessThanOrEqual(now)
    expect(now - start).toBeLessThan(26 * 3600 * 1000)
    expect(ukDayIndex(start)).toBe(ukDayIndex(now))
    expect(ukDayIndex(start - 2000)).toBe(ukDayIndex(now) - 1)
    expect(untilNextUkMidnight(now)).toMatch(/^\d+h \d+m$/)
  })
})
