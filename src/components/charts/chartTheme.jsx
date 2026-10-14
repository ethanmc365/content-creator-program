// ONE LOOK FOR EVERY CHART.
//
// Each chart used to declare its own orange, its own pale orange (three different ones) and, sometimes, its own
// gradient. They now share these.
//
// THE GRADIENTS ARE DEFINED ONCE, IN THE DOCUMENT, NOT IN EACH CHART. `ChartGradients` is mounted at
// the app root as a zero-size SVG (not display:none - some browsers then refuse to paint a gradient
// referenced from elsewhere), and any chart fills with `url(#tg-...)`. An id declared twice by two
// charts on one page was a real hazard before: the first one wins, whatever the second meant.
export const CHART = {
  brand: '#d94407',
  light: '#f5853f',
  pale: '#fde3d1',
  rest: '#eef0f3',
  grid: '#F1F1F2',
  axis: '#8A8A8F',
  ink: '#1A1A1A',
  muted: '#9CA3AF',
}

// Fills by name, for Bar/Area `fill`.
export const FILL = {
  brand: 'url(#tg-brand)', // the main series: dark at the base, light at the top
  light: 'url(#tg-light)', // a second series beside it
  pale: 'url(#tg-pale)', // the "still to go" / background series
  area: 'url(#tg-area)', // under a line
  brandH: 'url(#tg-brand-h)', // a horizontal bar
  green: 'url(#tg-green)',
  amber: 'url(#tg-amber)',
  red: 'url(#tg-red)',
  gray: 'url(#tg-gray)',
  // "Still to go" in a neutral light grey, not a beige ().
  rest: 'url(#tg-rest)',
}

// A COLOUR PER MARKET THAT FOLLOWS THE MARKET, never its rank (validated with the dataviz palette
// checker: lightness band, chroma, colour-blind separation and contrast all pass). Global challenges
// are the brand orange; the markets take the rest in a fixed alphabetical order.
export const SCOPE_COLORS = ['#d94407', '#2563eb', '#0d9488', '#9333ea', '#db2777', '#0284c7', '#65a30d', '#b45309']

export const tooltipStyle = {
  borderRadius: 12, border: '1px solid #F1F1F2', fontFamily: 'Poppins',
  fontSize: 12, boxShadow: '0 4px 16px rgba(26,26,26,0.08)', background: '#fff',
}
export const axisTick = { fontSize: 11, fill: '#6B7280' }
export const axisTickSmall = { fontSize: 10, fill: '#9CA3AF' }

function V({ id, from, to }) {
  return (
    <linearGradient id={id} x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stopColor={from} />
      <stop offset="100%" stopColor={to} />
    </linearGradient>
  )
}

export function ChartGradients() {
  return (
    <svg aria-hidden width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} focusable="false">
      <defs>
        <V id="tg-brand" from="#d94407" to="#f5853f" />
        <V id="tg-light" from="#f5853f" to="#f9b98a" />
        <V id="tg-pale" from="#fcd9c2" to="#fdeee4" />
        <V id="tg-green" from="#10b981" to="#6ee7b7" />
        <V id="tg-amber" from="#f59e0b" to="#fcd34d" />
        <V id="tg-red" from="#ef4444" to="#fca5a5" />
        <V id="tg-rest" from="#eceef2" to="#f5f6f8" />
        <V id="tg-gray" from="#d1d5db" to="#e5e7eb" />
        <linearGradient id="tg-brand-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f5853f" />
          <stop offset="100%" stopColor="#d94407" />
        </linearGradient>
        <linearGradient id="tg-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d94407" stopOpacity={0.28} />
          <stop offset="100%" stopColor="#d94407" stopOpacity={0.02} />
        </linearGradient>
      </defs>
    </svg>
  )
}

// ONE SET OF MARK PROPS FOR EVERY CHART (14 Oct 2026). The team counted "so many different types of graphs, so many
// different colours": bars with 8px tops beside bars with 6px, square stacks beside round ones, three tick sizes. Every
// analytics chart spreads these instead of choosing its own.
export const BAR_TOP = [6, 6, 0, 0]
export const BAR_END = [0, 6, 6, 0]
export const gridProps = { strokeDasharray: '3 3', stroke: CHART.grid, vertical: false }
export const xAxisProps = { tick: axisTick, tickLine: false, axisLine: { stroke: CHART.grid }, tickMargin: 8 }
export const yAxisProps = { tick: axisTick, tickLine: false, axisLine: false, width: 48 }
export const lineProps = { type: 'monotone', strokeWidth: 2.5, dot: { r: 3, fill: CHART.brand, strokeWidth: 0 }, activeDot: { r: 5 }, animationDuration: 600 }
export const barProps = { radius: BAR_TOP, maxBarSize: 40, animationDuration: 600 }
export const cursorFill = { fill: 'rgba(217,68,7,0.06)' }

/**
 * A STACK WITH ONE ROUNDED TOP. Recharts rounds a stacked segment whether or not anything sits on it, so a week where
 * the top series was zero showed square corners on the segment below it and round ones elsewhere ("some of them have
 * hard corners, and some of them have rounded corners"). `stackShape(keys, key)` rounds a segment only when it is the
 * highest non-zero one in its column.
 */
export function stackShape(keys, key, r = 6) {
  return function StackSegment(props) {
    const { x, y, width, height, fill, payload } = props
    if (!height || height <= 0) return null
    const above = keys.slice(keys.indexOf(key) + 1).some((k) => Number(payload?.[k]) > 0)
    const rr = above ? 0 : Math.min(r, width / 2, height)
    if (!rr) return <rect x={x} y={y} width={width} height={height} fill={fill} />
    const d = `M${x},${y + height} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + width - rr},${y} Q${x + width},${y} ${x + width},${y + rr} L${x + width},${y + height} Z`
    return <path d={d} fill={fill} />
  }
}
