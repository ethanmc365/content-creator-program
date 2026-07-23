import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// Mock the auth context so we can drive the guard with different profiles.
let authValue
vi.mock('../context/AuthContext', () => ({ useAuth: () => authValue }))
// Avoid pulling the real Supabase client into the test. Any query chain
// (from().select().eq()… / update()… / insert()…) resolves to empty data, so
// components that fetch on mount (e.g. ConnectGate) render without crashing.
vi.mock('../lib/supabase', () => {
  const chain = new Proxy(function () {}, {
    get: (_t, prop) =>
      prop === 'then'
        ? (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej)
        : () => chain,
    apply: () => chain,
  })
  return { supabase: { from: () => chain, auth: { signOut: vi.fn() } } }
})

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
    expect(screen.getByText(/on its way/i)).toBeInTheDocument()
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

  it('renders the app for an active member (past the connect gate)', () => {
    authValue = { ...base, user: { id: '1' }, profile: { name: 'A', onboarded: true, status: 'active', connect_gate_done: true } }
    renderAt('/home')
    expect(screen.getByText('SECRET APP')).toBeInTheDocument()
  })

  it('renders the app straight away for an admin (no connect gate)', () => {
    authValue = { ...base, user: { id: '1' }, profile: { name: 'A', onboarded: true, status: 'active', is_admin: true } }
    renderAt('/home')
    expect(screen.getByText('SECRET APP')).toBeInTheDocument()
  })

  it('holds a newly approved member at the connect gate, not the app', () => {
    authValue = { ...base, user: { id: '1' }, profile: { name: 'A', onboarded: true, status: 'active', connect_gate_done: false } }
    renderAt('/home')
    expect(screen.queryByText('SECRET APP')).toBeNull()
  })

  it('shows the retry screen (not /login) on a transient profile error', () => {
    authValue = { ...base, user: { id: '1' }, profile: null, profileError: true }
    renderAt('/home')
    expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument()
    expect(screen.queryByText('LOGIN PAGE')).toBeNull()
  })
})
