// ONE LOOK FOR EVERY CHART (30 Sep 2026).
//
// Ethan: "We have graphs, but some of them have nice gradients, and others are just solid colours.
// Make sure that everything works together nicely." Each chart used to declare its own orange, its
// own pale orange (three different ones) and, sometimes, its own gradient. They now share these.
//
// THE GRADIENTS ARE DEFINED ONCE, IN THE DOCUMENT, NOT IN EACH CHART. `ChartGradients` is mounted at
// the app root as a zero-size SVG (not display:none - some browsers then refuse to paint a gradient
// referenced from elsewhere), and any chart fills with `url(#tg-...)`. An id declared twice by two
// charts on one page was a real hazard before: the first one wins, whatever the second meant.
export const CHART = {
  brand: '#d94407',
  light: '#f5853f',
  pale: '#fde3d1',
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
        <V id="tg-green" from="#047857" to="#10b981" />
        <V id="tg-amber" from="#d97706" to="#fbbf24" />
        <V id="tg-red" from="#b91c1c" to="#f87171" />
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
