import { describe, it, expect } from 'vitest'
import { distanceLine, flagScale } from './story'
import { heroSize } from './cards'

const EARTH_KM = 40_075
const at = (km) => ({ timesRoundEarth: km / EARTH_KM, distance: km })

describe('distanceLine', () => {
  // Ethan asked for one yardstick - the way round the Earth - instead of the
  // three it used to switch between (laps, London-Sydney, laps of the M25).
  it('says "once" rather than "1.0 times"', () => {
    expect(distanceLine(at(EARTH_KM))).toBe('That is once around the world.')
    expect(distanceLine(at(EARTH_KM * 1.04))).toBe('That is once around the world.')
  })
  it('counts laps past one', () => {
    expect(distanceLine(at(EARTH_KM * 2.5))).toBe('That is 2.5 times around the world.')
  })
  it('gives a whole percentage over ten', () => {
    expect(distanceLine(at(EARTH_KM * 0.42))).toBe('That is 42% of the way around the world.')
  })
  it('keeps one decimal under ten percent, so a real trip is not rounded to nothing', () => {
    expect(distanceLine(at(EARTH_KM * 0.034))).toBe('That is 3.4% of the way around the world.')
  })
  it('never prints 0%: below a tenth of a percent it says something else', () => {
    const line = distanceLine(at(10))
    expect(line).not.toMatch(/%/)
    expect(line).toBe('Every one of them logged, down to the aircraft.')
  })
  it('handles a creator who has flown nothing', () => {
    expect(distanceLine(at(0))).toBe('Every one of them logged, down to the aircraft.')
  })
  it('mentions no other yardstick', () => {
    for (const km of [500, 5_000, 17_016, 40_075, 120_000]) {
      expect(distanceLine(at(km))).not.toMatch(/Sydney|M25/)
    }
  })
})

describe('flagScale', () => {
  it('gives one country the biggest size and forty a small one', () => {
    expect(flagScale(1)).toBe('text-5xl')
    expect(flagScale(40)).toBe('text-xl')
  })
  it('never grows as the count grows', () => {
    const px = { 'text-base': 16, 'text-xl': 20, 'text-2xl': 24, 'text-3xl': 30, 'text-4xl': 36, 'text-5xl': 48 }
    let last = Infinity
    for (let n = 1; n <= 80; n++) {
      const size = px[flagScale(n)]
      expect(size).toBeDefined()
      expect(size).toBeLessThanOrEqual(last)
      last = size
    }
  })
})

describe('heroSize', () => {
  // The reported bug: "September" ran off the month card.
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  const bigPx = (cls) => Number(cls.match(/sm:text-\[(\d+)px\]/)[1])

  it('drops every long month name below the largest size', () => {
    for (const m of MONTHS.filter((x) => x.length > 7)) {
      expect(bigPx(heroSize(m))).toBeLessThanOrEqual(58)
    }
  })
  it('still gives a short month the full size', () => {
    expect(bigPx(heroSize('May'))).toBe(92)
  })
  it('never grows as the string gets longer', () => {
    let last = Infinity
    for (let n = 1; n <= 30; n++) {
      const size = bigPx(heroSize('x'.repeat(n)))
      expect(size).toBeLessThanOrEqual(last)
      last = size
    }
  })
  it('survives a null or a number', () => {
    expect(() => heroSize(null)).not.toThrow()
    expect(() => heroSize(1234)).not.toThrow()
  })
})
