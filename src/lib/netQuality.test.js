import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A fresh module per test: the slow/fast state is module-level.
async function fresh() {
  vi.resetModules()
  return import('./netQuality')
}

describe('slow-network detection', () => {
  it('stays fast until a few slow reads say otherwise, and recovers', async () => {
    const q = await fresh()
    for (let i = 0; i < 4; i += 1) q.recordRequest(3000)
    expect(q.isSlowNetwork()).toBe(false) // four samples are not a verdict
    q.recordRequest(3000)
    expect(q.isSlowNetwork()).toBe(true)
    for (let i = 0; i < 12; i += 1) q.recordRequest(80)
    expect(q.isSlowNetwork()).toBe(false)
  })

  it('a fast connection with one slow outlier is still fast', async () => {
    const q = await fresh()
    for (let i = 0; i < 6; i += 1) q.recordRequest(120)
    q.recordRequest(2500)
    expect(q.isSlowNetwork()).toBe(false)
  })
})

describe('resilientFetch', () => {
  let realFetch
  beforeEach(() => { realFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = realFetch })

  it('retries a database read once when the network fails', async () => {
    const q = await fresh()
    const ok = new Response('[]', { status: 200 })
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce(ok)
    const res = await q.resilientFetch('https://x.supabase.co/rest/v1/challenges?select=*', { method: 'GET' })
    expect(res).toBe(ok)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('never retries a write', async () => {
    const q = await fresh()
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Load failed'))
    await expect(q.resilientFetch('https://x.supabase.co/rest/v1/messages', { method: 'POST', body: '{}' })).rejects.toThrow()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('does not retry a read the caller cancelled', async () => {
    const q = await fresh()
    const ctrl = new AbortController()
    globalThis.fetch = vi.fn().mockImplementation(() => { ctrl.abort(); return Promise.reject(new DOMException('Aborted', 'AbortError')) })
    await expect(q.resilientFetch('https://x.supabase.co/rest/v1/results', { method: 'GET', signal: ctrl.signal })).rejects.toThrow()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })
})
