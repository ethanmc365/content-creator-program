import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// THE ONE CLAIM DEMO MODE MAKES THAT HAS TO BE TRUE.
//
// `?demo=1` renders the public pages and the onboarding flow inertly so they
// can be shown inside the Testing Centre. It is a URL parameter, which means
// anybody can type it - so the flag is gated on being an admin, not on the
// parameter. A creator handed that link must get the ordinary page.
let authValue
vi.mock('../context/AuthContext', () => ({ useAuth: () => authValue }))

import { useDemoMode } from './demoMode'

function Probe() {
  const { on } = useDemoMode()
  return <span>{on ? 'DEMO' : 'REAL'}</span>
}

function renderAt(path) {
  return render(<MemoryRouter initialEntries={[path]}><Probe /></MemoryRouter>)
}

describe('useDemoMode', () => {
  it('is on for an admin who asks for it', () => {
    authValue = { isAdmin: true }
    renderAt('/signup?demo=1')
    expect(screen.getByText('DEMO')).toBeInTheDocument()
  })

  it('is OFF for a creator, however they ask', () => {
    authValue = { isAdmin: false }
    for (const path of ['/signup?demo=1', '/onboarding?demo=1&prefill=full', '/?demo=1']) {
      const { unmount } = renderAt(path)
      expect(screen.getByText('REAL')).toBeInTheDocument()
      unmount()
    }
  })

  it('is OFF for somebody signed out', () => {
    authValue = {}
    renderAt('/login?demo=1')
    expect(screen.getByText('REAL')).toBeInTheDocument()
  })

  it('is off for an admin who did not ask', () => {
    authValue = { isAdmin: true }
    renderAt('/signup')
    expect(screen.getByText('REAL')).toBeInTheDocument()
  })

  it('needs the exact value, so a truthy-looking one does not count', () => {
    authValue = { isAdmin: true }
    for (const path of ['/signup?demo=true', '/signup?demo=yes', '/signup?demo=0', '/signup?demo=']) {
      const { unmount } = renderAt(path)
      expect(screen.getByText('REAL')).toBeInTheDocument()
      unmount()
    }
  })
})
