import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveDraft, clearDraft, listDrafts, loadDraft, DRAFTS_EVENT } from './drafts'

describe('drafts', () => {
  beforeEach(() => localStorage.clear())

  it('lists dm drafts newest first and drops emptied ones', () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1000); saveDraft('dm-a', 'hello')
    now.mockReturnValue(5000); saveDraft('dm-to-b', 'first hi')
    saveDraft('room-x', 'not a dm')
    expect(listDrafts('dm-').map((d) => d.key)).toEqual(['dm-to-b', 'dm-a'])
    saveDraft('dm-a', '   ')
    expect(listDrafts('dm-').map((d) => d.key)).toEqual(['dm-to-b'])
    expect(loadDraft('dm-a')).toBe('')
    now.mockRestore()
  })

  it('announces a draft starting and ending, not every keystroke', () => {
    const seen = []
    const on = (e) => seen.push(e.detail.key)
    window.addEventListener(DRAFTS_EVENT, on)
    saveDraft('dm-a', 'h'); saveDraft('dm-a', 'he'); saveDraft('dm-a', 'hey')
    clearDraft('dm-a'); clearDraft('dm-a')
    window.removeEventListener(DRAFTS_EVENT, on)
    expect(seen).toEqual(['dm-a', 'dm-a'])
  })
})
