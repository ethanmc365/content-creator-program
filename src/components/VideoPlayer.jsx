import { useEffect, useRef, useState } from 'react'
import { cx } from '../lib/utils'

// Inline video player: the browser's native <video controls> (reliable play +
// inline playback everywhere incl. iOS).
//
// Preview frame: iOS paints a black box until a frame is decoded, and it will
// NOT decode a hidden/offscreen element (so an upload-time canvas thumbnail came
// out solid black on iOS). The trick that DOES work is on the VISIBLE element:
// when it scrolls into view we play it muted for an instant and immediately
// pause - that forces the first frame to render and it stays shown, with the
// native play button over it. No separate poster image, so sends are faster too.
export default function VideoPlayer({ url, className, maxW = 300, maxH = 420 }) {
  const ref = useRef(null)
  const [dims, setDims] = useState(null)
  const revealed = useRef(false)

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

  // Reveal the first frame once the player is on screen.
  useEffect(() => {
    const v = ref.current
    if (!v) return
    const reveal = () => {
      if (revealed.current || !v.paused) return
      revealed.current = true
      v.muted = true
      const p = v.play()
      if (p && typeof p.then === 'function') {
        p.then(() => {
          // A frame has rendered; freeze on it and restore sound for real play.
          v.pause()
          v.muted = false
        }).catch(() => { revealed.current = false }) // e.g. Low Power Mode - leave it; tap plays
      }
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) reveal() }),
      { threshold: 0.2 }
    )
    io.observe(v)
    return () => io.disconnect()
  }, [url])

  const box = dims || { w: maxW, h: Math.round(maxW * 9 / 16) }

  return (
    <div
      className={cx('mx-auto overflow-hidden rounded-xl bg-black', className)}
      style={{ width: box.w, height: box.h, maxWidth: '100%' }}
    >
      <video
        ref={ref}
        src={url}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={onMeta}
        className="h-full w-full object-contain"
      />
    </div>
  )
}
