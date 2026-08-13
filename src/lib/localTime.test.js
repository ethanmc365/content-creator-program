import { describe, it, expect } from 'vitest'
import { timezoneFor, clockIn, localTimeLine } from './localTime'

describe('timezoneFor', () => {
  it('reads a single-zone country straight off the code', () => {
    expect(timezoneFor({ country_code: 'GB' })).toBe('Europe/London')
    expect(timezoneFor({ country_code: 'pt' })).toBe('Europe/Lisbon')
    expect(timezoneFor({ country_code: 'RO' })).toBe('Europe/Bucharest')
  })

  it('picks a band by longitude in a country with several clocks', () => {
    expect(timezoneFor({ country_code: 'US', city_lng: -118.2 })).toBe('America/Los_Angeles')
    expect(timezoneFor({ country_code: 'US', city_lng: -74 })).toBe('America/New_York')
    expect(timezoneFor({ country_code: 'AU', city_lng: 151.2 })).toBe('Australia/Sydney')
    expect(timezoneFor({ country_code: 'AU', city_lng: 115.9 })).toBe('Australia/Perth')
  })

  it('says nothing rather than guessing when a wide country has no town', () => {
    expect(timezoneFor({ country_code: 'US' })).toBeNull()
    expect(timezoneFor({ country_code: 'RU' })).toBeNull()
  })

  it('is null for a profile with no country at all', () => {
    expect(timezoneFor({})).toBeNull()
    expect(timezoneFor(null)).toBeNull()
  })
})

describe('clockIn', () => {
  it('writes the time the way a person would', () => {
    // 2026-08-13T14:41Z is 3:41pm in Lisbon (WEST, UTC+1).
    const at = new Date('2026-08-13T14:41:00Z')
    expect(clockIn('Europe/Lisbon', at)).toBe('3:41pm')
    expect(clockIn('Europe/Bucharest', at)).toBe('5:41pm')
  })

  it('drops the leading zero and lowercases the meridiem', () => {
    expect(clockIn('Europe/London', new Date('2026-08-13T08:05:00Z'))).toBe('9:05am')
  })

  it('is null without a zone', () => {
    expect(clockIn(null)).toBeNull()
  })
})

describe('localTimeLine', () => {
  it('gives a time and a bearing for a profile it can place', () => {
    const line = localTimeLine({ country_code: 'PT' }, new Date('2026-08-13T14:41:00Z'))
    expect(line.time).toBe('3:41pm')
    expect(line.zone).toBe('Europe/Lisbon')
  })

  it('is null when the profile cannot be placed', () => {
    expect(localTimeLine({ country_code: '' })).toBeNull()
  })
})
