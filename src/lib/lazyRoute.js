import { lazy } from 'react'

// A PAGE THAT WILL NOT LOAD IS ALMOST ALWAYS A DEPLOY, AND THE CURE IS A RELOAD.
//
// Ethan, handing the platform to the Tryp.com team: "clicking through pages it
// brought up error 404, I think because I was clicking fast, it worked
// sometimes."
//
// It was not the speed. Every route below the first screen is code-split, so
// visiting one fetches a file named with a content hash - `Rooms-D_iPJcrN.js`.
// A deploy rebuilds those files with NEW hashes and removes the old ones. Any
// tab that was already open is still running the OLD `index.html`, which knows
// only the old names. The moment it navigates somewhere it has not been yet, it
// asks for a file that no longer exists.
//
// AND IT DOES NOT EVEN GET A 404. `vercel.json` rewrites every unmatched path
// to `/index.html`, `/assets/...` included, so the browser asks for JavaScript
// and is handed a web page with `Content-Type: text/html`. `X-Content-Type-
// Options: nosniff` then correctly refuses to execute it, the dynamic import
// rejects, and the route never renders. Verified on production: a chunk hash
// from an hour earlier returns `200 text/html`.
//
// "Worked sometimes" is the signature: a page whose chunk was ALREADY in memory
// from before the deploy still works, and only the ones being visited for the
// first time break. It is invisible in testing, because a developer reloads
// constantly and always has the newest index.html.
//
// This matters far beyond one afternoon of deploys: every future release breaks
// every tab left open on the old one, and with forty-five creators about to be
// onboarded that is a support queue rather than an anecdote.
//
// So: catch the failure and reload once. The reload fetches the new
// `index.html`, learns the new hashes, and lands on the same URL. The reader
// sees a blink instead of a broken page.
//
// THE GUARD IS NOT OPTIONAL. Without it, a chunk that genuinely cannot load -
// a real network failure, a corrupt build - reloads, fails, reloads, and the
// tab spins for ever. One reload per ten seconds means the worst case is a
// single wasted refresh and then the honest error, which the ErrorBoundary
// already knows how to draw. `sessionStorage` rather than `localStorage`: this
// is a fact about this tab right now, not about this person.
const RELOAD_KEY = 'tryp_chunk_reload_at'
const RELOAD_GAP_MS = 10_000

export function lazyRoute(importer) {
  return lazy(() =>
    importer().catch((err) => {
      let last = 0
      try {
        last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
      } catch {
        /* private mode, or storage disabled: treat it as "never reloaded" */
      }
      if (Date.now() - last > RELOAD_GAP_MS) {
        try {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
        } catch {
          /* ignore */
        }
        window.location.reload()
        // Never resolves. The reload is already under way, and resolving with
        // anything here would flash a wrong page for the frame before it lands.
        return new Promise(() => {})
      }
      throw err
    }),
  )
}
