import { createPortal } from 'react-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { cx } from '../lib/utils'

// Far enough to read a sign in the background, not so far it is a pixel grid.
const MAX_SCALE = 5
import { saveFile, fileNameFromUrl } from '../lib/media'
import { useT } from '../lib/i18n'

// ONE PHOTOGRAPH, OVER EVERYTHING, AND "EVERYTHING" HAS TO INCLUDE THE MODAL
// IT WAS OPENED FROM.
//
// THE BUG: "when I click on a logged trip at the bottom and it shows up the
// card and the photo, when I click full size on the photo it appears but
// appears BEHIND the card and can't be seen."
//
// The lightbox was a `fixed inset-0 z-[90]` div written inline in the page. The
// trip sheet it opens from is a `Modal`, and `Modal` renders through
// `createPortal` into `document.body` at z-50. Those two numbers are not
// comparable: z-index only orders siblings within the same stacking context,
// and the page's own layer (any ancestor with a transform - and this app puts
// `Reveal` transforms up and down every page - starts one) is itself painted
// under the body-level portal. So a 90 inside the page loses to a 50 on the
// body every time, and no amount of raising the number would have fixed it.
//
// The fix is the same one Modal already made: go to the body. Once both layers
// are children of `document.body` the z-indexes finally mean what they say, and
// 120 sits above the modal's 50 on desktop and on a phone alike.
//
// Escape closes it, and it takes the body scroll lock for as long as it is up.
// IT TAKES VIDEO TOO, because a chat attachment is one or the other and
// "open this full screen, in the app" is the same request either way. A video
// keeps its controls and starts playing; nothing else about the layer changes.
//
// `shape="circle"` KEEPS A PROFILE PHOTO ROUND (1 Sep 2026). Ethan: "when
// clicking on a profile photo on the profile page, it should open up the photo
// in a big view but still the same circle shape." An avatar is cropped to a
// circle everywhere else in the product; opening it as a rectangle shows a
// composition nobody framed, usually with the top of a head cut off by a corner
// the round mask was hiding.
//
// `onSave` PUTS IT IN THE CAMERA ROLL. Ethan: "when viewing a photo in full
// screen there should be the icon with save so you can save it to your camera
// roll easily from there too." See lib/media - it goes through the share sheet
// on a phone, which is the only route that reaches Photos on iOS.
export default function PhotoLightbox({
  src, alt = '', kind = 'image', shape = 'rect', canSave = false, fileName = '', onClose,
}) {
  const tr = useT()
  const [saving, setSaving] = useState(false)
  const [saveNote, setSaveNote] = useState('')

  // THE PHOTO ZOOMS ITSELF NOW (1 Sep 2026).
  //
  // Browser pinch zoom is off across the platform (lib/pinchGuard), and Ethan
  // named photographs as one of the two things that must still magnify. So this
  // layer takes the gesture: pinch or wheel to scale, drag to pan once you are
  // in, double-tap to toggle between fit and 2.5x, and any of it resets when
  // the layer closes.
  //
  // Panning is CLAMPED to the image's own overflow, so you can never drag a
  // photograph off the screen and be left looking at black with no way back -
  // which is exactly the failure mode of the browser zoom this replaces.
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const frameRef = useRef(null)
  const imgRef = useRef(null)
  const gesture = useRef(null)
  // WHETHER A GESTURE IS LIVE, AS STATE AND NOT AS THE REF.
  // The transition has to be OFF while a finger is moving (a 180ms ease on
  // `transform` means the photograph lags the pinch, which reads as the app
  // being slow - the same reason the dragged tile on the photo board has no
  // transition) and ON for the snap back afterwards. Reading `gesture.current`
  // during render to decide that is a lint error and a correctness one: a ref
  // write does not re-render, so the transition would only change on the next
  // unrelated update.
  const [moving, setMoving] = useState(false)
  const zoomed = view.scale > 1.01

  // Reset whenever a different photo opens, or the same one is reopened.
  useEffect(() => { setView({ scale: 1, x: 0, y: 0 }) }, [src])

  // HOW FAR THE IMAGE MAY BE DRAGGED. Half its overflow in each direction, so
  // an edge can reach the middle of the frame and never further. Measured from
  // the rendered box rather than the natural size, because `object-contain` has
  // already fitted it.
  const clamp = useCallback((next) => {
    const el = imgRef.current
    const frame = frameRef.current
    if (!el || !frame) return next
    const scale = Math.min(MAX_SCALE, Math.max(1, next.scale))
    const w = el.clientWidth * scale
    const h = el.clientHeight * scale
    const maxX = Math.max(0, (w - frame.clientWidth) / 2)
    const maxY = Math.max(0, (h - frame.clientHeight) / 2)
    return {
      scale,
      x: Math.min(maxX, Math.max(-maxX, scale === 1 ? 0 : next.x)),
      y: Math.min(maxY, Math.max(-maxY, scale === 1 ? 0 : next.y)),
    }
  }, [])

  const onPointerDown = useCallback((e) => {
    // One finger pans, and only when there is something to pan to. Two fingers
    // are the browser's own touch stream - handled in the touch handlers below,
    // because pointer events do not carry the distance between them.
    if (!zoomed || e.pointerType === 'touch') return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    gesture.current = { x: e.clientX, y: e.clientY, from: view }
    setMoving(true)
  }, [zoomed, view])

  const onPointerMove = useCallback((e) => {
    const g = gesture.current
    if (!g) return
    setView(clamp({ scale: g.from.scale, x: g.from.x + (e.clientX - g.x), y: g.from.y + (e.clientY - g.y) }))
  }, [clamp])

  const endPointer = useCallback(() => { gesture.current = null; setMoving(false) }, [])

  // PINCH. `touches` carries both points, which is the one thing pointer events
  // will not give you without keeping a map of live pointers - and this layer
  // does not need to know about anything except the two.
  const onTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const [a, b] = e.touches
      gesture.current = {
        pinch: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        from: view,
      }
      setMoving(true)
    } else if (e.touches.length === 1 && zoomed) {
      gesture.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, from: view }
      setMoving(true)
    }
  }, [view, zoomed])

  const onTouchMove = useCallback((e) => {
    const g = gesture.current
    if (!g) return
    if (g.pinch && e.touches.length === 2) {
      const [a, b] = e.touches
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      setView(clamp({ ...g.from, scale: g.from.scale * (d / g.pinch) }))
    } else if (!g.pinch && e.touches.length === 1) {
      setView(clamp({ scale: g.from.scale, x: g.from.x + (e.touches[0].clientX - g.x), y: g.from.y + (e.touches[0].clientY - g.y) }))
    }
  }, [clamp])

  const onWheel = useCallback((e) => {
    setView((cur) => clamp({ ...cur, scale: cur.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12) }))
  }, [clamp])

  const toggleZoom = useCallback(() => {
    setView((cur) => (cur.scale > 1.01 ? { scale: 1, x: 0, y: 0 } : clamp({ scale: 2.5, x: 0, y: 0 })))
  }, [clamp])

  // `saveFile` fetches the bytes and hands a real File to the SHARE SHEET,
  // whose "Save Image" is the only route to the iOS camera roll - a bare URL
  // share offers "Copy link" and nothing else. Desktop falls through to an
  // ordinary download. Same helper the resource library and the chat use, so
  // there is one answer to "save this" in the product.
  const save = useCallback(async () => {
    if (saving) return
    setSaving(true)
    let ok
    try {
      ok = await saveFile(src, fileName || fileNameFromUrl(src))
    } catch {
      ok = false
    }
    setSaving(false)
    setSaveNote(ok ? 'Saved' : 'Opened in a new tab')
    setTimeout(() => setSaveNote(''), 2200)
  }, [src, fileName, saving])

  useEffect(() => {
    if (!src) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, onClose])

  if (!src) return null

  return createPortal(
    <div
      className="animate-fade-up fixed inset-0 z-[120] flex items-center justify-center bg-ink/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={kind === 'video' ? 'Video' : 'Photo'}
    >
      {/* The backdrop is the close target and the image is not, so a press on
          the photograph itself does not dismiss the thing you are looking at. */}
      <button type="button" aria-label={tr("Close")} onClick={onClose} className="absolute inset-0" />
      {/* THE GESTURE SURFACE. `data-zoomable` opts this out of the
          platform-wide pinch guard (lib/pinchGuard) so the raw two-finger
          gesture reaches the handlers above instead of being swallowed - which
          is also what stops a pinch on a photograph zooming the page behind it.
          It is only as big as the media, so the backdrop around it stays the
          close target. */}
      <div
        ref={frameRef}
        data-zoomable
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={endPointer}
        onWheel={kind === 'video' ? undefined : onWheel}
        onDoubleClick={kind === 'video' ? undefined : toggleZoom}
        className="relative flex max-h-full max-w-full items-center justify-center overflow-hidden"
      >
      {kind === 'video' ? (
        // NOT `pointer-events-none` on this one: the controls have to be
        // reachable, which is the whole reason for showing a video here at all.
        <video
          src={src}
          controls
          autoPlay
          playsInline
          className="relative max-h-full max-w-full rounded-card object-contain"
        />
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
            transition: moving ? 'none' : 'transform 180ms ease-out',
            touchAction: 'none',
          }}
          className={cx(
            'relative select-none',
            zoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
            shape === 'circle'
              // A SQUARE BOX, `object-cover`, ROUNDED FULLY. `object-contain`
              // inside a circle would letterbox the photograph and then clip
              // the letterbox, which crops MORE than the avatar does rather
              // than the same amount. Cover reproduces exactly the crop the
              // small avatar was already showing, bigger.
              ? 'aspect-square h-auto w-full max-w-[min(78vw,78vh)] rounded-full object-cover shadow-lift ring-4 ring-white/15'
              : 'max-h-full max-w-full rounded-card object-contain',
          )}
        />
      )}
      </div>

      {/* BACK TO FIT, without hunting for the gesture that undoes a pinch.
          Only drawn while it is actually zoomed - it is the way OUT, and a
          control that is always there for a state you are usually not in is
          furniture. */}
      {zoomed && kind !== 'video' && (
        <button
          type="button"
          onClick={toggleZoom}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-transform duration-200 hover:scale-105"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
        >
          {tr("Fit to screen")}
        </button>
      )}

      <div
        className="absolute right-4 flex items-center gap-2"
        style={{ top: 'calc(env(safe-area-inset-top) + 1rem)' }}
      >
        {canSave && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            aria-label={tr("Save this photo")}
            title={tr("Save")}
            className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2.5 text-sm font-semibold text-white backdrop-blur transition-transform duration-200 hover:scale-105 active:scale-95 disabled:opacity-60"
          >
            <Icon name="arrow-down" className="h-5 w-5" />
            {saveNote || (saving ? 'Saving…' : 'Save')}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={tr("Close photo")}
          className="rounded-full bg-white/15 p-2.5 text-white backdrop-blur transition-transform duration-200 hover:scale-110 active:scale-95"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
      </div>
    </div>,
    document.body,
  )
}
