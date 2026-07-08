import { useRef, useState } from 'react'
import Icon from './Icon'
import { cx } from '../lib/utils'

// Inline video player used everywhere an uploaded clip is shown (community chat,
// DMs, resource library). It solves three problems the raw <video> tag had:
//
//  1. Orientation - a portrait clip forced into a full-width `object-contain`
//     box became a thin strip in a sea of black. We read the real dimensions on
//     `loadedmetadata` and size the frame to fit a max box while KEEPING the
//     clip's aspect ratio, so a vertical video shows vertical and a horizontal
//     one shows horizontal. Dimensions are computed in pixels (not `width:auto`
//     off an aspect-ratio) because the chat bubble is shrink-to-fit and would
//     otherwise collapse an auto-width child to 0.
//  2. Preview - browsers paint a black frame until the video plays. We nudge
//     `currentTime` forward a hair so the first frame renders as a poster.
//  3. Tap-to-play - the native control target is tiny and easy to miss (and on
//     mobile a parent tap handler can swallow it). We overlay a big, obvious
//     play button that starts playback and then hands over to native controls.
//
// maxW / maxH bound the display box; the clip is scaled to fit inside it.
export default function VideoPlayer({ url, className, maxW = 300, maxH = 420 }) {
  const ref = useRef(null)
  const [dims, setDims] = useState(null) // { w, h } in px, aspect-correct
  const [started, setStarted] = useState(false)
  const [errored, setErrored] = useState(false)

  function fit(vw, vh) {
    const ratio = vw / vh
    // Contain within the maxW x maxH box, preserving aspect ratio.
    let w = maxW
    let h = Math.round(w / ratio)
    if (h > maxH) { h = maxH; w = Math.round(h * ratio) }
    return { w, h }
  }

  function onMeta(e) {
    const v = e.currentTarget
    if (v.videoWidth && v.videoHeight) setDims(fit(v.videoWidth, v.videoHeight))
    // Paint the first frame as a poster instead of a black box.
    try { if (v.currentTime < 0.05) v.currentTime = 0.1 } catch { /* seeking may be blocked pre-load */ }
  }

  function play(e) {
    e.stopPropagation()
    const v = ref.current
    if (!v) return
    setStarted(true)
    v.play().catch(() => { /* user can retry with the native controls */ })
  }

  if (errored) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cx('flex items-center justify-center gap-2 rounded-xl bg-cloud text-xs font-medium text-smoke', className)}
        style={{ width: maxW, height: Math.round(maxW * 9 / 16), maxWidth: '100%' }}
      >
        <Icon name="video" className="h-5 w-5" /> Open video
      </a>
    )
  }

  // Before metadata loads, show a 16:9 placeholder at the max width so the play
  // button has somewhere to sit; it snaps to the real shape once we know it.
  const box = dims || { w: maxW, h: Math.round(maxW * 9 / 16) }

  return (
    <div
      className={cx('relative mx-auto overflow-hidden rounded-xl bg-black', className)}
      style={{ width: box.w, height: box.h, maxWidth: '100%' }}
    >
      <video
        ref={ref}
        src={url}
        playsInline
        preload="metadata"
        controls={started}
        onLoadedMetadata={onMeta}
        onError={() => setErrored(true)}
        className="h-full w-full object-contain"
      />

      {!started && (
        <button
          type="button"
          onClick={play}
          aria-label="Play video"
          className="group absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/30 to-transparent"
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
