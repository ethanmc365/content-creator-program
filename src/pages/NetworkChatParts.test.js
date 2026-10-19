import { describe, expect, it } from 'vitest'
import { keepUnchanged, sameReads } from './NetworkChatParts'

describe('keepUnchanged', () => {
  it('keeps the old object for a row that has not changed, and takes the new one for a row that has', () => {
    const a = { id: 1, body: 'hi', profiles: { id: 'p', name: 'Ana' } }
    const b = { id: 2, body: 'yo', profiles: { id: 'q', name: 'Bo' } }
    const out = keepUnchanged([a, b], [{ ...a, profiles: { ...a.profiles } }, { ...b, body: 'edited' }, { id: 3, body: 'new' }])
    expect(out[0]).toBe(a)
    expect(out[1]).not.toBe(b)
    expect(out[1].body).toBe('edited')
    expect(out[2].id).toBe(3)
  })
  it('returns the fresh list when there was nothing before', () => {
    const next = [{ id: 1 }]
    expect(keepUnchanged(undefined, next)).toBe(next)
  })
})

describe('sameReads', () => {
  it('compares receipts by content', () => {
    expect(sameReads(new Map([['a', 't1']]), new Map([['a', 't1']]))).toBe(true)
    expect(sameReads(new Map([['a', 't1']]), new Map([['a', 't2']]))).toBe(false)
    expect(sameReads(new Map(), new Map([['a', 't1']]))).toBe(false)
  })
})
