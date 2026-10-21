import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls = []
let answer = { data: [{ id: 'a' }], error: null }
vi.mock('../api/profiles', () => {
  const builder = () => {
    const b = { select: (cols) => { calls.push(cols); return b }, eq: () => b, in: () => b, is: () => b,
      then: (ok, bad) => Promise.resolve(answer).then(ok, bad) }
    return b
  }
  return { profilesApi: { profiles: builder } }
})
vi.mock('./testData', () => ({ testFlags: () => [false] }))

const { loadRoster, clearRoster, ROSTER_COLUMNS } = await import('./roster')
const { sameJson } = await import('../context/AuthContext')

describe('loadRoster', () => {
  beforeEach(() => { calls.length = 0; clearRoster(); answer = { data: [{ id: 'a' }], error: null } })

  it('reads the table once for every card on a visit', async () => {
    const [a, b] = await Promise.all([loadRoster(), loadRoster()])
    expect(calls).toEqual([ROSTER_COLUMNS])
    expect(a.data).toBe(b.data)
  })

  it('reads again once the copy is five minutes old, or after clearRoster', async () => {
    const t = Date.now()
    await loadRoster({ now: t })
    await loadRoster({ now: t + 6 * 60 * 1000 })
    clearRoster()
    await loadRoster()
    expect(calls).toHaveLength(3)
  })

  it('does not remember a failed read', async () => {
    answer = { data: null, error: { message: 'offline' } }
    expect((await loadRoster()).data).toBeNull()
    answer = { data: [{ id: 'b' }], error: null }
    expect((await loadRoster()).data).toEqual([{ id: 'b' }])
    expect(calls).toHaveLength(2)
  })

  it('carries every column the home cards read, and not the long about text', () => {
    for (const c of ['countries_visited', 'city_lat', 'languages', 'instagram_url', 'last_seen_at', 'is_admin', 'bio']) {
      expect(ROSTER_COLUMNS).toContain(c)
    }
    expect(ROSTER_COLUMNS).not.toContain('about')
  })
})

describe('sameJson', () => {
  it('treats equal content as the same, so React keeps the old object', () => {
    expect(sameJson({ id: 1, a: [1] }, { id: 1, a: [1] })).toBe(true)
    expect(sameJson({ id: 1 }, { id: 2 })).toBe(false)
    expect(sameJson(null, null)).toBe(true)
    expect(sameJson(null, { id: 1 })).toBe(false)
  })
})
