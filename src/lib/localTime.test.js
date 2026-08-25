import { describe, it, expect } from 'vitest'
import {
  timezoneFor,
  clockIn,
  localTimeLine,
  zonedTimeToUtc,
  zoneOffsetMs,
  zoneLabel,
} from './localTime'

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


// SCHEDULING A MESSAGE INTO A MARKET'S OWN TIME.
//
// Every one of these would pass in July and fail in November if the conversion
// ignored the date, which is exactly how this kind of bug ships: you write it in
// summer, it works, and in October every scheduled message goes out an hour off.
describe('typing a time in a market from anywhere', () => {
  it('reads 09:00 in Madrid as 08:00 UTC in winter and 07:00 UTC in summer', () => {
    expect(zonedTimeToUtc('2026-01-15', '09:00', 'Europe/Madrid').toISOString())
      .toBe('2026-01-15T08:00:00.000Z')
    expect(zonedTimeToUtc('2026-07-15', '09:00', 'Europe/Madrid').toISOString())
      .toBe('2026-07-15T07:00:00.000Z')
  })

  it('reads London as UTC in winter and one ahead in summer', () => {
    expect(zonedTimeToUtc('2026-01-15', '09:00', 'Europe/London').toISOString())
      .toBe('2026-01-15T09:00:00.000Z')
    expect(zonedTimeToUtc('2026-07-15', '09:00', 'Europe/London').toISOString())
      .toBe('2026-07-15T08:00:00.000Z')
  })

  it('handles a zone the other side of UTC', () => {
    expect(zonedTimeToUtc('2026-01-15', '09:00', 'America/New_York').toISOString())
      .toBe('2026-01-15T14:00:00.000Z')
  })

  // The day the clocks go back is where a one-pass conversion breaks.
  it('survives the day a zone changes its offset', () => {
    // Europe/London returns to UTC at 02:00 on 25 Oct 2026.
    expect(zonedTimeToUtc('2026-10-25', '09:00', 'Europe/London').toISOString())
      .toBe('2026-10-25T09:00:00.000Z')
    expect(zonedTimeToUtc('2026-10-24', '09:00', 'Europe/London').toISOString())
      .toBe('2026-10-24T08:00:00.000Z')
  })

  it('returns nothing rather than a wrong instant for bad input', () => {
    expect(zonedTimeToUtc('', '09:00', 'Europe/London')).toBeNull()
    expect(zonedTimeToUtc('2026-01-15', '9:00', 'Europe/London')).toBeNull()
    expect(zonedTimeToUtc('15/01/2026', '09:00', 'Europe/London')).toBeNull()
    expect(zonedTimeToUtc('2026-01-15', '09:00', 'Not/AZone')).toBeNull()
  })

  it('measures a zone offset at an instant', () => {
    expect(zoneOffsetMs('Europe/Madrid', new Date('2026-01-15T12:00:00Z'))).toBe(3600000)
    expect(zoneOffsetMs('Europe/Madrid', new Date('2026-07-15T12:00:00Z'))).toBe(7200000)
    expect(zoneOffsetMs('UTC', new Date('2026-01-15T12:00:00Z'))).toBe(0)
  })

  it('names a zone the way a person would', () => {
    expect(zoneLabel('Europe/Madrid')).toBe('Madrid')
    expect(zoneLabel('America/New_York')).toBe('New York')
    expect(zoneLabel('')).toBe('')
  })
})
