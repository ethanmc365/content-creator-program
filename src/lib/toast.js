// Lightweight confirmations that do not stop the world.
//
// The app already has `notice()`, a branded modal. It is the right tool for
// something you must read ("that failed, here is why") and the wrong one for
// something you already know ("saved"): a modal for a success message takes the
// page away, demands a click, and punishes you for having done the thing.
//
// So: a toast for anything that CONFIRMS what just happened, `notice()` for
// anything that INTERRUPTS. Errors keep the modal.
//
// Same handler-registration shape as confirm.js so there is one pattern in the
// codebase for "a component somewhere owns the UI, a plain function is the API".

let handler = null

export function _setToastHandler(fn) {
  handler = fn
}

/**
 * @param {string} message
 * @param {{ tone?: 'default'|'success'|'warn', icon?: string, duration?: number,
 *           action?: { label: string, onClick: () => void } }} [options]
 */
export function toast(message, options = {}) {
  // No host mounted (tests, or a page outside the shell) is not an error: the
  // toast is a courtesy, and swallowing it is better than throwing inside
  // somebody's save handler.
  if (!handler) return
  handler(String(message), options)
}

export const toastSuccess = (m, o = {}) => toast(m, { tone: 'success', icon: 'check', ...o })
export const toastWarn = (m, o = {}) => toast(m, { tone: 'warn', icon: 'alert', ...o })
