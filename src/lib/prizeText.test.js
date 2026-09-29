import { describe, it, expect } from 'vitest'
import { localizePrize } from './prizeText'

describe('localizePrize', () => {
  it('translates the words around the amount and keeps the amount', () => {
    expect(localizePrize('€100 cash', 'es')).toBe('€100 en efectivo')
    expect(localizePrize('€150 cash', 'de')).toBe('€150 in bar')
    expect(localizePrize('Trip.com participation voucher', 'pt')).toBe('Vale de participação Tryp.com')
    expect(localizePrize('€10 Tryp.com voucher', 'ro')).toBe('€10 voucher Tryp.com')
  })
  it('leaves English and unknown text alone', () => {
    expect(localizePrize('€100 cash', 'en')).toBe('€100 cash')
    expect(localizePrize('A signed shirt', 'es')).toBe('A signed shirt')
    expect(localizePrize('', 'es')).toBe('')
  })
})
