import { describe, expect, it } from 'vitest'
import { conversionNote, convertAmount, convertForInvoice, rateLine, symbolFor } from './invoiceFx'

const RATE = 1.1538 // £1 = €1.1538

describe('convertAmount', () => {
  it('turns pounds into euros', () => {
    expect(convertAmount(20, 'GBP', 'EUR', RATE)).toBeCloseTo(23.076, 3)
  })

  // The half Ethan asked for: a euro prize won by somebody banking in pounds.
  it('turns euros into pounds', () => {
    expect(convertAmount(23.08, 'EUR', 'GBP', RATE)).toBeCloseTo(20.003, 3)
  })

  it('leaves an amount alone when there is nothing to convert', () => {
    expect(convertAmount(20, 'GBP', 'GBP', RATE)).toBe(20)
    expect(convertAmount(20, 'EUR', 'EUR', 0)).toBe(20) // no rate needed
  })

  it('says nothing rather than writing a zero when the rate failed', () => {
    expect(convertAmount(20, 'GBP', 'EUR', 0)).toBeNull()
    expect(convertAmount(20, 'GBP', 'EUR', null)).toBeNull()
  })

  it('says nothing for an amount that is not a number', () => {
    expect(convertAmount('', 'GBP', 'EUR', RATE)).toBeNull()
    expect(convertAmount('abc', 'GBP', 'EUR', RATE)).toBeNull()
  })

  it('rounds to the pennies an invoice is written in', () => {
    expect(convertForInvoice(20, 'GBP', 'EUR', RATE)).toBe(23.08)
    expect(convertForInvoice(100, 'EUR', 'GBP', RATE)).toBe(86.67)
  })
})

describe('rateLine', () => {
  // The reader is checking the number in front of them, not doing the
  // reciprocal in their head.
  it('quotes the rate in the direction of the invoice', () => {
    expect(rateLine('GBP', 'EUR', RATE)).toBe('£1 = €1.1538')
    expect(rateLine('EUR', 'GBP', RATE)).toBe('€1 = £0.8667')
  })

  it('is nothing when no conversion happened, or no rate loaded', () => {
    expect(rateLine('GBP', 'GBP', RATE)).toBeNull()
    expect(rateLine('GBP', 'EUR', 0)).toBeNull()
  })
})

describe('conversionNote', () => {
  // THE BUG. A £20 prize opens as €23; pressing GBP takes it back to the prize
  // itself, and there is then nothing whatsoever to explain.
  it('says nothing when the invoice is in the currency the prize was awarded in', () => {
    expect(conversionNote({ amount: 20, currency: 'GBP' }, 'GBP', RATE)).toBeNull()
    expect(conversionNote({ amount: 50, currency: 'EUR' }, 'EUR', RATE)).toBeNull()
  })

  it('explains a sterling prize paid in euros', () => {
    expect(conversionNote({ amount: 20, currency: 'GBP' }, 'EUR', RATE).text)
      .toBe('Converted from £20.00, the prize as awarded, at today’s European Central Bank rate (£1 = €1.1538). Overtype it if you need a different figure.')
  })

  it('explains a euro prize paid in pounds', () => {
    expect(conversionNote({ amount: 23.08, currency: 'EUR' }, 'GBP', RATE).text)
      .toBe('Converted from €23.08, the prize as awarded, at today’s European Central Bank rate (€1 = £0.8667). Overtype it if you need a different figure.')
  })

  it('says nothing when nothing knows what the prize was awarded as', () => {
    expect(conversionNote(null, 'EUR', RATE)).toBeNull()
    expect(conversionNote({ amount: 20 }, 'EUR', RATE)).toBeNull()
  })

  it('says nothing when the rate failed to load, because it cannot be stated', () => {
    expect(conversionNote({ amount: 20, currency: 'GBP' }, 'EUR', 0)).toBeNull()
  })
})

describe('symbolFor', () => {
  it('is the two this programme settles in', () => {
    expect(symbolFor('EUR')).toBe('€')
    expect(symbolFor('GBP')).toBe('£')
  })
})

// A round trip must not cost a penny: going back to the prize's own currency
// restores the prize, it does not divide back through the rate.
describe('the round trip', () => {
  it('is exact when the source figure is kept rather than recomputed', () => {
    const prize = { amount: 20, currency: 'GBP' }
    const inEur = convertForInvoice(prize.amount, 'GBP', 'EUR', RATE)
    expect(inEur).toBe(23.08)
    // Wrong way: divide the rounded euro figure back.
    expect(convertForInvoice(inEur, 'EUR', 'GBP', RATE)).toBe(20)
    // Right way, and the one the composer uses: go back to the source.
    expect(convertForInvoice(prize.amount, 'GBP', 'GBP', RATE)).toBe(20)
  })
})
