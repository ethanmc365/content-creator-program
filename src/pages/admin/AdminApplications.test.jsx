import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: [] }) } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, profile: { id: 'me' } }) }))

const { ApplicationCard } = await import('./AdminApplications')

// "Whenever I click on the travel photos it doesn't do anything" (24 Sep 2026).
// Each photo is a button that asks the page to open the viewer at ITS index.
describe('ApplicationCard travel photos', () => {
  it('opens the pressed photo, and the +N tile opens the ninth', () => {
    const onZoomPhoto = vi.fn()
    const photos = Array.from({ length: 10 }, (_, i) => `https://x.test/${i}.jpg`)
    render(
      <MemoryRouter>
        <ApplicationCard
          app={{ id: 'a', name: 'Rita Albino', status: 'pending', languages: [] }}
          photos={photos} links={[]} markets={[]} placeIn={[]} onPlaceIn={() => {}}
          languageHints={[]} marketLanguages={new Set()} marketsSpeaking={{}}
          onToggle={() => {}} onApprove={() => {}} onDecline={() => {}} onZoom={() => {}}
          onZoomPhoto={onZoomPhoto} onSelect={() => {}}
        />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'See travel photo 3 full size' }))
    expect(onZoomPhoto).toHaveBeenLastCalledWith(expect.anything(), 2)
    fireEvent.click(screen.getByRole('button', { name: '+2' }))
    expect(onZoomPhoto).toHaveBeenLastCalledWith(expect.anything(), 8)
  })
})
