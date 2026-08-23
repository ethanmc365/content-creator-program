import { useCallback, useEffect, useRef, useState } from 'react'
import { mediaType, fileNameFromUrl, saveFile } from '../lib/media'
import VideoPlayer from './VideoPlayer'
import { Spinner } from './ui'
import Icon from './Icon'
import { safeUrl } from '../lib/safeUrl'

// A chat / DM attachment (image or video). Videos use the browser's native
// <video controls> (reliable play button + inline playback everywhere, incl.
// iOS) with a real captured poster frame. A LONG-PRESS (or right-click on
// desktop) on either opens a small menu to Open full screen or Save it. Saving
// routes through saveFile: mobile share sheet ("Save Image/Video" to the camera
// roll), desktop download.
//
// `kind` ('image' | 'video') is passed explicitly by the caller (an optimistic
// blob: URL has no extension to sniff); falls back to the extension otherwise.
//
// A PHOTO IS THE SHAPE IT WAS TAKEN IN.
//
// THE BUG THIS FIXES. The image was `w-full … object-cover` inside the bubble,
// which is two separate mistakes compounding. `w-full` says "be as wide as the
// bubble whatever you are", and `object-cover` then CROPS whatever does not fit
// that box - so a portrait photo sent from a phone arrived on a desktop as a
// letterbox strip cut out of its middle, with the top and bottom of the picture
// simply gone. Ethan: "on PC when a vertical photo is sent it's all cropped and
// just shows a landscape piece of it."
//
// So the image is fitted the same way VideoPlayer already fits video: measure
// the natural size, scale it to fit inside a maxW x maxH box, and give the
// wrapper that exact box. Landscape comes out landscape, portrait comes out
// portrait, and nothing is ever cut off. The box is applied to the WRAPPER, and
// as an `aspect-ratio` before the pixels arrive, so the message does not jump
// when the photo decodes - which matters because every chat here re-pins its
// scroller on image load.
export default function ChatMedia({ url, alt, kind, maxW = 260, maxH = 380 }) {
  const isVideo = (kind || mediaType(url)) === 'video'
  const [saving, setSaving] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [box, setBox] = useState(null)
  const fired = useRef(false)
  const timer = useRef(null)
  const origin = useRef(null)

  function openMenu() { fired.current = true; setMenuOpen(true) }

  function start(e) {
    fired.current = false
    const p = e.touches?.[0] || e
    origin.current = { x: p.clientX, y: p.clientY }
    clearTimeout(timer.current)
    timer.current = setTimeout(openMenu, 500)
  }
  function move(e) {
    if (!timer.current) return
    const p = e.touches?.[0] || e
    if (origin.current && Math.hypot(p.clientX - origin.current.x, p.clientY - origin.current.y) > 12) {
      clearTimeout(timer.current); timer.current = null // scrolled/dragged/scrubbing - cancel
    }
  }
  function end() { clearTimeout(timer.current); timer.current = null }

  const press = {
    onTouchStart: start, onTouchMove: move, onTouchEnd: end,
    onMouseDown: start, onMouseMove: move, onMouseUp: end, onMouseLeave: end,
    onContextMenu: (e) => { e.preventDefault(); openMenu() },
  }

  async function doSave() {
    setMenuOpen(false)
    if (saving) return
    setSaving(true)
    try { await saveFile(url, fileNameFromUrl(url)) } finally { setSaving(false) }
  }
  function openFull() {
    setMenuOpen(false)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // Scale the picture's own dimensions into the maxW x maxH box, keeping the
  // ratio. Same arithmetic VideoPlayer does; there is one right answer and both
  // should give it.
  const measure = useCallback((img) => {
    const iw = img?.naturalWidth
    const ih = img?.naturalHeight
    if (!iw || !ih) return
    let w = Math.min(maxW, iw)
    let h = Math.round(w / (iw / ih))
    if (h > maxH) { h = maxH; w = Math.round(h * (iw / ih)) }
    setBox({ w, h })
  }, [maxW, maxH])

  // A CACHED IMAGE CAN BE DECODED BEFORE `onLoad` EXISTS.
  //
  // Scrolling back up a conversation re-mounts rows whose pictures are already
  // in the browser cache, and for those the load event has come and gone by the
  // time React attaches a handler - so the measurement would never happen and
  // the photo would sit in its unmeasured fallback for ever. `complete` is the
  // question "has this already finished", and asking it on mount is the only
  // way to catch that case. The node goes in state so the effect re-runs when
  // the row is genuinely remounted.
  const [imgEl, setImgEl] = useState(null)
  useEffect(() => {
    if (imgEl?.complete) measure(imgEl)
  }, [imgEl, measure, url])

  return (
    <div
      className="relative select-none"
      // The WRAPPER carries the fitted width, not just the image, for two
      // reasons: the bubble is shrink-to-fit, so a portrait photo should make a
      // narrow bubble rather than a narrow photo in a wide one, and the "Saving"
      // overlay is `inset-0` on this element - anchored to a box wider than the
      // picture it would sit half over the bubble's empty space.
      style={{ WebkitTouchCallout: 'none', ...(box && !isVideo ? { width: box.w, maxWidth: '100%' } : null) }}
      {...press}
    >
      {isVideo ? (
        <VideoPlayer url={url} maxW={maxW} maxH={maxH} />
      ) : (
        <a
          href={safeUrl(url)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open image full size"
          onClick={(e) => { if (fired.current) e.preventDefault() }}
          className="block"
        >
          <img
            ref={setImgEl}
            src={url}
            alt={alt || 'Shared image'}
            loading="lazy"
            draggable={false}
            onLoad={(e) => measure(e.currentTarget)}
            // `object-contain`, never `cover`: this box IS the picture's own
            // ratio, so there is nothing to crop, and if a measurement ever
            // failed the honest failure is a letterboxed photo rather than a
            // silently cropped one.
            className="h-auto w-full rounded-xl bg-cloud object-contain"
            // BEFORE THE PIXELS ARRIVE, the width is capped at the same maxW
            // the measured box will use. Without that cap `w-full` means the
            // whole bubble, so a photo would paint at 600px wide and then jump
            // to 260 the instant it decoded - a jump every chat here would then
            // try to correct for with its scroll re-pinning.
            style={box
              ? { aspectRatio: `${box.w} / ${box.h}` }
              : { maxWidth: maxW, maxHeight: maxH }}
          />
        </a>
      )}

      {saving && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/30">
          <span className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-ink shadow-lift">
            <Spinner className="h-4 w-4" /> Saving…
          </span>
        </div>
      )}

      {/* Long-press / right-click options menu (iOS-style action sheet). Fixed +
          centered so the chat bubble's overflow-hidden can't clip it. */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-6"
          onClick={() => setMenuOpen(false)}
          onContextMenu={(e) => { e.preventDefault(); setMenuOpen(false) }}
        >
          <div className="w-72 max-w-full overflow-hidden rounded-2xl bg-white shadow-lift" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={openFull} className="flex w-full items-center gap-3.5 px-5 py-4 text-left text-sm font-semibold text-ink transition-colors hover:bg-cloud">
              <Icon name="expand" className="h-5 w-5 shrink-0 text-brand" />
              Open full screen
            </button>
            <button type="button" onClick={doSave} className="flex w-full items-center gap-3.5 border-t border-gray-100 px-5 py-4 text-left text-sm font-semibold text-ink transition-colors hover:bg-cloud">
              <Icon name="arrow-down" className="h-5 w-5 shrink-0 text-brand" />
              {isVideo ? 'Save video' : 'Save photo'}
            </button>
            <button type="button" onClick={() => setMenuOpen(false)} className="w-full border-t border-gray-100 px-5 py-3.5 text-center text-sm font-medium text-smoke transition-colors hover:bg-cloud">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
