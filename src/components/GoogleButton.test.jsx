import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// The component reads `?demo=1` (so the Testing Centre's live copy of the
// signup page cannot redirect the whole window to Google) and the profile, so
// it needs a router and an auth context around it. Neither is what is under
// test, so both are the smallest thing that satisfies them.
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }))

const inRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

// THE BUTTON IS A SWITCH SOMEBODY ELSE OWNS, AND THAT IS WHAT IS TESTED HERE.
//
// "Continue with Google" only works once a Google Cloud client has been pasted
// into the Supabase dashboard - a manual step, on an account with a password on
// it, that cannot ship in a deploy. So the component asks GoTrue whether the
// provider is actually configured and draws nothing when it is not (see
// lib/oauth). Two failure modes are worth a test because both are invisible
// until a creator hits them on the front door of the product:
//
//   a button that leads to "Unsupported provider: provider is not enabled"
//   no button at all on the day the dashboard step is finally done
//
// `lib/oauth` caches the answer at module scope, so each case resets the module
// registry - otherwise the first test's answer is the only answer.

function mockSettings(external) {
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ external }) }))
}

describe('GoogleButton', () => {
  beforeEach(() => { vi.resetModules() })
  afterEach(() => { vi.unstubAllGlobals(); delete globalThis.fetch })

  it('draws nothing while the project has no Google provider', async () => {
    mockSettings({ google: false, email: true })
    const { default: Fresh } = await import('./GoogleButton')
    const { container } = inRouter(<Fresh />)
    // Nothing now, and nothing after the answer lands either.
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(container.textContent).not.toMatch(/google/i)
  })

  it('draws the button once the provider is switched on, with no deploy', async () => {
    mockSettings({ google: true, email: true })
    const { default: Fresh } = await import('./GoogleButton')
    inRouter(<Fresh />)
    expect(await screen.findByRole('button', { name: /continue with google/i })).toBeTruthy()
  })

  it('fails closed when the settings endpoint cannot be reached', async () => {
    // A dead button on the signup page is worse than no button, so a network
    // failure must mean "no third-party sign in", never "assume it works".
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline')))
    const { default: Fresh } = await import('./GoogleButton')
    const { container } = inRouter(<Fresh />)
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(container.textContent).not.toMatch(/google/i)
  })

  it('takes the label from the caller, so signup and login can differ', async () => {
    mockSettings({ google: true })
    const { default: Fresh } = await import('./GoogleButton')
    inRouter(<Fresh label="Sign up with Google" />)
    expect(await screen.findByRole('button', { name: /sign up with google/i })).toBeTruthy()
  })
})
