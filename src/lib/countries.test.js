import { describe, it, expect } from 'vitest'
import { COUNTRIES, CONTINENTS, currencyCountriesForRegion, currencyOptions } from './countries'

describe('currencies quiz data', () => {
  it('every country has a currency name and symbol', () => {
    for (const c of COUNTRIES) {
      expect(c.currency, `${c.name} is missing a currency`).toBeTruthy()
      expect(c.symbol, `${c.name} is missing a currency symbol`).toBeTruthy()
    }
    expect(currencyCountriesForRegion('World').length).toBe(COUNTRIES.length)
  })

  it('builds 6 distinct currency options with exactly one right answer, for every country in every region', () => {
    for (const region of ['World', ...CONTINENTS]) {
      for (const target of currencyCountriesForRegion(region)) {
        const options = currencyOptions(target, region)
        expect(options.length, `${target.name} (${region})`).toBe(6)
        // all currency names distinct -> the answer can never appear twice
        expect(new Set(options.map((o) => o.currency)).size).toBe(6)
        // exactly one option is the target's currency, with its symbol
        const right = options.filter((o) => o.currency === target.currency)
        expect(right.length, `${target.name} (${region})`).toBe(1)
        expect(right[0].symbol).toBe(target.symbol)
        // every option carries a name and symbol for display
        for (const o of options) {
          expect(o.currency).toBeTruthy()
          expect(o.symbol).toBeTruthy()
        }
      }
    }
  })

  it('options are shuffled (answer is not always first)', () => {
    const target = COUNTRIES.find((c) => c.name === 'Switzerland')
    let firstIsAnswer = 0
    for (let i = 0; i < 40; i++) {
      if (currencyOptions(target, 'Europe')[0].currency === target.currency) firstIsAnswer++
    }
    expect(firstIsAnswer).toBeLessThan(40)
  })
})
