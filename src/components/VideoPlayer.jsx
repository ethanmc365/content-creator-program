import { useRef, useState } from 'react'
import Icon from './Icon'
import { cx } from '../lib/utils'

// Inline video player used everywhere an uploaded clip is shown (community chat,
// DMs, resource library). WhatsApp-style: it shows the clip's actual first
// frame as the preview (sized to the real orientation), with a big play button
// that plays the video INLINE, right in place.
//
//  1. Orientation - we read the real dimensions on `loadedmetadata` and size the
//     box (in explicit pixels, because the chat bubble is shrink-to-fit and an
//     auto width off aspect-ratio collapses to 0) so vertical shows vertical.
//  2. Real poster - browsers often paint a black frame until play. We seek to
//     the first frame (`#t=0.1`) AND capture it to a canvas, then paint that
//     captured image over the video so a real frame is ALWAYS visible, even on
//     iOS where the bare <video> stays black until tapped.
//  3. Inline play - a large overlay play button starts `.play()` in place
//     (`playsInline`), then hands over to native controls; it never leaves chat.
//
// guardRef (optional): a ref set true by a parent long-press so a hold-to-save
// gesture doesn't also trigger playback.
export default function VideoPlayer({ url, className, maxW = 300, maxH = 420, guardRef }) {
  const ref = useRef(null)
  const [dims, setDims] = useState(null) // { w, h } in px, aspect-correct
  const [poster, setPoster] = useState(null) // captured first-frame data URL
  const [started, setStarted] = useState(false)
  const [errored, setErrored] = useState(false)

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

  // Once a real frame has decoded, snapshot it to a canvas so we can show a
  // guaranteed-visible poster (the <video> itself may still render black on iOS).
  function onFrame(e) {
    if (poster || started) return
    const v = e.currentTarget
    try {
      const c = document.createElement('canvas')
      c.width = v.videoWidth
      c.height = v.videoHeight
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
      setPoster(c.toDataURL('image/jpeg', 0.7))
    } catch { /* cross-origin taint - fall back to the video's own frame */ }
  }

  function play(e) {
    e.stopPropagation()
    if (guardRef?.current) return // a long-press just fired - don't play
    const v = ref.current
    if (!v) return
    setStarted(true)
    try { v.currentTime = 0 } catch { /* ignore */ }
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

  const box = dims || { w: maxW, h: Math.round(maxW * 9 / 16) }

  return (
    <div
      className={cx('relative mx-auto overflow-hidden rounded-xl bg-black', className)}
      style={{ width: box.w, height: box.h, maxWidth: '100%' }}
    >
      <video
        ref={ref}
        src={`${url}#t=0.1`}
        crossOrigin="anonymous"
        playsInline
        preload="metadata"
        controls={started}
        onLoadedMetadata={onMeta}
        onLoadedData={onFrame}
        onSeeked={onFrame}
        onError={() => setErrored(true)}
        className="h-full w-full object-contain"
      />

      {/* Captured first frame, painted over the video until it plays. */}
      {!started && poster && (
        <img src={poster} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
      )}

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
