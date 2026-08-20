import { describe, it, expect } from 'vitest'
import { parseBoardingPass, dateFromDayOfYear, boardingPassToForm } from './bcbp'

// Real-shaped BCBP strings. The format is fixed-width, so the tests are mostly
// about the places a field is padded, zero-filled or simply absent - which is
// where a hand-rolled parser goes wrong.
const AER_LINGUS = 'M1SMITH/JOHN          EABC123 DUBCDGEI 0122 195Y012A0034 100'

describe('parseBoardingPass', () => {
  it('reads the five fields that are tedious to type', () => {
    const p = parseBoardingPass(AER_LINGUS)
    expect(p.from).toBe('DUB')
    expect(p.to).toBe('CDG')
    expect(p.airline).toBe('EI')
    expect(p.flightNumber).toBe('EI122')      // 0122 is flight 122
    expect(p.seat).toBe('12A')                // 012A is seat 12A
    expect(p.dayOfYear).toBe(195)
    expect(p.name).toBe('SMITH/JOHN')
  })

  it('refuses anything that is not a boarding pass', () => {
    // A QR code that happened to be in the photo, a URL, a loyalty card.
    expect(parseBoardingPass('https://example.com/whatever')).toBeNull()
    expect(parseBoardingPass('')).toBeNull()
    expect(parseBoardingPass(null)).toBeNull()
    // Right prefix, truncated payload: guessing at half a pass is worse than
    // telling somebody the scan failed.
    expect(parseBoardingPass('M1SMITH/JOHN E')).toBeNull()
  })

  it('rejects an impossible day of the year rather than inventing a date', () => {
    expect(parseBoardingPass(AER_LINGUS.replace('195Y', '000Y'))).toBeNull()
  })
})

describe('dateFromDayOfYear', () => {
  it('resolves to this year when the day has been or is close', () => {
    // 195th day of 2026 is 14 July.
    expect(dateFromDayOfYear(195, new Date(2026, 7, 20))).toBe('2026-07-14')
  })

  it('falls back a year when this year would be far in the future', () => {
    // Scanning on 20 January, a day-195 pass is last July, not next.
    expect(dateFromDayOfYear(195, new Date(2026, 0, 20))).toBe('2025-07-14')
  })

  it('keeps a pass for a flight a fortnight away in the current year', () => {
    expect(dateFromDayOfYear(195, new Date(2026, 6, 1))).toBe('2026-07-14')
  })
})

describe('boardingPassToForm', () => {
  it('hands the log form exactly the fields it fills', () => {
    const { form } = boardingPassToForm(AER_LINGUS, new Date(2026, 7, 20))
    expect(form).toEqual({
      from_iata: 'DUB', to_iata: 'CDG', flight_number: 'EI122',
      seat: '12A', flown_on: '2026-07-14',
    })
  })
  it('returns null rather than a half-filled form', () => {
    expect(boardingPassToForm('not a pass', new Date())).toBeNull()
  })
})
