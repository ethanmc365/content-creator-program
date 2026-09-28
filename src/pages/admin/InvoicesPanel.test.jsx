import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// The two things Ethan asked for on 28 Sep 2026, and the two things that are
// easiest to break again: an invoice for somebody who is not on the platform,
// and an amount box that wears the sign of the currency the invoice is in.

const creatorPrivate = { pay_currency: null }

function builder(rows) {
  const q = {
    select: () => q,
    eq: () => q,
    order: () => Promise.resolve({ data: rows, error: null }),
    maybeSingle: () => Promise.resolve({ data: rows, error: null }),
    single: () => Promise.resolve({ data: rows, error: null }),
    then: (res) => Promise.resolve({ data: rows, error: null }).then(res),
  }
  return q
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => builder(
      table === 'profiles' ? [{ id: 'c1', name: 'Rita Albino' }]
        : table === 'creator_private' ? creatorPrivate
        : null,
    ),
    rpc: () => Promise.resolve({ data: 12, error: null }),
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'x' } } }) },
  },
}))
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', email: 'ethan@tryp.com' }, profile: { name: 'Ethan' } }),
}))
vi.mock('../../lib/invoicePdf', () => ({
  downloadInvoicePdf: vi.fn(() => Promise.resolve()),
  invoiceFilename: () => 'inv.pdf',
}))

const InvoicesPanel = (await import('./InvoicesPanel')).default

beforeEach(() => {
  // The ECB rate the composer converts with.
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ rates: { EUR: 1.2 } }) })))
})

async function open() {
  const view = render(<InvoicesPanel prefill={{ key: 'blank-1', creatorId: '' }} onClose={() => {}} />)
  await screen.findByLabelText('Creator')
  return view
}

async function pickOffPlatform() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Creator' }))
  fireEvent.click(await screen.findByText('Someone not on the platform'))
}

describe('the invoice composer', () => {
  it('offers a creator who is not on the platform, and takes their name', async () => {
    await open()
    expect(screen.queryByLabelText('Creator name')).toBeNull()
    await pickOffPlatform()

    const name = await screen.findByLabelText('Creator name')
    fireEvent.change(name, { target: { value: 'Marta Oliveira' } })
    // The name reaches the document, which is the whole point of typing it.
    // (The preview uppercases it in CSS, so the text node is as typed.)
    expect(await screen.findAllByText('Marta Oliveira')).not.toHaveLength(0)
  })

  it('writes the amount in euros by default, and switches to pounds on request', async () => {
    await open()
    await pickOffPlatform()

    // EUROS UNLESS TOLD OTHERWISE - and the box says so, which is the bug:
    // "this one seems to be in euros, but it's still showing the pound sign."
    //
    // THE CURRENCY IS NOT READ OFF THE LABEL ANY MORE (28 Sep 2026). It used to
    // say "Prize amount (€)" and this test asserted on that, which made the
    // label the thing under test rather than the behaviour. Ethan had the symbol
    // removed from the heading - the switch and the box both say it already - so
    // the assertion is now on the switch's own pressed state and on the totals.
    expect(screen.getByLabelText('Prize amount')).toBeTruthy()
    expect(screen.getByRole('button', { name: '€ EUR' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(screen.getByLabelText('Prize amount'), { target: { value: '120' } })
    expect(await screen.findAllByText('€120.00')).not.toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: '£ GBP' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '£ GBP' }).getAttribute('aria-pressed')).toBe('true'))
    // Switching converts what was already typed rather than dropping it.
    expect(screen.getByLabelText('Prize amount').value).toBe('100.00')
    expect(await screen.findAllByText('£100.00')).not.toHaveLength(0)
  })
})

// THE CONVERSION NOTE, both halves of it.
//
// Ethan: "when I click on GBP, it shows £20 in the invoice, which is correct,
// but then it shows 'converted from €23 at today's European Central Bank rate'.
// That doesn't really make sense. It shouldn't be showing up." And then: "if a
// creator with UK details wins a euro prize, it should be converted to pounds."
describe('converting a prize', () => {
  const NOTE = /Converted from/

  async function openReward({ amount, sourceCurrency }) {
    render(<InvoicesPanel prefill={{ key: `r-${amount}-${sourceCurrency}`, creatorId: 'c1', amount, sourceCurrency }} onClose={() => {}} />)
    await screen.findByLabelText('Creator')
    return screen.getByLabelText('Prize amount')
  }

  it('converts a sterling prize into euros and says where the figure came from', async () => {
    const box = await openReward({ amount: 20, sourceCurrency: 'GBP' })
    await waitFor(() => expect(box.value).toBe('24.00'))  // 20 x 1.2
    expect(screen.getByText(NOTE).textContent).toContain('£20.00')
    expect(screen.getByText(NOTE).textContent).toContain('£1 = €1.2')
  })

  // The bug: back in the prize's own currency there is nothing to explain.
  it('says nothing at all once it is back in the currency the prize was awarded in', async () => {
    const box = await openReward({ amount: 20, sourceCurrency: 'GBP' })
    await waitFor(() => expect(box.value).toBe('24.00'))
    fireEvent.click(screen.getByRole('button', { name: '£ GBP' }))
    await waitFor(() => expect(box.value).toBe('20.00'))
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  // The half that did not exist: a euro prize, a creator who banks in pounds.
  it('converts a euro prize into pounds and quotes the rate that way round', async () => {
    const box = await openReward({ amount: 60, sourceCurrency: 'EUR' })
    await waitFor(() => expect(box.value).toBe('60.00'))
    expect(screen.queryByText(NOTE)).toBeNull()   // euro prize, euro invoice
    fireEvent.click(screen.getByRole('button', { name: '£ GBP' }))
    await waitFor(() => expect(box.value).toBe('50.00'))  // 60 / 1.2
    expect(screen.getByText(NOTE).textContent).toContain('€60.00')
    expect(screen.getByText(NOTE).textContent).toContain('€1 = £0.8333')
  })

  // Going back must give the prize, not the prize divided and multiplied.
  it('returns the exact prize on a round trip', async () => {
    const box = await openReward({ amount: 20, sourceCurrency: 'GBP' })
    await waitFor(() => expect(box.value).toBe('24.00'))
    fireEvent.click(screen.getByRole('button', { name: '£ GBP' }))
    await waitFor(() => expect(box.value).toBe('20.00'))
    fireEvent.click(screen.getByRole('button', { name: '€ EUR' }))
    await waitFor(() => expect(box.value).toBe('24.00'))
    fireEvent.click(screen.getByRole('button', { name: '£ GBP' }))
    await waitFor(() => expect(box.value).toBe('20.00'))
  })
})

