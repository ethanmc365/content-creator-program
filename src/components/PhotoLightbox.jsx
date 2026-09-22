import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { cx } from '../lib/utils'

// Hide or show the thumbnail the photo grew out of. A module function because
// the element belongs to the caller, not to this component's render.
function hideOrigin(el, hidden) {
  if (el) el.style.visibility = hidden ? 'hidden' : ''
}

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
  // Optional: a line under the photo, and stepping through a set (the
  // travel-photo board passes both; a chat photo passes neither).
  caption = '', onPrev = null, onNext = null, counter = '',
  // THE ELEMENT IT OPENS FROM (22 Sep 2026). A ref to the thumbnail that was
  // pressed. When it is there the photograph GROWS OUT OF IT and shrinks back
  // into it on close, instead of fading up in the middle of the screen.
  origin = null,
}) {
  const tr = useT()
  // `closing` is the shrink back into the origin. Every way out goes through
  // `close()` so the backdrop, Escape and the X all animate the same way.
  const [closing, setClosing] = useState(false)
  const flip = !!origin?.current && kind !== 'video'
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
  useEffect(() => { setView({ scale: 1, x: 0, y: 0 }); setClosing(false) }, [src])

  // WHERE THE ORIGIN IS, RELATIVE TO WHERE THE PHOTO NOW SITS, as the one
  // transform that puts the big photo exactly over the small one.
  const originTransform = useCallback(() => {
    const o = origin?.current?.getBoundingClientRect?.()
    const t = frameRef.current?.getBoundingClientRect?.()
    if (!o || !t || !t.width || !o.width) return null
    const dx = (o.left + o.width / 2) - (t.left + t.width / 2)
    const dy = (o.top + o.height / 2) - (t.top + t.height / 2)
    return `translate(${dx}px, ${dy}px) scale(${o.width / t.width})`
  }, [origin])

  // GROW OUT OF THE AVATAR. A layout effect, so the first painted frame is
  // already the small photo sitting on top of the avatar - never a frame of
  // the big one first. The avatar itself is hidden while the copy is out, so
  // it reads as the same photograph lifting off the page rather than a second
  // one appearing over it.
  useLayoutEffect(() => {
    if (!src || !flip) return undefined
    const el = frameRef.current
    const from = originTransform()
    const source = origin.current
    hideOrigin(source, true)
    if (el && from && el.animate) {
      el.animate(
        [{ transform: from, borderRadius: shape === 'circle' ? '9999px' : '1rem' }, { transform: 'none' }],
        { duration: 420, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)' },
      )
    }
    return () => hideOrigin(source, false)
  }, [src, flip, origin, originTransform, shape])

  const close = useCallback(() => {
    if (!flip || closing) { onClose?.(); return }
    setClosing(true)
    setView({ scale: 1, x: 0, y: 0 })
    const el = frameRef.current
    const to = originTransform()
    const dur = 320
    let done = false
    const finish = () => {
      if (done) return
      done = true
      hideOrigin(origin.current, false)
      onClose?.()
    }
    if (el && to && el.animate) {
      const a = el.animate(
        [{ transform: 'none' }, { transform: to }],
        { duration: dur, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
      )
      a.onfinish = finish
    }
    // A timer behind the animation: a hidden tab never advances the timeline,
    // and a close that waits on a frame that never comes is a stuck overlay.
    setTimeout(finish, dur + 60)
  }, [flip, closing, onClose, originTransform, origin])

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

  // THE WHEEL OVER THE PHOTO IS THE PHOTO'S, AND ONLY THE PHOTO'S (21 Sep 2026).
  // Ethan: "if I'm scrolling on top of the photo, it should only be the photo
  // that zooms in, and not the back." React attaches `onWheel` as a PASSIVE
  // listener, so the handler zoomed the photo and could not stop the same
  // event scrolling the page behind it. A native listener with
  // `passive: false` can. Scrolling on the backdrop still scrolls the page.
  // A trackpad pinch arrives as a wheel with `ctrlKey`, with small deltas, so
  // the step follows the size of the movement rather than a fixed jump.
  useEffect(() => {
    const el = frameRef.current
    if (!el || !src || kind === 'video') return undefined
    const onWheel = (e) => {
      e.preventDefault()
      const step = Math.min(Math.abs(e.deltaY), 60) / (e.ctrlKey ? 60 : 450)
      const factor = e.deltaY < 0 ? 1 + step : 1 / (1 + step)
      setView((cur) => clamp({ ...cur, scale: cur.scale * factor }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [src, kind, clamp])

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
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') onPrev?.()
      else if (e.key === 'ArrowRight') onNext?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, close, onPrev, onNext])

  if (!src) return null

  return createPortal(
    <div
      className={cx(
        'fixed inset-0 z-[120] flex items-center justify-center p-4',
        !flip && 'animate-fade-up bg-ink/90 backdrop-blur-sm',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={kind === 'video' ? 'Video' : 'Photo'}
    >
      {/* When it grows out of an origin the BACKDROP fades on its own, so the
          photo can travel while the page darkens behind it, and fades back out
          as it shrinks home. */}
      {flip && (
        <div
          aria-hidden="true"
          className={cx(
            'absolute inset-0 bg-ink/90 backdrop-blur-sm transition-opacity duration-300',
            closing ? 'opacity-0' : 'animate-[scrim-in_320ms_ease-out_both]',
          )}
        />
      )}
      {/* The backdrop is the close target and the image is not, so a press on
          the photograph itself does not dismiss the thing you are looking at. */}
      <button type="button" aria-label={tr("Close")} onClick={close} className="absolute inset-0" />
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
        onDoubleClick={kind === 'video' ? undefined : toggleZoom}
        className={cx(
          'relative flex max-h-full max-w-full items-center justify-center overflow-hidden',
          shape === 'circle' && 'rounded-full',
        )}
        style={flip ? { willChange: 'transform' } : undefined}
      >
      {kind === 'video' ? (
        // NOT `pointer-events-none` on this one: the controls have to be
        // reachable, which is the whole reason for showing a video here at all.
        <video
          src={src}
          controls
          autoPlay
          playsInline
          style={{ maxHeight: 'calc(100dvh - 8rem)', maxWidth: 'calc(100vw - 2rem)' }}
          className="relative max-h-full max-w-full rounded-card object-contain"
        />
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          style={{
            // THE LIMITS ARE THE SCREEN'S, IN UNITS THAT MEAN SOMETHING
            // (21 Sep 2026). `max-h-full` below is a percentage of a frame
            // whose own height is `auto`, and a percentage of an auto height
            // is ignored - so a 1080x1920 creator-kit graphic rendered at its
            // natural 1920px inside an `overflow-hidden` frame and showed as a
            // cropped close-up. Ethan: "it shows up way too big, it should show
            // the actual full size of the thing." Now the whole picture fits,
            // with room for the controls, and never grows past its own size.
            maxHeight: shape === 'circle' ? undefined : 'calc(100dvh - 8rem)',
            maxWidth: shape === 'circle' ? undefined : 'calc(100vw - 2rem)',
            // A CIRCLE IS GIVEN ITS SIZE, NOT ASKED FOR IT (22 Sep 2026).
            // Ethan: "it just shows the same size image in the centre of the
            // screen." It was `w-full` of a frame whose own width is `auto`,
            // so the frame shrank to the file's natural width and the "big"
            // view of a 256px avatar was 256px. A number the screen decides.
            width: shape === 'circle' ? 'min(88vw, 78dvh, 36rem)' : undefined,
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
              ? 'aspect-square h-auto rounded-full object-cover shadow-lift ring-4 ring-white/15'
              : 'max-h-full max-w-full rounded-card object-contain',
          )}
        />
      )}
      </div>

      {/* BACK TO FIT, without hunting for the gesture that undoes a pinch.
          Only drawn while it is actually zoomed - it is the way OUT, and a
          control that is always there for a state you are usually not in is
          furniture. */}
      {zoomed && !closing && kind !== 'video' && (
        <button
          type="button"
          onClick={toggleZoom}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-transform duration-200 hover:scale-105"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
        >
          {tr("Fit to screen")}
        </button>
      )}

      {/* STEPPING THROUGH A SET. Only when the caller has one, and hidden while
          zoomed so a pan near the edge never lands on an arrow. */}
      {!zoomed && onPrev && (
        <button
          type="button" onClick={onPrev} aria-label={tr("Previous photo")}
          className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-transform duration-200 hover:scale-110 active:scale-95 sm:left-6"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      )}
      {!zoomed && onNext && (
        <button
          type="button" onClick={onNext} aria-label={tr("Next photo")}
          className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-transform duration-200 hover:scale-110 active:scale-95 sm:right-6"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      )}
      {!zoomed && (caption || counter) && (
        <div
          className="pointer-events-none absolute inset-x-0 flex flex-col items-center gap-1 px-6 text-center"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
        >
          {caption && <p className="max-w-xl text-sm font-medium text-white/95 drop-shadow">{caption}</p>}
          {counter && <p className="text-xs font-semibold tabular-nums text-white/60">{counter}</p>}
        </div>
      )}

      <div
        className={cx(
          'absolute right-4 flex items-center gap-2 transition-opacity duration-200',
          closing && 'pointer-events-none opacity-0',
          flip && !closing && 'animate-[scrim-in_360ms_ease-out_120ms_both]',
        )}
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
            <Icon name="download" className="h-5 w-5" />
            {saveNote || (saving ? 'Saving…' : 'Save')}
          </button>
        )}
        <button
          type="button"
          onClick={close}
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
