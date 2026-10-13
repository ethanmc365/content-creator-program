import { describe, it, expect, vi } from 'vitest'
import { classify, watchLoads, onLoadTrouble, clearLoadFailure } from './loadTrouble'

const REST = 'https://x.supabase.co/rest/v1/'

describe('loadTrouble', () => {
  it('flags failed reads only', () => {
    expect(classify(`${REST}profiles?select=*`, 'GET', 500)).toBe(true)
    expect(classify(`${REST}profiles?select=*`, 'GET', 400)).toBe(true)
    expect(classify(`${REST}profiles?select=*`, 'GET', 200)).toBe(false)
    expect(classify(`${REST}profiles?select=*`, 'GET', 406)).toBe(false)
    expect(classify(`${REST}rpc/vip_submit_video`, 'POST', 400)).toBe(false)
    expect(classify(`${REST}rpc/vip_board`, 'POST', 503)).toBe(true)
    expect(classify(`${REST}profiles`, 'PATCH', 500)).toBe(false)
    expect(classify('https://x.supabase.co/auth/v1/token', 'POST', 500)).toBe(false)
  })
  it('reports a network failure and rethrows it', async () => {
    clearLoadFailure()
    const seen = vi.fn()
    const off = onLoadTrouble(seen)
    const f = watchLoads(() => Promise.reject(new TypeError('Failed to fetch')))
    await expect(f(`${REST}events`, {})).rejects.toThrow('Failed to fetch')
    expect(seen).toHaveBeenCalledWith(true)
    off()
  })
})
