import { describe, it, expect, vi } from 'vitest'
import { shareReads, _inflightSize } from './sharedReads'

const REST = 'https://x.supabase.co/rest/v1/profiles?select=id'
const auth = (t) => ({ headers: { Authorization: `Bearer ${t}`, apikey: 'k' } })

function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

describe('shareReads', () => {
  it('sends one request for the same read asked twice at once, and both callers get the body', async () => {
    const d = deferred()
    const base = vi.fn(() => d.promise)
    const f = shareReads(base)
    const a = f(REST, { method: 'GET', ...auth('u1') })
    const b = f(REST, { method: 'GET', ...auth('u1') })
    d.resolve(new Response('[1]'))
    expect(await (await a).json()).toEqual([1])
    expect(await (await b).json()).toEqual([1])
    expect(base).toHaveBeenCalledTimes(1)
  })

  it('forgets the request once it has landed', async () => {
    const base = vi.fn(async () => new Response('[]'))
    const f = shareReads(base)
    await f(REST, { method: 'GET', ...auth('u1') })
    expect(_inflightSize()).toBe(0)
    await f(REST, { method: 'GET', ...auth('u1') })
    expect(base).toHaveBeenCalledTimes(2)
  })

  it('never shares between users, between a count and rows, or between one row and a list', async () => {
    const base = vi.fn(() => new Promise(() => {}))
    const f = shareReads(base)
    f(REST, { method: 'GET', ...auth('u1') })
    f(REST, { method: 'GET', ...auth('u2') })
    f(REST, { method: 'HEAD', ...auth('u1') })
    f(REST, { method: 'GET', headers: { Authorization: 'Bearer u1', apikey: 'k', Prefer: 'count=exact' } })
    f(REST, { method: 'GET', headers: { Authorization: 'Bearer u1', apikey: 'k', Accept: 'application/vnd.pgrst.object+json' } })
    expect(base).toHaveBeenCalledTimes(5)
  })

  it('leaves writes, RPCs, other services and cancellable reads alone', async () => {
    const base = vi.fn(() => new Promise(() => {}))
    const f = shareReads(base)
    f('https://x.supabase.co/rest/v1/rpc/thing', { method: 'POST', body: '{}' })
    f('https://x.supabase.co/rest/v1/rpc/thing', { method: 'POST', body: '{}' })
    f('https://x.supabase.co/auth/v1/user', { method: 'GET' })
    f('https://x.supabase.co/auth/v1/user', { method: 'GET' })
    const ctrl = new AbortController()
    f(REST, { method: 'GET', signal: ctrl.signal, ...auth('u1') })
    f(REST, { method: 'GET', signal: ctrl.signal, ...auth('u1') })
    expect(base).toHaveBeenCalledTimes(6)
  })

  it('a read issued after a write never joins one that left before it', async () => {
    const before = deferred()
    const base = vi.fn()
      .mockImplementationOnce(() => before.promise)
      .mockImplementationOnce(async () => new Response('{}'))
      .mockImplementationOnce(async () => new Response('[2]'))
    const f = shareReads(base)
    const old = f(REST, { method: 'GET', ...auth('u1') })
    await f('https://x.supabase.co/rest/v1/profiles?id=eq.1', { method: 'PATCH', body: '{}' })
    const fresh = f(REST, { method: 'GET', ...auth('u1') })
    before.resolve(new Response('[1]'))
    expect(await (await old).json()).toEqual([1])
    expect(await (await fresh).json()).toEqual([2])
    expect(base).toHaveBeenCalledTimes(3)
  })

  it('passes a failure to every caller', async () => {
    const d = deferred()
    const base = vi.fn(() => d.promise.then(() => { throw new TypeError('offline') }))
    const f = shareReads(base)
    const a = f(REST, { method: 'GET', ...auth('u1') })
    const b = f(REST, { method: 'GET', ...auth('u1') })
    d.resolve()
    await expect(a).rejects.toThrow('offline')
    await expect(b).rejects.toThrow('offline')
    expect(_inflightSize()).toBe(0)
  })
})
