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
  fireEvent.click(await screen.findByText('Other — someone not on the platform'))
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
    expect(screen.getByLabelText('Prize amount (€)')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Prize amount (€)'), { target: { value: '120' } })
    expect(await screen.findAllByText('€120.00')).not.toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: '£ GBP' }))
    await waitFor(() => expect(screen.getByLabelText('Prize amount (£)')).toBeTruthy())
    // Switching converts what was already typed rather than dropping it.
    expect(screen.getByLabelText('Prize amount (£)').value).toBe('100.00')
    expect(await screen.findAllByText('£100.00')).not.toHaveLength(0)
  })
})
