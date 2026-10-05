import { describe, it, expect } from 'vitest'
import { DIAL_CODES, splitInternational } from './dialCodes'

describe('dial codes', () => {
  it('has Bulgaria (a creator could not finish signing up without it) and a code for every country we list elsewhere', () => {
    expect(DIAL_CODES.find((c) => c.iso2 === 'BG')).toMatchObject({ code: '+359', name: 'Bulgaria' })
    expect(DIAL_CODES.length).toBeGreaterThan(220)
  })
  it('has no duplicate country and every code is +digits', () => {
    const iso = DIAL_CODES.map((c) => c.iso2)
    expect(new Set(iso).size).toBe(iso.length)
    for (const c of DIAL_CODES) expect(c.code, c.iso2).toMatch(/^\+\d{1,5}$/)
  })
  it('covers every country in the geography list that has a dialling code', async () => {
    const { COUNTRIES } = await import('./countries')
    const have = new Set(DIAL_CODES.map((c) => c.iso2))
    const missing = COUNTRIES.map((c) => c.iso2).filter((i) => !have.has(i))
    expect(missing).toEqual([])
  })
  it('reads a full international number and picks the LONGEST matching code', () => {
    expect(splitInternational('+359 88 123 4567')).toMatchObject({ code: '+359', iso2: 'BG', national: '881234567' })
    expect(splitInternational('00359881234567')).toMatchObject({ iso2: 'BG' })
    expect(splitInternational('+1 242 555 0100')).toMatchObject({ code: '+1242', iso2: 'BS' })
    expect(splitInternational('+44 7700 900123')).toMatchObject({ code: '+44', iso2: 'GB' })
    expect(splitInternational('7700 900123')).toBeNull()
    expect(splitInternational('+359')).toBeNull()
  })
})
