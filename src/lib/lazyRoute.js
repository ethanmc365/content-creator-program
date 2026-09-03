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

// PREFETCHING, AND WHY IT IS THE REAL FIX FOR "A LOADING SCREEN FLASHES UP".
//
// Ethan, twice: "clicking from worldwide to challenges to rooms, I get a
// loading screen which briefly flashes up... because this page is loading in
// split seconds there is no need for that loading screen to flash up at all."
//
// Of the five bottom tabs only TWO are code-split - Worldwide and Rooms - and
// they are exactly the two he named. Tapping either suspends while its chunk is
// fetched, and a Suspense boundary REPLACES the content area while it waits. So
// whatever is drawn there - a plane, a skeleton, or nothing at all - is a third
// screen appearing between two pages, for a fetch that takes a couple of
// hundred milliseconds.
//
// Delaying the fallback (which I tried first) does not fix that. It only swaps
// a flash of grey cards for a flash of NOTHING, and an empty content area
// between a header and a tab bar reads worse, not better.
//
// The fix is to make the wait not exist. Both chunks are a few kilobytes and
// the creator is certain to open both, so they are fetched once the app has
// finished its own work - and by the time a thumb reaches the tab bar the
// import resolves synchronously and no boundary is ever crossed.
//
// `preload` is idempotent: the browser caches the module, and a second call
// returns the same resolved promise.
export function preloadRoute(importer) {
  try { importer() } catch { /* a failed prefetch is not an error, just a miss */ }
}

/**
 * Fetch route chunks once the browser is idle and the first screen has settled.
 *
 * `requestIdleCallback` where it exists, a timer where it does not (Safari on
 * iOS, which is most of this audience). Either way it is deliberately AFTER
 * first paint: prefetching during boot competes with the profile query and the
 * page somebody is actually looking at, which is the trade this is meant to
 * avoid rather than move.
 */
export function preloadWhenIdle(importers, delay = 1200) {
  if (typeof window === 'undefined') return
  const run = () => importers.forEach(preloadRoute)
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => run(), { timeout: 4000 })
  } else {
    window.setTimeout(run, delay)
  }
}

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
