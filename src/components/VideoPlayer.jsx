import { useState } from 'react'
import { posterPathFor } from '../lib/videoPoster'
import { cx } from '../lib/utils'

// Inline video player: the browser's OWN native <video controls>, which is the
// version that reliably shows a play button and plays inline everywhere incl.
// iOS Safari (custom overlay buttons were failing to start playback there).
//
//  * Preview - `poster` is a real thumbnail captured from the file at upload
//    time (see videoPoster.js). For public chat URLs we derive it from the clip
//    URL (same path, .jpg); DMs pass a signed poster URL explicitly.
//  * Orientation - we read the real dimensions on `loadedmetadata` and size the
//    box in explicit pixels (the chat bubble is shrink-to-fit, so an auto width
//    off aspect-ratio collapses to 0), so a vertical clip shows vertical.
export default function VideoPlayer({ url, poster, className, maxW = 300, maxH = 420 }) {
  const [dims, setDims] = useState(null)

  // Public chat clips: the poster lives at the same URL with a .jpg extension.
  // DM clips pass an explicit (signed) poster and skip this.
  const posterUrl = poster ?? (/^https?:/i.test(url) ? posterPathFor(url) : undefined)

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

  const box = dims || { w: maxW, h: Math.round(maxW * 9 / 16) }

  return (
    <div
      className={cx('mx-auto overflow-hidden rounded-xl bg-black', className)}
      style={{ width: box.w, height: box.h, maxWidth: '100%' }}
    >
      <video
        src={url}
        poster={posterUrl}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={onMeta}
        className="h-full w-full object-contain"
      />
    </div>
  )
}
