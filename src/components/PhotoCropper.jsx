import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Modal, Spinner } from './ui'
import Icon from './Icon'
import { useT } from '../lib/i18n'

// POSITION AND ZOOM A PROFILE PHOTO BEFORE IT UPLOADS (28 Sep 2026).
//
// Ethan: "whenever uploading their profile photo, I would like to have the
// option to move it around a bit and zoom in a bit, so whenever they actually
// upload it, they can make it appear exactly how they want it."
//
// A square stage with the circle the avatar will be cut to. Drag to move, and
// zoom with the slider, a pinch, or the scroll wheel. The picture always covers
// the whole square - it can never be pulled so far that an edge shows - which
// is the rule every phone's own photo cropper follows, so nothing here needs
// explaining. "Use this photo" draws exactly the square you see onto a canvas
// and hands back a WebP (or JPEG where WebP cannot be encoded).
//
// Geometry, in stage pixels: the image is drawn at `base * zoom` of its natural
// size, where `base` makes it just cover the square; `x`, `y` is how far its
// centre sits from the stage's centre.

const MAX_ZOOM = 4

const clampOffset = (x, y, dispW, dispH, S) => {
  const mx = Math.max(0, (dispW - S) / 2)
  const my = Math.max(0, (dispH - S) / 2)
  return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) }
}

export default function PhotoCropper({ src, open, onCancel, onDone, outputSize = 1080 }) {
  const tr = useT()
  const stageRef = useRef(null)
  const imgRef = useRef(null)
  const [S, setS] = useState(300)
  const [nat, setNat] = useState(null) // { w, h }
  // Zoom and position move together, so they are one piece of state and every
  // change is one pure update from the previous value.
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const zoom = view.zoom
  const pos = view
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const pointers = useRef(new Map())
  const gesture = useRef(null)

  // New picture: back to centred and unzoomed.
  useEffect(() => { setView({ zoom: 1, x: 0, y: 0 }); setNat(null) }, [src])

  useLayoutEffect(() => {
    if (!open) return undefined
    const el = stageRef.current
    if (!el) return undefined
    const measure = () => setS(el.clientWidth || 300)
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [open])

  const base = nat ? Math.max(S / nat.w, S / nat.h) : 1
  const dispW = nat ? nat.w * base * zoom : S
  const dispH = nat ? nat.h * base * zoom : S

  const fit = useCallback((z, x, y) => {
    const w = nat ? nat.w * base * z : S
    const h = nat ? nat.h * base * z : S
    return { zoom: z, ...clampOffset(x, y, w, h, S) }
  }, [nat, base, S])

  // Zoom about the centre of the stage: the point there stays there.
  const setZoomAround = useCallback((next) => {
    setView((v) => {
      const z = Math.min(MAX_ZOOM, Math.max(1, typeof next === 'function' ? next(v.zoom) : next))
      const k = z / v.zoom
      return fit(z, v.x * k, v.y * k)
    })
  }, [fit])
  const moveTo = useCallback((x, y) => setView((v) => fit(v.zoom, x, y)), [fit])
  const nudge = useCallback((dx, dy) => setView((v) => fit(v.zoom, v.x + dx, v.y + dy)), [fit])

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = stageRef.current
    if (!el || !open) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      const f = Math.exp(-e.deltaY * 0.0015)
      setZoomAround((z) => z * f)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [open, setZoomAround])

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    setDragging(true)
    if (pts.length === 1) gesture.current = { kind: 'drag', start: pts[0], from: { x: pos.x, y: pos.y } }
    if (pts.length === 2) {
      gesture.current = { kind: 'pinch', dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom }
    }
  }
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    const pts = [...pointers.current.values()]
    if (g.kind === 'drag' && pts.length === 1) {
      moveTo(g.from.x + (pts[0].x - g.start.x), g.from.y + (pts[0].y - g.start.y))
    } else if (g.kind === 'pinch' && pts.length >= 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (g.dist > 0) setZoomAround(g.zoom * (d / g.dist))
    }
  }
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId)
    const pts = [...pointers.current.values()]
    gesture.current = pts.length === 1 ? { kind: 'drag', start: pts[0], from: { x: pos.x, y: pos.y } } : null
    if (!pts.length) setDragging(false)
  }

  const onKeyDown = (e) => {
    const step = e.shiftKey ? 20 : 6
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    if (moves[e.key]) {
      e.preventDefault()
      nudge(moves[e.key][0], moves[e.key][1])
    } else if (e.key === '+' || e.key === '=') setZoomAround((z) => z * 1.1)
    else if (e.key === '-') setZoomAround((z) => z / 1.1)
  }

  async function finish() {
    const img = imgRef.current
    if (!img || !nat) return
    setBusy(true)
    try {
      const scale = base * zoom // stage px per source px
      const size = S / scale // the square, in source px
      const cx = nat.w / 2 - pos.x / scale
      const cy = nat.h / 2 - pos.y / scale
      const sx = Math.max(0, Math.min(nat.w - size, cx - size / 2))
      const sy = Math.max(0, Math.min(nat.h - size, cy - size / 2))
      const out = Math.round(Math.min(outputSize, size))
      const canvas = document.createElement('canvas')
      canvas.width = out
      canvas.height = out
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, sx, sy, size, size, 0, 0, out, out)
      const blob = await new Promise((resolve) => canvas.toBlob((b) => {
        if (b && b.type === 'image/webp') resolve(b)
        else canvas.toBlob((j) => resolve(j), 'image/jpeg', 0.88)
      }, 'image/webp', 0.86))
      if (!blob) throw new Error('Could not prepare that photo.')
      await onDone(blob)
    } finally {
      setBusy(false)
    }
  }

  const pct = (zoom - 1) / (MAX_ZOOM - 1)

  return (
    <Modal open={open} onClose={() => !busy && onCancel()} title={tr('Position your photo')}>
      <div className="space-y-5">
        <div
          ref={stageRef}
          tabIndex={0}
          role="application"
          aria-label={tr('Drag to move the photo. Use the slider or pinch to zoom.')}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative mx-auto aspect-square w-full max-w-[320px] cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-ink outline-none focus-visible:ring-4 focus-visible:ring-brand/30 active:cursor-grabbing"
        >
          {src && (
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: dispW,
                height: dispH,
                transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
                opacity: nat ? 1 : 0,
                transition: dragging ? 'none' : 'opacity 0.2s',
              }}
            />
          )}
          {/* The circle the avatar will be, with everything outside it dimmed. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-inset ring-white/90"
            style={{ boxShadow: '0 0 0 999px rgba(10,10,14,0.55)' }}
          />
          {!nat && <span className="absolute inset-0 flex items-center justify-center"><Spinner className="h-6 w-6 text-white" /></span>}
        </div>

        <div className="mx-auto flex max-w-[320px] items-center gap-3">
          <button type="button" onClick={() => setZoomAround((z) => z / 1.2)} aria-label={tr('Zoom out')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cloud text-smoke hover:text-ink">
            <span className="text-lg font-bold leading-none">−</span>
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoomAround(Number(e.target.value))}
            aria-label={tr('Zoom')}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-cloud accent-brand"
            style={{ background: `linear-gradient(to right, #d94407 ${pct * 100}%, #F1F1F2 ${pct * 100}%)` }}
          />
          <button type="button" onClick={() => setZoomAround((z) => z * 1.2)} aria-label={tr('Zoom in')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cloud text-smoke hover:text-ink">
            <Icon name="plus" className="h-4 w-4" />
          </button>
        </div>
        <p className="text-center text-xs text-smoke">{tr('Drag to move. Pinch, scroll or use the slider to zoom.')}</p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost justify-center">{tr('Cancel')}</button>
          <button type="button" onClick={finish} disabled={busy || !nat} className="btn-primary justify-center disabled:opacity-50">
            {busy ? <Spinner className="h-4 w-4" /> : <><Icon name="check" className="h-4 w-4" /> {tr('Use this photo')}</>}
          </button>
        </div>
      </div>
    </Modal>
  )
}
