import { useRef, useState } from 'react'
import { mediaType, fileNameFromUrl, saveFile } from '../lib/media'
import VideoPlayer from './VideoPlayer'
import { Spinner } from './ui'
import Icon from './Icon'

// A chat / DM attachment (image or video) rendered WhatsApp-style: the media
// shows inline sized to its real orientation, videos stay paused until the play
// button is pressed and then play in place, and a LONG-PRESS (or right-click on
// desktop) opens a small menu to Open full screen or Save it. Saving routes
// through saveFile: on mobile that's the native share sheet ("Save Image/Video"
// to the camera roll), on desktop a download.
//
// `kind` ('image' | 'video') is passed explicitly by the caller because an
// optimistic blob: URL has no file extension to sniff; it falls back to the
// extension when omitted (fine for already-uploaded URLs, e.g. DMs).
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
      clearTimeout(timer.current); timer.current = null // scrolled/dragged - cancel
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
        <VideoPlayer url={url} maxW={maxW} maxH={maxH} guardRef={fired} />
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
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/30">
          <span className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-ink shadow-lift">
            <Spinner className="h-4 w-4" /> Saving…
          </span>
        </div>
      )}

      {/* Long-press / right-click options menu. Fixed + centered so the chat
          bubble's overflow-hidden can't clip it. */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6"
          onClick={() => setMenuOpen(false)}
          onContextMenu={(e) => { e.preventDefault(); setMenuOpen(false) }}
        >
          <div className="w-64 overflow-hidden rounded-2xl bg-white shadow-lift" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={openFull} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium hover:bg-cloud">
              <Icon name="expand" className="h-5 w-5 text-smoke" /> Open full screen
            </button>
            <button type="button" onClick={doSave} className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-3.5 text-left text-sm font-medium hover:bg-cloud">
              <Icon name="arrow-down" className="h-5 w-5 text-smoke" /> {isVideo ? 'Save video' : 'Save photo'}
            </button>
            <button type="button" onClick={() => setMenuOpen(false)} className="flex w-full items-center justify-center border-t border-gray-100 px-4 py-3 text-left text-sm text-smoke hover:bg-cloud">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
