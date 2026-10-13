// App-wide confirmation dialog.
//
// Replaces the browser's native window.confirm(), which has a fatal flaw: it
// shows a "Don't show this again" checkbox, and once the user ticks it the
// browser makes confirm() return FALSE immediately without ever showing the
// dialog. Every action written as `if (!confirm(...)) return` then silently
// aborts forever (this is exactly why Accept / Promote / Mute stopped working).
//
// Usage stays almost identical, just await it:
//   if (!(await confirm('Delete this?'))) return
//
// The <ConfirmHost/> mounted in App.jsx registers the real handler; until then
// we fall back to a resolved false so nothing acts without confirmation.

import { t } from './i18n'

let handler = null

export function _setConfirmHandler(fn) {
  handler = fn
}

/**
 * Ask the user to confirm an action. Returns a Promise<boolean>.
 * @param {string} message  The question to show (supports \n line breaks).
 * @param {{ confirmLabel?: string, cancelLabel?: string, danger?: boolean, title?: string }} [options]
 */
export function confirm(message, options = {}) {
  if (!handler) return Promise.resolve(false)
  return handler(String(message), options)
}

/**
 * Show a single-button message dialog (replaces window.alert(), which the
 * browser can permanently suppress the same way it suppresses confirm()).
 * Returns a Promise that resolves when the user dismisses it.
 * @param {string} message
 * @param {{ confirmLabel?: string, title?: string, danger?: boolean }} [options]
 */
export function notice(message, options = {}) {
  if (!handler) return Promise.resolve(true)
  return handler(String(message), { confirmLabel: 'OK', title: 'Heads up', ...options, noCancel: true })
}

/**
 * Ask the user for a single line of text with a branded modal (replaces the
 * native window.prompt(), which looks like a browser system dialog). Resolves to
 * the trimmed string, or null if cancelled / left empty.
 * @param {string} message  Label shown above the field.
 * @param {{ placeholder?: string, defaultValue?: string, confirmLabel?: string, cancelLabel?: string, title?: string, inputType?: string }} [options]
 */
export function promptText(message, options = {}) {
  if (!handler) return Promise.resolve(null)
  return handler(String(message), { ...options, prompt: true })
}

/**
 * Await a Supabase write and tell the person if it failed. Resolves true when
 * it worked. supabase-js does not throw on a refused write (RLS, a dropped
 * connection, the read-only demo account): it resolves with `error` set, so an
 * unchecked `await supabase.from(...).update(...)` looks like success.
 *   if (!await saved(supabase.from('x').delete().eq('id', id))) return
 * @param {PromiseLike<{ error: any }>} query
 * @param {string} [message]  shown on failure; defaults to a translated "did not save"
 */
export async function saved(query, message) {
  const { error } = await query
  if (!error) return true
  await notice(message ?? t('That did not save. Check your connection and try again.'))
  return false
}
