// NO ACCIDENTAL ZOOM, ANYWHERE, EXCEPT WHERE ZOOM IS THE POINT.
//
// Ethan: "even while scrolling through messages or on the worldwide page, I can
// accidentally pinch slightly with two fingers and it will zoom in, this
// shouldn't be the case here. Zoom in feature on mobile should not happen
// across the platform, only for certain things such as zooming in on the maps,
// zooming in on photos and that, everything else it should be disabled so no
// accidental zooming."
//
// This reverses an earlier decision, deliberately. The note in index.css says
// page zoom "cannot be turned off with a viewport `maximum-scale` (that also
// breaks pinch-to-zoom, which is an accessibility control)" - and that is true
// of a DOCUMENT. It is not true of this app. Every screen here is already
// responsive down to 320px, the text is never below 13px, and the two things
// somebody genuinely needs to magnify - a map and a photograph - now do their
// own zooming, in JS, at a quality browser zoom cannot match (browser zoom on a
// map enlarges the pixels; the map's own zoom draws more of the map). What is
// left is a gesture that only ever fires by accident, and when it does it
// leaves a chat thread at 1.3x with no way back that anybody can find.
//
// THREE MECHANISMS, BECAUSE NO ONE OF THEM COVERS EVERY BROWSER.
//
//  1. `touch-action: pan-x pan-y` on the document (see index.css). Chrome,
//     Android and iOS 13+ take this as "this element scrolls, it does not
//     zoom". It is the cheap declarative half and it does most of the work.
//  2. `gesturestart` / `gesturechange` / `gestureend`. WebKit's own pinch
//     events, and on iOS Safari IN A TAB they fire even when touch-action says
//     otherwise. Preventing them is the only thing that stops pinch there.
//  3. Double-tap. iOS treats a fast double tap as zoom-to-fit; `touch-action`
//     covers it in most builds, and swallowing a second tap inside 300ms of
//     the first covers the rest.
//
// AND ONE ESCAPE HATCH: anything inside `[data-zoomable]` is left completely
// alone, so a map or a photo viewer can take the same gesture and do something
// better with it. That attribute is the whole contract - see CreatorMap,
// WorldMap and PhotoLightbox.
//
// It is installed once, from main.jsx, and it is a no-op on a device with no
// touch screen.

const ZOOMABLE = '[data-zoomable]'

/** Is this event aimed at something that does its own zooming? */
function inZoomable(target) {
  return !!(target instanceof Element && target.closest(ZOOMABLE))
}

// Some browsers deliver these on a text node or on the document itself.
function elementOf(target) {
  if (target instanceof Element) return target
  if (target && target.parentElement) return target.parentElement
  return null
}

export function installPinchGuard() {
  if (typeof document === 'undefined') return () => {}

  const stopGesture = (e) => {
    if (inZoomable(elementOf(e.target))) return
    e.preventDefault()
  }

  // A pinch is any touch event with more than one finger down. `passive: false`
  // is required or preventDefault is ignored - and this is why the listener has
  // to be added by hand rather than through React, which cannot set it.
  const stopMultiTouch = (e) => {
    if (e.touches && e.touches.length < 2) return
    if (inZoomable(elementOf(e.target))) return
    e.preventDefault()
  }

  // Double-tap to zoom. Only ever cancels the ZOOM, never the tap: the first
  // tap is untouched and the second is only swallowed when it lands within
  // 300ms and 30px of it, which is the gesture and nothing else.
  let lastTapAt = 0
  let lastTapX = 0
  let lastTapY = 0
  const stopDoubleTap = (e) => {
    if (inZoomable(elementOf(e.target))) return
    const t = e.changedTouches?.[0]
    if (!t) return
    const now = e.timeStamp
    const near = Math.abs(t.clientX - lastTapX) < 30 && Math.abs(t.clientY - lastTapY) < 30
    if (now - lastTapAt < 300 && near) {
      e.preventDefault()
      lastTapAt = 0
      return
    }
    lastTapAt = now
    lastTapX = t.clientX
    lastTapY = t.clientY
  }

  const opts = { passive: false }
  document.addEventListener('gesturestart', stopGesture, opts)
  document.addEventListener('gesturechange', stopGesture, opts)
  document.addEventListener('gestureend', stopGesture, opts)
  document.addEventListener('touchmove', stopMultiTouch, opts)
  document.addEventListener('touchend', stopDoubleTap, opts)

  return () => {
    document.removeEventListener('gesturestart', stopGesture, opts)
    document.removeEventListener('gesturechange', stopGesture, opts)
    document.removeEventListener('gestureend', stopGesture, opts)
    document.removeEventListener('touchmove', stopMultiTouch, opts)
    document.removeEventListener('touchend', stopDoubleTap, opts)
  }
}
