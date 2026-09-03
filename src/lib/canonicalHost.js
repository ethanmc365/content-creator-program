// ONE URL FOR BROWSERS, AND NEVER A WORD TO AN INSTALLED APP.
//
// THE BUG THIS EXISTS TO UNDO (3 Sep 2026, same day it was created).
//
// The platform answers on two origins - `trypcreators.vercel.app` and
// `content-creator-program.vercel.app` - and Ethan asked for one. I did it in
// `vercel.json` with a 308 on the second host, verified every path redirected,
// and broke every installed app on the platform.
//
// A HOME-SCREEN APP IS SCOPED TO THE ORIGIN IT WAS ADDED FROM. Launching it
// opens `start_url` on that origin; a 308 to a DIFFERENT origin is a navigation
// out of scope, and both iOS and Android answer that by handing the page to the
// browser. So a creator who had installed from the old origin tapped their icon
// and got Safari: address bar at the top, share and reload at the bottom. Which
// is exactly the photograph Ethan sent.
//
// It cannot be fixed on the server, because an installed launch and a browser
// tab send byte-identical requests - `Sec-Fetch-Mode: navigate`,
// `Sec-Fetch-Dest: document`, same everything. The only place that knows is the
// client, where `display-mode: standalone` is a media query.
//
// SO THE RULE IS: canonicalise the BROWSER, never the app.
//
//   in a browser on the old origin   -> replace the URL with the canonical one
//   running standalone, any origin   -> do absolutely nothing
//
// Both origins go on serving the app, which is what makes the second rule safe:
// an installed app on the old origin is not stranded, it is simply left alone.
// And because a browser visitor is moved BEFORE they install anything, every
// new installation scopes itself to the canonical origin on its own.
//
// `replace`, not `assign`: the old URL must not end up in history, or Back
// walks straight into a second redirect.

import { isStandalone } from './install'

const CANONICAL = 'trypcreators.vercel.app'

/** Hosts that serve this app but are not the one we want people to keep. */
const ALIASES = ['content-creator-program.vercel.app']

// `isStandalone` is imported, not re-written. There was very nearly a second
// copy of it in this file, and a second definition of "is this an installed
// app" is exactly the kind of thing that drifts and then strands somebody in
// Safari again - which is the bug this whole module exists to undo.

/**
 * Move a browser on an alias host to the canonical one, preserving everything
 * after the host. Returns true if a navigation was started, so the caller can
 * skip rendering an app that is about to be replaced.
 */
export function goCanonical() {
  if (typeof window === 'undefined') return false
  const { hostname, pathname, search, hash } = window.location
  if (!ALIASES.includes(hostname)) return false
  // THE WHOLE POINT. An installed app stays exactly where it is.
  if (isStandalone()) return false
  window.location.replace(`https://${CANONICAL}${pathname}${search}${hash}`)
  return true
}
