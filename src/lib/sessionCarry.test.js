import { describe, it, expect, vi, beforeEach } from 'vitest'
import { carrySession, attachClient, _reset, SESSION_STORAGE_KEY } from './sessionCarry'

const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '')
const userJwt = (sub, n = 1) => `${b64({ alg: 'ES256' })}.${b64({ sub, n })}.sig`
const anonJwt = `${b64({ alg: 'HS256' })}.${b64({ role: 'anon' })}.sig`
const res = (status) => ({ status })

function client(token = userJwt('u1', 2), error = null) {
  return { auth: { refreshSession: vi.fn(async () => ({ data: { session: error ? null : { access_token: token } }, error })),
    getSession: vi.fn(async () => ({ data: { session: { access_token: token } } })) } }
}

describe('carrySession', () => {
  beforeEach(() => _reset())

  it('keeps the login exactly where supabase-js keeps it today', () => {
    expect(SESSION_STORAGE_KEY).toBe('sb-heuhqqoxyggawuckxocp-auth-token')
  })

  it('refreshes once and resends a database read refused for an old token', async () => {
    const c = client(); attachClient(c)
    const base = vi.fn().mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(200))
    const out = await carrySession(base)('https://x/rest/v1/profiles', { headers: { Authorization: `Bearer ${userJwt('u1')}` } })
    expect(out.status).toBe(200)
    expect(c.auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(base.mock.calls[1][1].headers.get('Authorization')).toBe(`Bearer ${userJwt('u1', 2)}`)
  })

  it('leaves logged-out requests, other errors and other paths alone', async () => {
    const c = client(); attachClient(c)
    const base = vi.fn().mockResolvedValue(res(401))
    const f = carrySession(base)
    await f('https://x/rest/v1/profiles', { headers: { Authorization: `Bearer ${anonJwt}` } })
    await f('https://x/auth/v1/token', { headers: { Authorization: `Bearer ${userJwt('u1')}` } })
    await f('https://x/functions/v1/upload', { headers: { Authorization: `Bearer ${userJwt('u1')}` } })
    const ok = vi.fn().mockResolvedValue(res(403))
    await carrySession(ok)('https://x/rest/v1/profiles', { headers: { Authorization: `Bearer ${userJwt('u1')}` } })
    expect(c.auth.refreshSession).not.toHaveBeenCalled()
    expect(base).toHaveBeenCalledTimes(3)
  })

  it('gives the original answer back when the refresh fails', async () => {
    attachClient(client(null, { message: 'invalid refresh token' }))
    const base = vi.fn().mockResolvedValue(res(401))
    const out = await carrySession(base)('https://x/rest/v1/x', { headers: { Authorization: `Bearer ${userJwt('u1')}` } })
    expect(out.status).toBe(401)
    expect(base).toHaveBeenCalledTimes(1)
  })

  it('shares one refresh between many refused requests', async () => {
    const c = client(); attachClient(c)
    const base = vi.fn(async (u, init) => res(init.headers instanceof Headers ? 200 : 401))
    const f = carrySession(base)
    const h = { headers: { Authorization: `Bearer ${userJwt('u1')}` } }
    const all = await Promise.all([f('https://x/rest/v1/a', h), f('https://x/rest/v1/b', h), f('https://x/storage/v1/c', h)])
    expect(all.map((r) => r.status)).toEqual([200, 200, 200])
    expect(c.auth.refreshSession).toHaveBeenCalledTimes(1)
  })
})
