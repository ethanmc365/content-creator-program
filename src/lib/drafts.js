// Persist a half-written message so it survives navigating away and back.
// Keyed per target (a DM conversation, a chat channel), stored in localStorage.
// Save on every keystroke with the CURRENT key (so switching targets never
// mixes drafts), load when the target changes, and clear once it's sent.
const PREFIX = 'tryp_draft_'

export function loadDraft(key) {
  if (!key) return ''
  try { return localStorage.getItem(PREFIX + key) || '' } catch { return '' }
}

export function saveDraft(key, value) {
  if (!key) return
  try {
    if (value && value.trim()) localStorage.setItem(PREFIX + key, value)
    else localStorage.removeItem(PREFIX + key)
  } catch { /* ignore (private mode / quota) */ }
}

export function clearDraft(key) {
  if (!key) return
  try { localStorage.removeItem(PREFIX + key) } catch { /* ignore */ }
}
