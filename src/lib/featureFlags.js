// Feature flags for the global network build.
//
// NOT to be confused with src/lib/flags.js, which is country flag emoji. This
// file is the switch that decides whether you get the current UK app or the new
// worldwide network shell.
//
// THE CUTOVER IS A FLAG FLIP, NOT A MIGRATION. That is the entire point. The new
// tables already exist in production and the live app simply never queries them,
// so turning the network on for one person, then five, then everyone is a
// front-end decision that reverses in two seconds and needs no database work.
//
// Stage 1 (now):   device-local preview, admins only. Nothing is stored server
//                  side, so it cannot leak to a creator by accident.
// Stage 2 (later): `app_settings.network_stage` of off/admins/staff/pilot/all,
//                  read here and OR'd with the local override.

const PREVIEW_KEY = 'tryp_network_preview'

// A plain event rather than a context provider, so a component anywhere can
// react to the toggle without every page needing to sit under a new provider.
const EVENT = 'tryp:flagchange'

export function isNetworkPreviewOn() {
  try {
    return localStorage.getItem(PREVIEW_KEY) === '1'
  } catch {
    return false
  }
}

export function setNetworkPreview(on) {
  try {
    if (on) localStorage.setItem(PREVIEW_KEY, '1')
    else localStorage.removeItem(PREVIEW_KEY)
  } catch {
    /* private mode, ignore */
  }
  window.dispatchEvent(new Event(EVENT))
}

export function subscribeToFlags(fn) {
  window.addEventListener(EVENT, fn)
  // `storage` fires in OTHER tabs, so exiting the preview in one tab drops the
  // rest out too rather than leaving a stale shell open behind it.
  window.addEventListener('storage', fn)
  return () => {
    window.removeEventListener(EVENT, fn)
    window.removeEventListener('storage', fn)
  }
}

export { PREVIEW_KEY }
