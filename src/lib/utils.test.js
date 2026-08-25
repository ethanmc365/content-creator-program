import { describe, it, expect } from 'vitest'
import {
  challengeDeadline,
  parseDob,
  formatMoney,
  detectPlatform,
  formatViews,
  toCsv,
  csvCell,
  csvHeader,
} from './utils'

describe('challengeDeadline', () => {
  it('keeps a challenge open through the whole of its end date', () => {
    // end_date 30 Jun → closes at 00:00 on 1 Jul (local).
    const deadline = challengeDeadline('2026-06-30')
    expect(deadline.getDate()).toBe(1)
    expect(deadline.getMonth()).toBe(6) // July (0-indexed)
    expect(deadline.getHours()).toBe(0)
  })

  it('treats a date before its deadline as still open and after as closed', () => {
    const deadline = challengeDeadline('2026-06-30')
    expect(new Date('2026-06-30T23:00:00').getTime()).toBeLessThan(deadline.getTime())
    expect(new Date('2026-07-01T01:00:00').getTime()).toBeGreaterThan(deadline.getTime())
  })
})

describe('parseDob', () => {
  it('parses a valid DD/MM/YYYY into an ISO date', () => {
    expect(parseDob('25/01/2005')).toBe('2005-01-25')
  })
  it('rejects impossible dates', () => {
    expect(parseDob('31/02/2005')).toBeNull()
    expect(parseDob('not a date')).toBeNull()
  })
})

describe('formatMoney', () => {
  it('drops decimals for whole amounts and keeps pennies otherwise', () => {
    expect(formatMoney(600)).toBe('£600')
    expect(formatMoney(12.5)).toBe('£12.50')
    expect(formatMoney(0)).toBe('£0')
  })
})

describe('detectPlatform', () => {
  it('detects the platform from a pasted link', () => {
    expect(detectPlatform('https://www.tiktok.com/@x/video/1')).toBe('TikTok')
    expect(detectPlatform('https://instagram.com/reel/1')).toBe('Instagram')
    expect(detectPlatform('https://youtu.be/abc')).toBe('YouTube')
    expect(detectPlatform('https://example.com')).toBe('Other')
  })
})

describe('formatViews', () => {
  it('compacts large numbers', () => {
    expect(formatViews(1_500_000)).toBe('1.5M')
    expect(formatViews(2_000)).toBe('2k')
    expect(formatViews(950)).toBe('950')
  })
})


// AN EXPORT IS READ BY A SPREADSHEET, NOT BY A PERSON, and every rule below is
// something Excel gets wrong when the file does not follow it. Ethan reported an
// export opening "very messy"; these are the three reasons why.
describe('the CSV an admin export produces', () => {
  it('titles the header from the key, so a column reads like a heading', () => {
    expect(csvHeader('countries_visited')).toBe('Countries visited')
    expect(csvHeader('name')).toBe('Name')
    expect(csvHeader('phone-country')).toBe('Phone country')
  })

  it('separates records with CRLF, which is what Excel expects', () => {
    const csv = toCsv([{ a: 1 }, { a: 2 }])
    expect(csv).toBe('A\r\n1\r\n2')
  })

  // The one that made phone numbers open as errors.
  it('stops a leading + = - or @ being evaluated as a formula', () => {
    expect(csvCell('+447700900123')).toBe('\t+447700900123')
    expect(csvCell('=1+1')).toBe('\t=1+1')
    expect(csvCell('-3')).toBe('\t-3')
    expect(csvCell('@handle')).toBe('\t@handle')
    // ...without touching an ordinary value
    expect(csvCell('Denisa')).toBe('Denisa')
    expect(csvCell(0)).toBe('0')
  })

  it('quotes anything containing a comma, a quote or a newline', () => {
    expect(csvCell('Reading, England')).toBe('"Reading, England"')
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  it('writes an empty cell for null and undefined rather than the word', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('takes the column order and labels when it is given them', () => {
    const rows = [{ name: 'Ana', email: 'a@b.c', status: 'active' }]
    expect(toCsv(rows, [{ key: 'email', label: 'Email address' }, { key: 'name', label: 'Creator' }]))
      .toBe('Email address,Creator\r\na@b.c,Ana')
  })

  it('is empty for no rows rather than a lone header', () => {
    expect(toCsv([])).toBe('')
    expect(toCsv(null)).toBe('')
  })
})
