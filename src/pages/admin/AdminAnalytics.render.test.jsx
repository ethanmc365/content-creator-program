import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import AdminAnalytics from './AdminAnalytics'

describe('analytics initial render', () => {
  it('renders the seven-day overview before any data effects run', () => {
    // Server rendering exercises every initial hook without running network effects.
    const warning = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const html = renderToString(<MemoryRouter initialEntries={['/admin/analytics?period=last_7']}><AdminAnalytics /></MemoryRouter>)
      expect(html).toContain('Analytics')
      expect(html).toContain('Weekly views')
    } finally { warning.mockRestore() }
  })
})
