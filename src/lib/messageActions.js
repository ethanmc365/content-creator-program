import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Editing a message, and reporting one. The two things every chat surface here
// now has, in one place because there are three of those surfaces (the legacy
// rooms, the market rooms and the DMs) and a rule that lives in three files is
// a rule that will disagree with itself by Christmas.
//
// The window is FIVE MINUTES, and it is enforced in the database as well - see
// migration 097. The client copy exists to decide whether to draw a button, not
// to decide whether an edit is allowed; a clock that has drifted, a tab left
// open overnight or somebody with the console open all end at the same server
// check.
export const EDIT_WINDOW_MS = 5 * 60 * 1000

export function withinEditWindow(createdAt, now) {
  if (!createdAt) return false
  const t = new Date(createdAt).getTime()
  if (Number.isNaN(t)) return false
  return now - t < EDIT_WINDOW_MS
}

// A clock that ticks slowly, so an Edit button disappears on its own when the
// window closes rather than sitting there until something else re-renders.
//
// A TICKING CLOCK RATHER THAN `Date.now()` IN THE RENDER. This repo's eslint
// bans `Date.now()` during render (react-hooks/purity) and it is right to: a
// component whose output depends on the wall clock is not a function of its
// props, and React is allowed to render it whenever it likes. The tick is
// state, which is the honest way to say "this output changes over time".
//
// Twenty seconds, not one: this drives a button's visibility, and the cost of
// being up to twenty seconds late is that somebody presses Edit and is told the
// window has passed - which is a sentence, not a bug. One second would re-render
// every open chat sixty times a minute for that.
export function useNowTick(intervalMs = 20000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

// `kind` is 'channel' (a row in `messages`, which is every room in the product)
// or 'dm' (a row in `direct_messages`, 1:1 and groups alike).
export async function editMessage(kind, id, body) {
  const fn = kind === 'dm' ? 'edit_direct_message' : 'edit_message'
  const { data, error } = await supabase.rpc(fn, { p_id: id, p_body: body })
  if (error) throw new Error(friendly(error.message))
  return data // the edited_at timestamp
}

// ------------------------------------------------------------------ reports

// The list a person actually recognises their situation in. Deliberately short:
// a taxonomy of fifteen is a form somebody abandons, and the free-text box is
// where the specifics belong anyway.
export const REPORT_REASONS = [
  { key: 'harassment', label: 'Harassment or bullying', hint: 'Targeted at someone, repeated, or threatening.' },
  { key: 'hate', label: 'Hate or discrimination', hint: 'Attacks a person or group for who they are.' },
  { key: 'explicit', label: 'Sexual or graphic content', hint: 'Not something anyone should open at work.' },
  { key: 'spam', label: 'Spam or self-promotion', hint: 'Repeated, off topic, or selling something.' },
  { key: 'scam', label: 'Scam or phishing', hint: 'Asking for money, logins or personal details.' },
  { key: 'other', label: 'Something else', hint: 'Tell us what is wrong with it.' },
]

export async function reportMessage(kind, id, reason, details) {
  const { error } = await supabase.rpc('report_message', {
    p_kind: kind === 'dm' ? 'dm' : 'channel',
    p_target: id,
    p_reason: reason,
    p_details: details || null,
  })
  if (error) throw new Error(friendly(error.message))
}

export const REPORT_STATUS = {
  new: { label: 'New', tone: 'amber' },
  reviewing: { label: 'Looking at it', tone: 'light' },
  actioned: { label: 'Actioned', tone: 'green' },
  dismissed: { label: 'Dismissed', tone: 'grey' },
}

// Postgres prefixes a raised exception on the way through PostgREST. The
// messages in 097 are already written for a person, so all this has to do is
// take the plumbing off the front rather than invent its own copy.
function friendly(message = '') {
  return message.replace(/^.*?:\s*/, '').trim() || 'That did not work. Please try again.'
}
