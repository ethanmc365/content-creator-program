// Shared invoice model: one source of truth for the company being billed,
// currency-specific bank fields, formatting and validation. Used by the
// creator payment-details form, the admin preview, and the PDF generator.

// The payer. Prize invoices are issued by the creator to the company.
// This is only the fallback: admins edit the block per invoice and can save
// their own default (app_settings key 'invoice_bill_to').
export const DEFAULT_BILL_TO = `Tryp.com ApS
CVR number: 42533165
Dronningens Tværgade 7, 1302 Copenhagen K
Email: andre@tryp.com`

export const EMPTY_PAYEE = {
  currency: '',
  name: '',
  bank: '',
  sortCode: '',
  accountNumber: '',
  iban: '',
  bic: '',
  address: '',
}

/** creator_private row -> payee object the UI works with. */
export function payeeFromPrivate(row) {
  return {
    currency: row?.pay_currency || '',
    name: row?.pay_name || '',
    bank: row?.pay_bank || '',
    sortCode: row?.pay_sort_code || '',
    accountNumber: row?.pay_account_number || '',
    iban: row?.pay_iban || '',
    bic: row?.pay_bic || '',
    address: row?.pay_address || '',
  }
}

/** payee object -> creator_private pay_* columns. */
export function payeeToPrivate(p) {
  return {
    pay_currency: p.currency || null,
    pay_name: p.name?.trim() || null,
    pay_bank: p.bank?.trim() || null,
    pay_sort_code: cleanDigits(p.sortCode) || null,
    pay_account_number: cleanDigits(p.accountNumber) || null,
    pay_iban: cleanIban(p.iban) || null,
    pay_bic: (p.bic || '').replace(/\s+/g, '').toUpperCase() || null,
    pay_address: p.address?.trim() || null,
  }
}

export function cleanDigits(v = '') {
  return String(v).replace(/\D/g, '')
}

export function cleanIban(v = '') {
  return String(v).replace(/\s+/g, '').toUpperCase()
}

/** "123456" -> "12-34-56" for display. */
export function formatSortCode(v = '') {
  const d = cleanDigits(v).slice(0, 6)
  return d.replace(/(\d{2})(?=\d)/g, '$1-')
}

/** Group an IBAN in blocks of 4 for display. */
export function formatIban(v = '') {
  return cleanIban(v).replace(/(.{4})(?=.)/g, '$1 ')
}

export function invoiceRef(number) {
  return `Tryp.com ${invoiceNo(number)}`
}

/** Just the padded counter: 1 -> "001" (shown as #001 on the invoice). */
export function invoiceNo(number) {
  return String(number ?? 0).padStart(3, '0')
}

/** Invoice amounts always show 2 decimals so the preview and PDF match. */
export function invoiceMoney(amount, currency) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency || 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0)
}

/** The rows shown in the "Pay to" box, per currency. */
export function paymentRows(p = {}) {
  const rows = [['Account holder', p.name], ['Bank', p.bank]]
  if (p.currency === 'EUR') {
    rows.push(['IBAN', formatIban(p.iban)])
    rows.push(['BIC / SWIFT', p.bic])
  } else {
    rows.push(['Sort code', formatSortCode(p.sortCode)])
    rows.push(['Account number', p.accountNumber])
  }
  return rows.filter(([, v]) => v)
}

/**
 * Validate a payee. Returns a list of problems (empty = valid).
 * Every field is required: UK payments need a 6-digit sort code + 8-digit
 * account number; euro payments go over SEPA and need an IBAN + BIC.
 */
export function validatePayee(p = {}) {
  const problems = []
  if (!p.currency) problems.push('Choose whether you want to be paid in pounds or euros.')
  if (!p.name?.trim()) problems.push('Add the account holder’s full name.')
  if (!p.bank?.trim()) problems.push('Add the bank’s name.')
  if (p.currency === 'GBP') {
    if (cleanDigits(p.sortCode).length !== 6) problems.push('The sort code should be 6 digits (e.g. 12-34-56).')
    if (cleanDigits(p.accountNumber).length !== 8) problems.push('The account number should be 8 digits.')
  }
  if (p.currency === 'EUR') {
    const iban = cleanIban(p.iban)
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) problems.push('That IBAN doesn’t look right (it starts with a 2-letter country code, e.g. IE64...).')
    const bic = (p.bic || '').replace(/\s+/g, '').toUpperCase()
    if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) problems.push('Add the BIC / SWIFT code (8 or 11 characters).')
  }
  if (!p.address?.trim()) problems.push('Add the billing address (it appears on the invoice).')
  return problems
}

/** True once every required bank field for the chosen currency is present. */
export function payeeComplete(p = {}) {
  return !!p.currency && validatePayee(p).length === 0
}

/** Has the creator started filling anything in? (Used to soft-gate saving.) */
export function payeeStarted(p = {}) {
  return !!(p.currency || p.name || p.sortCode || p.accountNumber || p.iban || p.bic)
}
