import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { buildChallengeCards, ChallengeShareCard } from './challengeStory'
import { buildChallengeRecap } from '../../lib/challengeRecap'

const challenge = { id: 'c', title: 'Global Challenge', scoring: 'points', start_date: '2026-09-01', end_date: '2026-09-21', prize_amount: 500, prize_currency: 'EUR' }
const me = { id: 'me', name: 'Jacob Oliveira-Pereira', photo_url: null }
const subs = [
  { id: '1', creator_id: 'me', logged_views: 12000, platform: 'TikTok', video_url: 'x', submitted_at: '2026-09-02T10:00:00Z' },
  { id: '2', creator_id: 'me', logged_views: 8000, platform: 'Instagram', video_url: 'x', submitted_at: '2026-09-05T10:00:00Z' },
  { id: '3', creator_id: 'me', logged_views: 3000, platform: 'YouTube', video_url: 'x', submitted_at: '2026-09-06T10:00:00Z' },
  { id: '4', creator_id: 'b', logged_views: 1000, platform: 'TikTok', video_url: 'x', submitted_at: '2026-09-03T10:00:00Z' },
  { id: '5', creator_id: 'c', logged_views: 500, platform: 'TikTok', video_url: 'x', submitted_at: '2026-09-03T10:00:00Z' },
]
const results = [{ creator_id: 'me', rank: 2, final_views: 29 }, { creator_id: 'b', rank: 1, final_views: 40 }, { creator_id: 'c', rank: 3, final_views: 3 }]

describe('challenge recap cards', () => {
  it('renders every card and the share card', () => {
    const data = { ...buildChallengeRecap({ challenge, me, submissions: subs, results, rewards: [{ amount: 50, currency: 'EUR', reward_type: 'cash' }] }), prizes: { total: 620, vouchers: 120 } }
    const cards = buildChallengeCards(data)
    const keys = cards.map((c) => c.key)
    // No 'facts' card: "Your challenge in numbers" was removed on 28 Sep 2026
    // because every figure on it had already been said by an earlier card.
    expect(keys).toEqual(['open', 'place', 'totals', 'top-3', 'top-2', 'top-1', 'top-all', 'won', 'together'])
    for (const c of cards) {
      const { container } = render(<MemoryRouter>{c.render()}</MemoryRouter>)
      expect(container.textContent.length).toBeGreaterThan(5)
    }
    const { container } = render(<MemoryRouter><ChallengeShareCard data={data} /></MemoryRouter>)
    expect(container.textContent).toContain('Global Challenge')
    expect(container.textContent).toContain('2nd')
    const together = render(<MemoryRouter>{cards.find((c) => c.key === 'together').render()}</MemoryRouter>)
    expect(together.container.textContent).toContain('vouchers')
  })
})
