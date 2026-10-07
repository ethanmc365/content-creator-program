import { useEffect, useRef, useState } from 'react'
import { Modal, Spinner } from './ui'
import Icon from './Icon'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// CIRCLE THE BIT THAT MATTERS (7 Oct 2026).
//
// Ethan, for FAQ answers: "maybe the ability to add an image circling something". A screenshot of where a button is
// only helps if the button is obvious, so before an image goes into an answer it can be marked up: a circle, an
// arrow, or a freehand line, in Tryp orange or white, with undo. What is saved is the flattened picture; nothing else
// has to understand the marks.
const COLOURS = ['#d94407', '#ffffff', '#111111']
const TOOLS = [
  { key: 'circle', label: 'Circle' },
  { key: 'arrow', label: 'Arrow' },
  { key: 'pen', label: 'Pen' },
]
const MAX = 1600

function drawShape(ctx, s) {
  ctx.save()
  ctx.strokeStyle = s.colour
  ctx.fillStyle = s.colour
  ctx.lineWidth = s.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (s.tool === 'circle') {
    const cx_ = (s.a.x + s.b.x) / 2
    const cy = (s.a.y + s.b.y) / 2
    const rx = Math.max(4, Math.abs(s.b.x - s.a.x) / 2)
    const ry = Math.max(4, Math.abs(s.b.y - s.a.y) / 2)
    ctx.beginPath()
    ctx.ellipse(cx_, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
  } else if (s.tool === 'arrow') {
    const { a, b } = s
    const ang = Math.atan2(b.y - a.y, b.x - a.x)
    const head = s.width * 4.5
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x - Math.cos(ang) * head * 0.6, b.y - Math.sin(ang) * head * 0.6); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(b.x, b.y)
    ctx.lineTo(b.x - head * Math.cos(ang - 0.45), b.y - head * Math.sin(ang - 0.45))
    ctx.lineTo(b.x - head * Math.cos(ang + 0.45), b.y - head * Math.sin(ang + 0.45))
    ctx.closePath(); ctx.fill()
  } else if (s.tool === 'pen' && s.points.length > 1) {
    ctx.beginPath()
    ctx.moveTo(s.points[0].x, s.points[0].y)
    for (const p of s.points.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * @param {File}     file     the picked image
 * @param {Function} onDone   called with a Blob (the marked-up image) - or the original file if nothing was drawn
 * @param {Function} onClose
 */
export default function ImageMarkup({ file, onDone, onClose, busy = false }) {
  const tr = useT()
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const [tool, setTool] = useState('circle')
  const [colour, setColour] = useState(COLOURS[0])
  const [shapes, setShapes] = useState([])
  const live = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const c = canvasRef.current
      if (!c) return
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      imgRef.current = img
      setReady(true)
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const width = () => Math.max(4, Math.round((canvasRef.current?.width || 800) / 140))

  const redraw = (extra) => {
    const c = canvasRef.current
    const img = imgRef.current
    if (!c || !img) return
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0, c.width, c.height)
    for (const s of shapes) drawShape(ctx, s)
    if (extra) drawShape(ctx, extra)
  }
  useEffect(() => { if (ready) redraw() })

  const point = (e) => {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }
  }
  const down = (e) => {
    if (!ready) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p = point(e)
    live.current = { tool, colour, width: width(), a: p, b: p, points: [p] }
  }
  const move = (e) => {
    if (!live.current) return
    const p = point(e)
    live.current = { ...live.current, b: p, points: live.current.tool === 'pen' ? [...live.current.points, p] : live.current.points }
    redraw(live.current)
  }
  const up = () => {
    const s = live.current
    live.current = null
    if (!s) return
    const moved = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > 6 || s.points.length > 3
    if (moved) setShapes((cur) => [...cur, s])
    else redraw()
  }

  const save = () => {
    if (!shapes.length) { onDone(file); return }
    canvasRef.current.toBlob((blob) => onDone(blob ? new File([blob], 'marked-up.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', 0.9)
  }

  return (
    <Modal open onClose={onClose} title={tr('Mark up the image')}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {TOOLS.map((t) => (
            <button key={t.key} type="button" aria-pressed={tool === t.key} onClick={() => setTool(t.key)}
              className={cx('rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200', tool === t.key ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-ink hoverable:hover:border-brand')}>
              {tr(t.label)}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-gray-200" />
          {COLOURS.map((c) => (
            <button key={c} type="button" aria-label={c} aria-pressed={colour === c} onClick={() => setColour(c)}
              className={cx('h-7 w-7 rounded-full border-2 transition-transform duration-200', colour === c ? 'scale-110 border-brand' : 'border-gray-200')} style={{ background: c }} />
          ))}
          <button type="button" onClick={() => setShapes((s) => s.slice(0, -1))} disabled={!shapes.length} className="ml-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-smoke disabled:opacity-40 hoverable:hover:text-ink">
            <Icon name="refresh" className="h-3.5 w-3.5" />{tr('Undo')}
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-cloud">
          {!ready && <div className="flex h-48 items-center justify-center"><Spinner className="h-5 w-5" /></div>}
          <canvas
            ref={canvasRef}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            className={cx('block h-auto max-h-[60vh] w-full touch-none object-contain', tool === 'pen' ? 'cursor-crosshair' : 'cursor-cell', !ready && 'hidden')}
          />
        </div>
        <p className="text-xs text-smoke">{tr('Drag on the picture to draw. Circles and arrows are easiest to read.')}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">{tr('Cancel')}</button>
          <button type="button" onClick={save} disabled={!ready || busy} className="btn-primary flex-1 justify-center disabled:opacity-50">
            {busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}{shapes.length ? tr('Add marked-up image') : tr('Add image')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
