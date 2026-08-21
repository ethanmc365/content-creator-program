import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// THE ONE THING ABOUT THE TESTING CENTRE THAT MUST NEVER REGRESS.
//
// It is a sandbox full of invented invoices, fake creators and a walkthrough of
// the onboarding a real applicant is in the middle of. None of that should ever
// be reachable by a creator, and "it is only linked from the admin panel" is not
// a control: /admin/testing is a URL anybody can type.
//
// So this asserts the guard itself, at the path, for each kind of account.

let authValue
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authValue }))
vi.mock('../../lib/supabase', () => {
  const chain = new Proxy(function () {}, {
    get: (_t, prop) =>
      prop === 'then'
        ? (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej)
        : () => chain,
    apply: () => chain,
  })
  return { supabase: { from: () => chain, auth: { signOut: vi.fn() } } }
})

import { AdminRoute } from '../../components/ProtectedRoute'

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AdminRoute />}>
          <Route path="/admin/testing" element={<div>TESTING CENTRE</div>} />
          <Route path="/admin/testing/:lab" element={<div>A LAB</div>} />
        </Route>
        <Route path="/home" element={<div>CREATOR HOME</div>} />
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const base = { loading: false, profileLoaded: true }

describe('the Testing Centre is admin only', () => {
  beforeEach(() => { authValue = { ...base } })

  it('bounces an ordinary creator to their home page', () => {
    authValue = { ...base, user: { id: '1' }, profile: { id: '1', is_admin: false }, isAdmin: false }
    renderAt('/admin/testing')
    expect(screen.queryByText('TESTING CENTRE')).toBeNull()
    expect(screen.getByText('CREATOR HOME')).toBeInTheDocument()
  })

  it('bounces a creator off an individual lab too, not just the hub', () => {
    authValue = { ...base, user: { id: '1' }, profile: { id: '1', is_admin: false }, isAdmin: false }
    renderAt('/admin/testing/invoice')
    expect(screen.queryByText('A LAB')).toBeNull()
    expect(screen.getByText('CREATOR HOME')).toBeInTheDocument()
  })

  it('sends a signed-out visitor to log in', () => {
    authValue = { ...base, user: null, profile: null, isAdmin: false }
    renderAt('/admin/testing')
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument()
  })

  it('shows nothing at all while the profile is still resolving', () => {
    // Without this wait a hard refresh on an admin URL decides before it knows,
    // which is a flash of the wrong answer in whichever direction it guesses.
    authValue = { ...base, user: { id: '1' }, profile: null, profileLoaded: false, isAdmin: false }
    renderAt('/admin/testing')
    expect(screen.queryByText('TESTING CENTRE')).toBeNull()
    expect(screen.queryByText('CREATOR HOME')).toBeNull()
  })

  it('lets an admin in', () => {
    authValue = { ...base, user: { id: '1' }, profile: { id: '1', is_admin: true }, isAdmin: true }
    renderAt('/admin/testing')
    expect(screen.getByText('TESTING CENTRE')).toBeInTheDocument()
  })
})
