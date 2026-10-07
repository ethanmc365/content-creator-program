import { useEffect, useRef, useState } from 'react'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// A SIGNATURE, TWO WAYS (7 Oct 2026).
//
// Ethan: "on mobile they could actually type with their finger or just type with the keyboard and then it would show up
// as an automatic signature ... on desktop they would just type in and it would show up as the automatic signature."
//
// Either way the result is the same record: the typed full name (always required, it is what a person reads on the
// register) plus an SVG of the mark - the name set in a handwriting face, or the strokes the finger drew. SVG rather
// than a PNG: a few hundred bytes, sharp at any size, and readable as text if anybody ever has to look inside one.
export const SIGNATURE_FONT = "'Dancing Script', 'Brush Script MT', 'Segoe Script', cursive"
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap'

export function useSignatureFont() {
  useEffect(() => {
    if (document.querySelector('link[data-signature-font]')) return
    const l = document.createElement('link')
    l.rel = 'stylesheet'; l.href = FONT_HREF; l.dataset.signatureFont = '1'
    document.head.appendChild(l)
  }, [])
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The SVG for a typed name. */
export function typedSignatureSvg(name) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 160"><text x="20" y="108" font-family="${SIGNATURE_FONT.replace(/"/g, '')}" font-size="72" fill="#111">${esc(name)}</text></svg>`
}

/** A stored signature, drawn at the size it is shown. A typed one is set in the page's own copy of the handwriting face
 *  (an SVG shown as an <img> cannot load a web font); a drawn one is its strokes. */
export function SignatureImage({ svg, method, name, className, textClass = 'text-[34px]' }) {
  useSignatureFont()
  if (method === 'typed' && name) return <span className={cx('block truncate leading-none text-ink', textClass, className)} style={{ fontFamily: SIGNATURE_FONT }}>{name}</span>
  if (!svg) return null
  return <img alt="" className={cx('block h-auto', className)} src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} />
}

/**
 * @param {Function} onChange  ({ method: 'typed'|'drawn', name, svg }) or null while it is not a signature yet
 */
export default function SignaturePad({ defaultName = '', onChange }) {
  const tr = useT()
  useSignatureFont()
  const [mode, setMode] = useState('type')
  const [name, setName] = useState(defaultName)
  const [strokes, setStrokes] = useState([])
  const live = useRef(null)
  const svgRef = useRef(null)

  useEffect(() => {
    const full = name.trim()
    if (full.length < 3) { onChange(null); return }
    if (mode === 'type') onChange({ method: 'typed', name: full, svg: typedSignatureSvg(full) })
    else if (strokes.length) onChange({ method: 'drawn', name: full, svg: drawnSvg(strokes) })
    else onChange(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, name, strokes])

  const pt = (e) => {
    const r = svgRef.current.getBoundingClientRect()
    return [Math.round(((e.clientX - r.left) / r.width) * 600), Math.round(((e.clientY - r.top) / r.height) * 200)]
  }
  // THE STROKE IS COPIED INTO A LOCAL BEFORE IT GOES INTO AN UPDATER (7 Oct 2026). React runs a state updater
  // later, and by then a pointerup may have set `live.current` to null - so a quick stroke stored `null` as a line
  // and the next render crashed in pathOf ("Cannot read properties of null (reading 'length')"), which is the
  // "Mayday" page Ethan hit while signing in the Testing Centre.
  const down = (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const stroke = [pt(e)]
    live.current = stroke
    setStrokes((s) => [...s, stroke])
  }
  const move = (e) => {
    if (!live.current) return
    const stroke = [...live.current, pt(e)]
    live.current = stroke
    setStrokes((s) => [...s.slice(0, -1), stroke])
  }
  const up = () => { live.current = null }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label">{tr('Your full legal name')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="input no-ios-zoom" placeholder={tr('First and last name')} />
      </label>
      <div className="flex gap-1.5">
        {[['type', tr('Type it')], ['draw', tr('Draw it')]].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}
            className={cx('flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200', mode === k ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-ink hoverable:hover:border-brand')}>
            <Icon name={k === 'type' ? 'pencil' : 'sparkles'} className="h-3.5 w-3.5" />{l}
          </button>
        ))}
      </div>
      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-white">
        {mode === 'type' ? (
          <div className="flex h-36 items-center px-5">
            <span className={cx('signature-ink truncate text-[44px] leading-none text-ink transition-opacity duration-300', name.trim() ? 'opacity-100' : 'opacity-25')} style={{ fontFamily: SIGNATURE_FONT }}>
              {name.trim() || tr('Your name')}
            </span>
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox="0 0 600 200"
            className="block h-36 w-full touch-none cursor-crosshair"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
          >
            {strokes.filter(Boolean).map((s, i) => <path key={i} d={pathOf(s)} fill="none" stroke="#111" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />)}
            {!strokes.length && <text x="300" y="110" textAnchor="middle" fill="#c4c4c4" fontSize="22">{tr('Sign here with your finger or mouse')}</text>}
          </svg>
        )}
        <span aria-hidden className="pointer-events-none absolute bottom-5 left-5 right-5 border-b border-gray-200" />
        {mode === 'draw' && strokes.length > 0 && (
          <button type="button" onClick={() => setStrokes([])} className="absolute right-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-smoke shadow-sm hoverable:hover:text-ink">{tr('Clear')}</button>
        )}
      </div>
    </div>
  )
}

function pathOf(points) {
  if (!Array.isArray(points) || !points.length) return ''
  if (points.length === 1) return `M${points[0][0]} ${points[0][1]} l0.1 0`
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')
}

function drawnSvg(strokes) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200">${strokes.filter(Boolean).map((s) => `<path d="${pathOf(s)}" fill="none" stroke="#111" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`
}
