// Persist a half-written message so it survives navigating away and back.
// Keyed per target (a DM conversation, a chat channel), stored in localStorage.
// Save on every keystroke with the CURRENT key (so switching targets never
// mixes drafts), load when the target changes, and clear once it's sent.
//
// THE INBOX SHOWS THEM (19 Oct 2026). The team: "whenever I start writing a DM and leave it, have it show up at the very
// top as a draft, above the very first person, so I can easily go back to it." So every change is announced
// (`DRAFTS_EVENT`) and stamped with when it was last touched (`TIMES_KEY`), and `listDrafts` hands the inbox the lot,
// newest first. A draft emptied in its own chat is removed, so it leaves the inbox too.
const PREFIX = 'tryp_draft_'
const TIMES_KEY = 'tryp_draft_times'
export const DRAFTS_EVENT = 'tryp-drafts'

function readTimes() {
  try { return JSON.parse(localStorage.getItem(TIMES_KEY) || '{}') || {} } catch { return {} }
}

function stamp(key, on) {
  try {
    const times = readTimes()
    if (on) {
      // A keystroke a second is plenty: the order only needs to know which draft was touched last.
      const now = Date.now()
      if (now - (times[key] || 0) < 1000) return
      times[key] = now
    } else {
      if (!(key in times)) return
      delete times[key]
    }
    localStorage.setItem(TIMES_KEY, JSON.stringify(times))
  } catch { /* ignore */ }
}

function announce(key) {
  try { window.dispatchEvent(new CustomEvent(DRAFTS_EVENT, { detail: { key } })) } catch { /* no window */ }
}

export function loadDraft(key) {
  if (!key) return ''
  try { return localStorage.getItem(PREFIX + key) || '' } catch { return '' }
}

export function saveDraft(key, value) {
  if (!key) return
  try {
    const had = localStorage.getItem(PREFIX + key) != null
    if (value && value.trim()) {
      localStorage.setItem(PREFIX + key, value)
      stamp(key, true)
      if (!had) announce(key)
    } else {
      localStorage.removeItem(PREFIX + key)
      stamp(key, false)
      if (had) announce(key)
    }
  } catch { /* ignore (private mode / quota) */ }
}

export function clearDraft(key) {
  if (!key) return
  try {
    const had = localStorage.getItem(PREFIX + key) != null
    localStorage.removeItem(PREFIX + key)
    stamp(key, false)
    if (had) announce(key)
  } catch { /* ignore */ }
}

/** Every saved draft whose key starts with `prefix` (e.g. 'dm-'), newest first: [{ key, text, at }]. */
export function listDrafts(prefix = '') {
  const out = []
  try {
    const times = readTimes()
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(PREFIX + prefix)) continue
      const text = localStorage.getItem(k) || ''
      if (!text.trim()) continue
      const key = k.slice(PREFIX.length)
      out.push({ key, text, at: times[key] || 0 })
    }
  } catch { /* ignore */ }
  return out.sort((a, b) => b.at - a.at || a.key.localeCompare(b.key))
}
