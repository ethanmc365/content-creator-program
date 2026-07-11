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
