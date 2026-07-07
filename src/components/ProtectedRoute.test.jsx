import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// Mock the auth context so we can drive the guard with different profiles.
let authValue
vi.mock('../context/AuthContext', () => ({ useAuth: () => authValue }))
// Avoid pulling the real Supabase client into the test.
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({ update: () => ({ eq: () => Promise.resolve({}) }) }), auth: { signOut: vi.fn() } } }))

import { ProtectedRoute } from './ProtectedRoute'

function renderAt(path = '/home') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/home" element={<div>SECRET APP</div>} />
          <Route path="/onboarding" element={<div>ONBOARDING</div>} />
        </Route>
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
      </Routes>
    </MemoryRouter>
  )
}

const base = {
  loading: false, profileLoaded: true, profileError: false, isSuspended: false,
  signOut: vi.fn(), refreshProfile: vi.fn(), retryProfile: vi.fn(),
}

describe('ProtectedRoute default-deny', () => {
  beforeEach(() => { authValue = { ...base } })

  it('does NOT render the app for a pending (unapproved) creator', () => {
    authValue = { ...base, user: { id: '1' }, profile: { name: 'A', onboarded: true, status: 'pending' } }
    renderAt('/home')
    expect(screen.queryByText('SECRET APP')).toBeNull()
    expect(screen.getByText(/being reviewed/i)).toBeInTheDocument()
  })

  it('does NOT render the app while the profile is still loading', () => {
    authValue = { ...base, user: { id: '1' }, profile: null, profileLoaded: false }
    renderAt('/home')
    expect(screen.queryByText('SECRET APP')).toBeNull()
  })

  it('sends a signed-in user with no profile row to /login (fail closed)', () => {
    authValue = { ...base, user: { id: '1' }, profile: null }
    renderAt('/home')
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument()
    expect(screen.queryByText('SECRET APP')).toBeNull()
  })

  it('forces an un-onboarded user into onboarding', () => {
    authValue = { ...base, user: { id: '1' }, profile: { name: 'A', onboarded: false, status: 'pending' } }
    renderAt('/home')
    expect(screen.getByText('ONBOARDING')).toBeInTheDocument()
    expect(screen.queryByText('SECRET APP')).toBeNull()
  })

  it('renders the app for an active member', () => {
    authValue = { ...base, user: { id: '1' }, profile: { name: 'A', onboarded: true, status: 'active' } }
    renderAt('/home')
    expect(screen.getByText('SECRET APP')).toBeInTheDocument()
  })

  it('shows the retry screen (not /login) on a transient profile error', () => {
    authValue = { ...base, user: { id: '1' }, profile: null, profileError: true }
    renderAt('/home')
    expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument()
    expect(screen.queryByText('LOGIN PAGE')).toBeNull()
  })
})
