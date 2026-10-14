import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ResponsiveContainer } from 'recharts'
import Icon from '../Icon'
import { cx, downloadCsv } from '../../lib/utils'

// ONE CARD FOR EVERY ANALYTICS CHART (14 Oct 2026).
//
// The team: "clicking on the graph title should open up the graph where we can scroll through all the history of the
// data, and zoom out in different views ... ensure that this is built for all of the graphs", and "rather than shrinking
// an insane amount" the per-challenge charts should scroll sideways. So:
//
//  * the TITLE opens the chart full screen (ChartExplorer) with every point, a range (recent / all), a zoom, and the
//    two downloads - CSV for a spreadsheet, PNG for a meeting slide;
//  * with `minPoint`, a chart with more points than fit is drawn at `points x minPoint` wide inside a sideways scroller
//    that starts at the newest end, instead of squeezing fifty bars into a card;
//  * `render(data, { explorer })` draws the chart, so the card and the explorer are the same chart.
//
// `data` is the WHOLE series; `recent` (a number) is how many of the latest points the card shows by default.
export default function ChartPanel({
  title, subtitle, data = [], render, csv, height = 256, minPoint = 0, recent = 0, className, actions, empty = 'Nothing to show yet', delay = 0,
}) {
  const [open, setOpen] = useState(false)
  const shown = recent && data.length > recent ? data.slice(-recent) : data
  const hidden = data.length - shown.length
  const hasData = shown.length > 0
  return (
    <section className={cx('card flex min-w-0 flex-col animate-rise', className)} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <button type="button" onClick={() => hasData && setOpen(true)} className="group min-w-0 text-left" disabled={!hasData}>
          <h2 className="flex items-center gap-1.5 font-semibold transition-colors group-hover:text-brand">
            {title}
            {hasData && <Icon name="expand" className="h-3.5 w-3.5 text-gray-300 transition-colors group-hover:text-brand" />}
          </h2>
          {subtitle && <p className="mt-1 text-xs text-smoke">{subtitle}</p>}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {hidden > 0 && (
            <button type="button" onClick={() => setOpen(true)} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-smoke transition-colors hover:bg-cloud hover:text-brand">
              +{hidden} earlier
            </button>
          )}
          {csv && hasData && (
            <button type="button" onClick={() => downloadCsv(csv.name, csv.rows ?? data)} title="Download CSV"
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-cloud hover:text-brand">
              <Icon name="download" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {hasData
        ? <ChartBody data={shown} render={render} height={height} minPoint={minPoint} />
        : <div className="flex flex-1 items-center justify-center rounded-xl bg-cloud/50 text-sm text-smoke" style={{ height }}>{empty}</div>}
      {open && <ChartExplorer title={title} subtitle={subtitle} data={data} render={render} csv={csv} minPoint={minPoint} onClose={() => setOpen(false)} />}
    </section>
  )
}

// The chart at the card's width, or wider and scrolling when there are more points than fit.
function ChartBody({ data, render, height, minPoint, explorer = false }) {
  const box = useRef(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return undefined
    const m = () => setW(el.clientWidth)
    m()
    const ro = new ResizeObserver(m)
    ro.observe(el)
    // A hidden pane does not deliver ResizeObserver callbacks; a timer measures once more.
    const t = setTimeout(m, 300)
    return () => { ro.disconnect(); clearTimeout(t) }
  }, [])
  const need = minPoint ? data.length * minPoint + 64 : 0
  const inner = Math.max(w, need)
  const scrolls = w > 0 && need > w
  // Newest at the right, so a scroller opens on the latest points.
  useEffect(() => {
    if (scrolls && box.current) box.current.scrollLeft = box.current.scrollWidth
  }, [scrolls, data.length, minPoint])
  return (
    <div ref={box} className={cx('relative min-w-0', scrolls && 'overflow-x-auto pb-2 [scrollbar-width:thin]')} style={{ height: height + (scrolls ? 10 : 0) }}>
      {w > 0 && (
        <div style={{ width: scrolls ? inner : '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">{render(data, { explorer })}</ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

const ZOOMS = [24, 40, 64, 96, 140]

export function ChartExplorer({ title, subtitle, data, render, csv, minPoint, onClose }) {
  const [range, setRange] = useState('all')
  const [zoom, setZoom] = useState(() => (minPoint ? Math.max(1, ZOOMS.findIndex((z) => z >= minPoint)) : 2))
  const shot = useRef(null)
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = prev }
  }, [onClose])
  const ranges = [
    ...(data.length > 6 ? [{ k: 6, label: 'Latest 6' }] : []),
    ...(data.length > 12 ? [{ k: 12, label: 'Latest 12' }] : []),
    ...(data.length > 24 ? [{ k: 24, label: 'Latest 24' }] : []),
    { k: 'all', label: `All ${data.length}` },
  ]
  const shown = range === 'all' ? data : data.slice(-range)
  async function png() {
    const { snapshotNode, downloadBlob, slugForFile } = await import('../../lib/domSnapshot')
    const blob = await snapshotNode(shot.current, { scale: 2 })
    await downloadBlob(blob, slugForFile(String(title), 'chart'))
  }
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] animate-page-in sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={String(title)} className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-lift animate-pop-in sm:rounded-3xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">{title}</h2>
            {subtitle && <p className="text-xs text-smoke">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-smoke transition-colors hover:bg-cloud hover:text-ink">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 pt-4 sm:px-6">
          <div className="flex gap-1 rounded-full bg-cloud p-1">
            {ranges.map((r) => (
              <button key={r.k} type="button" onClick={() => setRange(r.k)} aria-pressed={range === r.k}
                className={cx('rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', range === r.k ? 'bg-brand text-white' : 'text-smoke hover:text-ink')}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-full bg-cloud p-1">
            <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0}
              className="flex h-7 w-7 items-center justify-center rounded-full text-lg font-bold text-smoke transition-colors hover:bg-white hover:text-ink disabled:opacity-30">−</button>
            <span className="w-12 text-center text-[11px] font-semibold text-smoke">Zoom</span>
            <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1}
              className="flex h-7 w-7 items-center justify-center rounded-full text-lg font-bold text-smoke transition-colors hover:bg-white hover:text-ink disabled:opacity-30">+</button>
          </div>
          <span className="flex-1" />
          {csv && (
            <button type="button" onClick={() => downloadCsv(csv.name, csv.rows ?? data)} className="btn-secondary !px-3 !py-2 text-xs">
              <Icon name="download" className="h-4 w-4" /> CSV
            </button>
          )}
          <button type="button" onClick={png} className="btn-secondary !px-3 !py-2 text-xs">
            <Icon name="image" className="h-4 w-4" /> PNG for slides
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4 sm:px-6">
          <div ref={shot} className="rounded-2xl bg-white p-2">
            <p className="mb-2 px-1 text-sm font-semibold text-ink">{title}</p>
            <ChartBody key={`${range}-${zoom}`} data={shown} render={render} height={420} minPoint={ZOOMS[zoom]} explorer />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
