import { describe, it, expect, vi, afterEach } from 'vitest'
import { saved, _setConfirmHandler } from './confirm'

describe('saved', () => {
  afterEach(() => _setConfirmHandler(null))

  it('resolves true and shows nothing when the write worked', async () => {
    const handler = vi.fn()
    _setConfirmHandler(handler)
    expect(await saved(Promise.resolve({ error: null }))).toBe(true)
    expect(handler).not.toHaveBeenCalled()
  })

  it('tells the person and resolves false when the write was refused', async () => {
    const handler = vi.fn(() => Promise.resolve(true))
    _setConfirmHandler(handler)
    expect(await saved(Promise.resolve({ error: { message: 'denied' } }))).toBe(false)
    expect(handler).toHaveBeenCalledWith('That did not save. Check your connection and try again.', expect.objectContaining({ noCancel: true }))
    await saved(Promise.resolve({ error: {} }), 'Custom message')
    expect(handler).toHaveBeenLastCalledWith('Custom message', expect.anything())
  })
})
