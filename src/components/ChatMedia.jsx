import { useRef, useState } from 'react'
import { mediaType, fileNameFromUrl, saveFile } from '../lib/media'
import VideoPlayer from './VideoPlayer'
import { Spinner } from './ui'
import Icon from './Icon'

// A chat / DM attachment (image or video). Videos use the browser's native
// <video controls> (reliable play button + inline playback everywhere, incl.
// iOS) with a real captured poster frame. A LONG-PRESS (or right-click on
// desktop) on either opens a small menu to Open full screen or Save it. Saving
// routes through saveFile: mobile share sheet ("Save Image/Video" to the camera
// roll), desktop download.
//
// `kind` ('image' | 'video') is passed explicitly by the caller (an optimistic
// blob: URL has no extension to sniff); falls back to the extension otherwise.
export default function ChatMedia({ url, alt, kind, maxW = 240, maxH = 360 }) {
  const isVideo = (kind || mediaType(url)) === 'video'
  const [saving, setSaving] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
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

  return (
    <div className="relative select-none" style={{ WebkitTouchCallout: 'none' }} {...press}>
      {isVideo ? (
        <VideoPlayer url={url} maxW={maxW} maxH={maxH} />
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open image full size"
          onClick={(e) => { if (fired.current) e.preventDefault() }}
        >
          <img src={url} alt={alt || 'Shared image'} loading="lazy" draggable={false} className="max-h-80 w-full rounded-xl object-cover" />
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
