import { useRef, useState } from 'react'
import { mediaType, fileNameFromUrl, saveFile } from '../lib/media'
import VideoPlayer from './VideoPlayer'
import { Spinner } from './ui'

// A chat / DM attachment (image or video) rendered WhatsApp-style: the media
// shows inline sized to its real orientation, videos play in place, and a
// LONG-PRESS (or right-click on desktop) offers to save it - on mobile that
// opens the native share sheet whose "Save Image/Video" drops it in the camera
// roll (via saveFile). A quick tap still opens an image full-size or plays a
// video; the long-press guard (`fired`) suppresses that tap when a hold fired.
export default function ChatMedia({ url, alt, maxW = 240, maxH = 360 }) {
  const type = mediaType(url)
  const [saving, setSaving] = useState(false)
  const fired = useRef(false)
  const timer = useRef(null)
  const origin = useRef(null)

  async function doSave() {
    if (saving) return
    setSaving(true)
    try { await saveFile(url, fileNameFromUrl(url)) } finally { setSaving(false) }
  }

  function start(e) {
    fired.current = false
    const p = e.touches?.[0] || e
    origin.current = { x: p.clientX, y: p.clientY }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { fired.current = true; doSave() }, 500)
  }
  function move(e) {
    if (!timer.current) return
    const p = e.touches?.[0] || e
    if (origin.current && Math.hypot(p.clientX - origin.current.x, p.clientY - origin.current.y) > 12) {
      clearTimeout(timer.current); timer.current = null // scrolled/dragged - cancel
    }
  }
  function end() { clearTimeout(timer.current); timer.current = null }

  const press = {
    onTouchStart: start, onTouchMove: move, onTouchEnd: end,
    onMouseDown: start, onMouseMove: move, onMouseUp: end, onMouseLeave: end,
    onContextMenu: (e) => { e.preventDefault(); if (!fired.current) { fired.current = true; doSave() } },
  }

  const savingOverlay = saving && (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/30">
      <span className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-ink shadow-lift">
        <Spinner className="h-4 w-4" /> Saving…
      </span>
    </div>
  )

  if (type === 'video') {
    return (
      <div className="relative select-none" {...press}>
        <VideoPlayer url={url} maxW={maxW} maxH={maxH} guardRef={fired} />
        {savingOverlay}
      </div>
    )
  }

  // Image: tap opens full-size, long-press saves.
  return (
    <div className="relative select-none" {...press}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open image full size"
        onClick={(e) => { if (fired.current) e.preventDefault() }}
      >
        <img src={url} alt={alt || 'Shared image'} loading="lazy" className="max-h-80 w-full rounded-xl object-cover" />
      </a>
      {savingOverlay}
    </div>
  )
}
