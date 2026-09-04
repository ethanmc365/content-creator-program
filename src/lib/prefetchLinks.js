import { prefetchForPath } from './routeChunks'

// FETCH THE PAGE WHILE THE THUMB IS STILL MOVING.
//
// A Suspense fallback is a third screen between two pages. However well it is
// drawn, the way to stop it appearing is to make the wait not exist - and there
// is a window of warning before every navigation in which to do that:
//
//   desktop   pointerover on a link, then ~200-400ms before mouseup
//   phone     touchstart, then ~80-150ms before the tap completes
//   keyboard  focus, then however long it takes to press Enter
//
// Every one of those is longer than a route chunk takes to arrive on a warm
// connection, so listening for them turns almost every navigation in the app
// into a synchronous import with no boundary crossed at all.
//
// ONE DELEGATED LISTENER ON THE DOCUMENT, not a handler per link. The tab bar,
// the header, the avatar menu, every card and every row in every list are all
// `<Link>`s; wiring this per component would mean remembering it in about
// sixty places and would still miss the next one. Capture phase and `passive`,
// so this can never delay or interfere with the press it is listening to.
//
// `touchstart` AND `pointerover` are both here on purpose. iOS Safari does fire
// pointer events, but it fires `pointerover` on the tap itself - at which point
// the navigation is already happening and there is nothing left to win. The
// touch listener is what actually buys the phone its head start, which is the
// case this whole file exists for.

function hrefFrom(target) {
  const a = target?.closest?.('a[href]')
  if (!a) return null
  // Same-origin, in-app links only. An external link, a download, a `mailto:`
  // or anything opening in a new tab is not a route and must not be touched.
  if (a.target && a.target !== '_self') return null
  if (a.hasAttribute('download')) return null
  const href = a.getAttribute('href')
  if (!href || !href.startsWith('/')) return null
  return href.split('?')[0].split('#')[0]
}

let installed = false

/** Install the delegated prefetch listeners. Idempotent; returns a cleanup. */
export function installLinkPrefetch() {
  if (installed || typeof document === 'undefined') return () => {}
  installed = true

  const onIntent = (e) => {
    const path = hrefFrom(e.target)
    if (path) prefetchForPath(path)
  }
  const opts = { capture: true, passive: true }
  document.addEventListener('pointerover', onIntent, opts)
  document.addEventListener('touchstart', onIntent, opts)
  document.addEventListener('focusin', onIntent, opts)

  return () => {
    document.removeEventListener('pointerover', onIntent, opts)
    document.removeEventListener('touchstart', onIntent, opts)
    document.removeEventListener('focusin', onIntent, opts)
    installed = false
  }
}
