import { describe, it, expect } from 'vitest'
import { hookTier, pickHook } from './hooks'

const H = [
  { id: 'a', uses: 24 }, { id: 'b', uses: 9 }, { id: 'c', uses: 4 },
  { id: 'd', uses: 2 }, { id: 'e', uses: 1 }, { id: 'f', uses: 1 },
]

describe('hook tiers', () => {
  it('ranks by uses', () => {
    expect(hookTier(24).key).toBe('proven')
    expect(hookTier(3).key).toBe('validated')
    expect(hookTier(2).key).toBe('promising')
    expect(hookTier(1).key).toBe('fresh')
    expect(hookTier(null).key).toBe('fresh')
  })
})

describe('pickHook', () => {
  it('deals the proven hooks first, at random among them', () => {
    const first = pickHook(H, new Set(), () => 0).hook.id
    const second = pickHook(H, new Set(), () => 0.99).hook.id
    expect(['a', 'b']).toContain(first)
    expect(['a', 'b']).toContain(second)
    expect(first).not.toBe(second)
  })

  it('moves down a tier only once the one above has been seen', () => {
    expect(pickHook(H, new Set(['a', 'b'])).hook.id).toBe('c')
    expect(pickHook(H, ['a', 'b', 'c']).hook.id).toBe('d')
    expect(['e', 'f']).toContain(pickHook(H, ['a', 'b', 'c', 'd']).hook.id)
  })

  it('starts again when everything has been seen', () => {
    const r = pickHook(H, H.map((h) => h.id), () => 0)
    expect(r.reset).toBe(true)
    expect(['a', 'b']).toContain(r.hook.id)
  })

  it('survives an empty bank', () => {
    expect(pickHook([], new Set()).hook).toBeNull()
    expect(pickHook(null).hook).toBeNull()
  })
})
