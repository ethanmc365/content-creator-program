import { describe, expect, it } from 'vitest'
import { localCurrencyOf, localHint } from './localMoney'

describe('localMoney', () => {
  it('knows a UK creator banks in pounds', () => {
    expect(localCurrencyOf({ country_code: 'GB' })).toBe('GBP')
    expect(localCurrencyOf({ country: 'United Kingdom' })).toBe('GBP')
    expect(localCurrencyOf({ country_code: 'ES' })).toBe(null)
  })
  it('rounds to whole pounds and says nothing in the same currency', () => {
    expect(localHint(22, 'EUR', 'GBP')).toBe('≈ £19')
    expect(localHint(10, 'GBP', 'GBP')).toBe(null)
    expect(localHint(22, 'EUR', null)).toBe(null)
  })
})
