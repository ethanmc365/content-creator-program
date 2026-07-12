import { describe, expect, it } from 'vitest'
import {
  cleanIban, formatIban, formatSortCode, invoiceMoney, invoiceRef,
  payeeFromPrivate, payeeToPrivate, paymentRows, validatePayee,
} from './invoice'

const GBP_OK = { currency: 'GBP', name: 'Amelia Wright', bank: 'Monzo', sortCode: '123456', accountNumber: '12345678', address: '12 Baker St, London' }
const EUR_OK = { currency: 'EUR', name: 'Marco Rossi', bank: 'N26', iban: 'IE64IRCE92050112345678', bic: 'IRCEIE2D', address: 'Via Roma 1, Milan' }

describe('validatePayee', () => {
  it('accepts complete UK details', () => {
    expect(validatePayee(GBP_OK)).toEqual([])
  })
  it('accepts complete euro details, and every field is required', () => {
    expect(validatePayee(EUR_OK)).toEqual([])
    expect(validatePayee({ ...EUR_OK, bic: '' }).length).toBe(1)
    expect(validatePayee({ ...EUR_OK, bank: '' }).length).toBe(1)
    expect(validatePayee({ ...GBP_OK, address: '' }).length).toBe(1)
  })
  it('rejects a short sort code or account number', () => {
    expect(validatePayee({ ...GBP_OK, sortCode: '12345' }).length).toBe(1)
    expect(validatePayee({ ...GBP_OK, accountNumber: '1234' }).length).toBe(1)
  })
  it('rejects a malformed IBAN or BIC', () => {
    expect(validatePayee({ ...EUR_OK, iban: 'NOT-AN-IBAN' }).length).toBe(1)
    expect(validatePayee({ ...EUR_OK, bic: 'X' }).length).toBe(1)
  })
  it('requires the bic and bank for euros', () => {
    expect(validatePayee({ ...EUR_OK, bic: undefined }).length).toBe(1)
  })
  it('accepts an IBAN typed with spaces in lowercase', () => {
    expect(validatePayee({ ...EUR_OK, iban: 'ie64 irce 9205 0112 3456 78' })).toEqual([])
  })
  it('requires currency and account holder name', () => {
    const problems = validatePayee({})
    expect(problems.length).toBeGreaterThanOrEqual(2)
  })
})

describe('formatting', () => {
  it('formats sort codes and IBANs for humans', () => {
    expect(formatSortCode('123456')).toBe('12-34-56')
    expect(formatIban('ie64irce92050112345678')).toBe('IE64 IRCE 9205 0112 3456 78')
    expect(cleanIban(' ie64 irce 9205 0112 3456 78 ')).toBe('IE64IRCE92050112345678')
  })
  it('formats invoice refs and money', () => {
    expect(invoiceRef(7)).toBe('Tryp.com 007')
    expect(invoiceRef(123)).toBe('Tryp.com 123')
    expect(invoiceMoney(500, 'GBP')).toBe('£500.00')
    expect(invoiceMoney(250.5, 'EUR')).toBe('€250.50')
  })
})

describe('payment box rows', () => {
  it('shows sort code + account number for GBP', () => {
    const labels = paymentRows(GBP_OK).map(([l]) => l)
    expect(labels).toContain('Sort code')
    expect(labels).toContain('Account number')
    expect(labels).not.toContain('IBAN')
  })
  it('shows IBAN + BIC for EUR', () => {
    const labels = paymentRows(EUR_OK).map(([l]) => l)
    expect(labels).toContain('IBAN')
    expect(labels).toContain('BIC / SWIFT')
    expect(labels).not.toContain('Sort code')
  })
})

describe('creator_private mapping', () => {
  it('round-trips a payee through the pay_* columns', () => {
    const cols = payeeToPrivate({ ...EUR_OK, iban: 'ie64 irce 9205 0112 3456 78', address: ' Rome ' })
    expect(cols.pay_iban).toBe('IE64IRCE92050112345678')
    expect(cols.pay_address).toBe('Rome')
    const back = payeeFromPrivate(cols)
    expect(back.currency).toBe('EUR')
    expect(back.name).toBe('Marco Rossi')
  })
})
