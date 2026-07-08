import { useRef, useState } from 'react'
import { cx } from '../lib/utils'

// Inline video player used everywhere an uploaded clip is shown (community chat,
// DMs, resource library). WhatsApp-style: it shows the clip's first frame as a
// still preview (sized to the real orientation) and STAYS PAUSED until the play
// button is pressed, then plays inline right in place.
//
//  1. Orientation - we read the real dimensions on `loadedmetadata` and size the
//     box in explicit pixels (the chat bubble is shrink-to-fit, so an auto width
//     off aspect-ratio collapses to 0) so vertical shows vertical.
//  2. Poster - `#t=0.1` tells the browser to paint the frame at 0.1s as the
//     still preview (the reliable cross-browser/iOS way to avoid a black box).
//     NOTE: we deliberately do NOT set crossOrigin - a cross-origin <video>
//     fails to load on iOS Safari, which was showing the "Open video" fallback.
//  3. Inline play - the play button calls `.play()` in place (`playsInline`),
//     then hands over to native controls; it never leaves the chat.
//
// guardRef (optional): a ref set true by a parent long-press so a hold gesture
// (save / options menu) doesn't also start playback.
export default function VideoPlayer({ url, className, maxW = 300, maxH = 420, guardRef }) {
  const ref = useRef(null)
  const [dims, setDims] = useState(null) // { w, h } in px, aspect-correct
  const [started, setStarted] = useState(false)

  function fit(vw, vh) {
    const ratio = vw / vh
    let w = maxW
    let h = Math.round(w / ratio)
    if (h > maxH) { h = maxH; w = Math.round(h * ratio) }
    return { w, h }
  }

  function onMeta(e) {
    const v = e.currentTarget
    if (v.videoWidth && v.videoHeight) setDims(fit(v.videoWidth, v.videoHeight))
  }

  function play(e) {
    e.stopPropagation()
    if (guardRef?.current) return // a long-press just fired - don't play
    const v = ref.current
    if (!v) return
    setStarted(true)
    try { v.currentTime = 0 } catch { /* ignore */ }
    v.play().catch(() => setStarted(false)) // if it can't play, restore the button
  }

  const box = dims || { w: maxW, h: Math.round(maxW * 9 / 16) }

  return (
    <div
      className={cx('relative mx-auto overflow-hidden rounded-xl bg-black', className)}
      style={{ width: box.w, height: box.h, maxWidth: '100%' }}
    >
      <video
        ref={ref}
        src={`${url}#t=0.1`}
        playsInline
        preload="metadata"
        controls={started}
        onLoadedMetadata={onMeta}
        className="h-full w-full object-contain"
      />

      {!started && (
        <button
          type="button"
          onClick={play}
          aria-label="Play video"
          className="group absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/25 to-transparent"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-brand shadow-lift transition-transform group-hover:scale-110 group-active:scale-95">
            <svg viewBox="0 0 24 24" fill="currentColor" className="ml-1 h-6 w-6" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}
