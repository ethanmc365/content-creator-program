import { useLayoutEffect, useSyncExternalStore } from 'react'

/**
 * ONE LOADER ON THE SCREEN AT A TIME.
 *
 * `index.html` paints `#boot` on the first frame - a white page carrying the
 * shape of the app shell (it was a copy of `PlaneLoader` until 4 Sep 2026).
 * The app then renders its OWN full-page placeholder while the lazy route chunk
 * arrives and the session resolves. Both were on screen together for the length
 * of the boot layer's 300ms fade, and they did not sit in the same place:
 * `#boot` is the viewport, `LazyFallback` was centred in a `min-h-[60vh]` box.
 * Ethan photographed the result - a faint plane and "Loading..." a few dozen
 * pixels above a solid "Loading...". Both are skeletons now, so the handover is
 * shape to shape, but the counting below is what guarantees there is only ever
 * one of them.
 *
 * The old dismissal was "two animation frames, or 400ms, whichever is first",
 * which is a guess at when React has something to show. It commits a FALLBACK
 * that fast, not a page, so the boot layer left while the app was still
 * loading and the app's own loader was already underneath it.
 *
 * So the two are wired together instead of guessed at:
 *
 *  - Any full-page loader in the app registers here while it is mounted
 *    (`useBootLoaderSlot`) and renders NOTHING while `#boot` is still up.
 *    There is no second loader to see, at any moment, by construction.
 *  - `#boot` waits for the count to reach zero before it starts to fade, so it
 *    hands over to real content rather than to another loader.
 *
 * A hard cap behind it (see main.jsx) means a screen that never finishes
 * loading cannot leave a white layer over the app for ever - the same rule as
 * the rAF timer it replaces.
 *
 * THE CLAIM IS A LAYOUT EFFECT, NOT A PASSIVE ONE. Passive effects flush in a
 * task after paint, which can land AFTER a `requestAnimationFrame` scheduled
 * before the commit - so main.jsx would have read a count of zero while a
 * loader was on screen, which is the bug this file exists to remove. Layout
 * effects run inside the commit, before any frame callback.
 */

// Live until main.jsx says otherwise. Read from the DOM so that a hot reload,
// or any render that happens after the layer is already gone, starts false.
let up = typeof document !== 'undefined' && !!document.getElementById('boot')
// SEPARATE FROM `up`, AND THE 160ms BETWEEN THEM IS THE WHOLE POINT.
//
// `releaseBootLayer` fires when the layer STARTS to fade; the fade is 160ms
// (see `#boot` in index.html). Anything that animates itself in off that signal
// therefore spends its first 160ms behind a sheet that is still mostly opaque -
// which for the landing hero is a quarter of the entrance, and the quarter that
// carries the movement. `cleared` is the OTHER end of the same fade: the layer
// is gone, the page is the only thing on screen, and an entrance started now is
// seen from its first frame. Starts true when there is no layer at all.
let cleared = typeof document === 'undefined' || !document.getElementById('boot')
let mounted = 0

const upSubs = new Set()
const clearedSubs = new Set()
const idleSubs = new Set()

function emit(subs) {
  for (const fn of [...subs]) fn()
}

/** True while the inline boot layer still owns the screen. */
export function bootLayerUp() {
  return up
}

/** Called by main.jsx once the layer has begun leaving. */
export function releaseBootLayer() {
  if (!up) return
  up = false
  emit(upSubs)
}

/** True once the boot layer has finished fading and is off the screen. */
export function bootLayerCleared() {
  return cleared
}

/** Called by main.jsx at the END of the fade. Idempotent. */
export function clearBootLayer() {
  if (cleared) return
  cleared = true
  emit(clearedSubs)
}

function subscribeCleared(fn) {
  clearedSubs.add(fn)
  return () => clearedSubs.delete(fn)
}

// THE COUNT DIPS TO ZERO IN THE MIDDLE OF A COMMIT, AND THAT IS NOT IDLE.
//
// React runs EVERY cleanup in a commit before it runs any effect. So a commit
// that replaces one full-page loader with another - the lazy chunk's fallback
// unmounting as ProtectedRoute's session spinner mounts, which is exactly the
// sequence a cold boot goes through - releases the first slot before it claims
// the second, and a subscriber called from that release sees a count of zero
// while a loader is very much about to be on screen. Dismissing there is the
// original bug wearing a different hat.
//
// So an idle signal is always CHECKED AGAIN from a macrotask. Layout effects
// are synchronous within the commit, so by the time a zero-delay timer runs the
// count has settled on whatever it really is.
let idleCheck = null
function scheduleIdleCheck() {
  if (idleCheck != null) return
  idleCheck = setTimeout(() => {
    idleCheck = null
    if (mounted !== 0) return
    emit(idleSubs)
  }, 0)
}

/**
 * Run `fn` once no full-page loader is mounted - checked after the current
 * commit has finished, never during one. Returns an unsubscribe.
 */
export function whenAppLoadersIdle(fn) {
  idleSubs.add(fn)
  scheduleIdleCheck()
  return () => idleSubs.delete(fn)
}

function subscribeUp(fn) {
  upSubs.add(fn)
  return () => upSubs.delete(fn)
}

/**
 * HAS THE BOOT LAYER FINISHED LEAVING?
 *
 * For a page that ANIMATES ITSELF IN rather than one that draws a placeholder.
 * The landing page is the only one, and it is the reason this exists: its hero
 * entrance starts the moment React commits, which on a phone is comfortably
 * inside the life of `#boot` - so the whole animation played underneath an
 * opaque white sheet and Ethan reported, correctly, that "Create. Earn. Travel."
 * has no animation on mobile. It had one. Nobody could see it.
 *
 * IT IS THE END OF THE FADE, NOT THE START (10 Sep 2026). `releaseBootLayer` -
 * which this used to read - fires when the sheet BEGINS its 160ms fade, which
 * is the right signal for a loader (it is being handed the screen) and the
 * wrong one for an entrance. Half the fix landed and the reader still saw the
 * first 130ms of every word behind a sheet that was still mostly opaque; what
 * is left of a 26px rise after that is a word appearing, which is exactly what
 * Ethan reported next: "they just appear up, everything there flashes up."
 *
 * Unlike `useBootLoaderSlot` this claims NO slot: a page holding the layer up
 * while waiting for the layer to go is a deadlock, and this caller is real
 * content rather than a loader.
 *
 * It cannot leave anything invisible for ever. `cleared` starts TRUE whenever
 * there is no `#boot` in the document (a hot reload, a second visit inside the
 * same SPA session), and main.jsx dismisses the layer behind a hard 6s cap, so
 * this resolves on every path there is. Callers still put a timer behind it -
 * see the note in main.jsx: never gate content on one mechanism.
 */
export function useBootCleared() {
  return useSyncExternalStore(subscribeCleared, bootLayerCleared, () => true)
}

/**
 * For a full-page loader: hold a slot for as long as it is mounted, and report
 * whether it should draw itself. False while `#boot` is up, because `#boot` IS
 * the loader at that point.
 */
export function useBootLoaderSlot() {
  const layerUp = useSyncExternalStore(subscribeUp, bootLayerUp, () => false)
  useLayoutEffect(() => {
    mounted += 1
    return () => {
      mounted -= 1
      if (mounted === 0) scheduleIdleCheck()
    }
  }, [])
  return !layerUp
}
