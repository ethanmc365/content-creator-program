import { describe, it, expect } from 'vitest'
import { inCurrency } from '../pages/admin/AdminChallengeForm'

// A PRIZE LADDER RESTATED IN ANOTHER CURRENCY.
//
// This exists as a test because of how it failed: not by producing the wrong
// words, but by being handed the wrong FORM. `setCurrency` closed over `form`,
// so when the template rail applied a brief and then asked for a currency swap,
// the swap ran over the prize ladder from before the template and wrote it back
// on top. A pure function of the form it is rewriting cannot do that, and these
// are the cases that prove it does the words right as well.
describe('inCurrency', () => {
  const form = {
    prize_currency: 'GBP',
    prize_structure: [
      { place: '1st', prize: '£150 cash' },
      { place: '2nd', prize: '100 GBP voucher' },
      { place: '3rd', prize: 'A feature on the Tryp.com account' },
    ],
    participation_prize: '£10 voucher',
  }

  it('rewrites the symbol', () => {
    const out = inCurrency(form, 'EUR')
    expect(out.prize_structure[0].prize).toBe('€150 cash')
    expect(out.participation_prize).toBe('€10 voucher')
  })

  it('rewrites the code as well, because admins type both', () => {
    expect(inCurrency(form, 'EUR').prize_structure[1].prize).toBe('100 EUR voucher')
  })

  it('does not convert the number - a prize is a decision, not a payment', () => {
    expect(inCurrency(form, 'EUR').prize_structure[0].prize).not.toContain('174')
  })

  it('leaves a prize that is not money completely alone', () => {
    expect(inCurrency(form, 'EUR').prize_structure[2].prize)
      .toBe('A feature on the Tryp.com account')
  })

  it('sets the currency it was asked for', () => {
    expect(inCurrency(form, 'SEK').prize_currency).toBe('SEK')
  })

  it('reads the FORM IT IS GIVEN, which is the whole reason it is pure', () => {
    // The template case: a brief has just been merged in and carries EUR
    // prizes. Swapping to GBP must rewrite THOSE, not the ones in `form`.
    const merged = {
      prize_currency: 'EUR',
      prize_structure: [{ place: '1st', prize: '200 EUR cash' }],
      participation_prize: '',
    }
    const out = inCurrency(merged, 'GBP')
    expect(out.prize_structure).toEqual([{ place: '1st', prize: '200 GBP cash' }])
  })

  it('survives a form with no prizes at all', () => {
    expect(inCurrency({ prize_currency: 'GBP' }, 'EUR'))
      .toEqual({ prize_currency: 'EUR', prize_structure: [], participation_prize: '' })
  })
})
