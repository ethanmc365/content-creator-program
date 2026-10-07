import { describe, it, expect, vi, beforeEach } from 'vitest'

// Every `.in('source_hash', ...)` the cache lookup sends, so a test can count the requests.
const sent = vi.hoisted(() => [])
vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: (_col, hashes) => {
            sent.push(hashes)
            // Pretend every text is cached and reads the same in the reader's language.
            return Promise.resolve({ data: hashes.map((h) => ({ source_hash: h, value: 'x', same: true, auto: true, src_lang: 'pt' })) })
          },
        }),
      }),
    }),
    rpc: () => Promise.resolve({}),
    functions: { invoke: () => Promise.resolve({ data: null, error: new Error('off') }) },
  },
}))
vi.mock('./quickTranslate', () => ({ translateInBrowser: () => Promise.reject(new Error('off')) }))

import { translateTexts } from './contentTranslate'

describe('translateTexts cache lookups', () => {
  beforeEach(() => { sent.length = 0 })

  it('merges the lookups a page asks for at once into one request', async () => {
    const res = await Promise.all([
      translateTexts(['Brief one'], 'es'),
      translateTexts(['Brief two'], 'es'),
      translateTexts(['Brief three', 'Brief one'], 'es'),
    ])
    expect(sent).toHaveLength(1)
    expect(new Set(sent[0]).size).toBe(3)
    expect(res[2]['Brief one']).toBeTruthy()
  })

  it('does not ask again for a text it already has', async () => {
    await translateTexts(['Kept text'], 'de')
    await translateTexts(['Kept text'], 'de')
    expect(sent).toHaveLength(1)
  })

  it('splits a long page into chunks so the URL stays short', async () => {
    const many = Array.from({ length: 130 }, (_, i) => `Line ${i}`)
    await translateTexts(many, 'ro')
    expect(sent.length).toBe(3)
    expect(sent.every((c) => c.length <= 60)).toBe(true)
  })
})
