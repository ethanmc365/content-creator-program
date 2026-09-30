// ONE BAR, SEVERAL SHARES, NO GAPS (1 Oct 2026).
//
// Ethan, on the KPI status strip: "the colours are not connected: the green and the yellow ...
// There should be a smooth gradient connection." And on the Money page's cash / vouchers bar: "merge
// those colours into a nice gradient to show them as still separate".
//
// So a split bar is ONE element whose background is a linear-gradient: each share holds its own
// colour across most of its width, and eases into the next over a short blend either side of the
// seam. Still readable as separate parts, never two blocks with a hole between them.
//
// parts: [{ value, color }] in drawing order. Zero-value parts are skipped.
// blend: how wide the soft seam is, in % of the whole bar (each side of the boundary).
export function splitGradient(parts, { blend = 4, direction = '90deg' } = {}) {
  const live = (parts || []).filter((p) => p && p.value > 0)
  const total = live.reduce((s, p) => s + p.value, 0)
  if (!total) return 'transparent'
  if (live.length === 1) return live[0].color
  const stops = []
  let at = 0
  live.forEach((p, i) => {
    const w = (p.value / total) * 100
    const start = at
    const end = at + w
    // Never blend further than a third of a thin share, or it would vanish into its neighbours.
    const b = Math.min(blend, w / 3)
    stops.push(`${p.color} ${(i === 0 ? start : start + b).toFixed(2)}%`)
    stops.push(`${p.color} ${(i === live.length - 1 ? end : end - b).toFixed(2)}%`)
    at = end
  })
  return `linear-gradient(${direction}, ${stops.join(', ')})`
}

// The status colours on WHITE (cards, tiles). Bright and light, in the platform's own warm range:
// met is a fresh emerald, on track is the brand orange, behind is a soft amber, missed a soft red.
export const STATUS_HEX = {
  met: '#34d399',
  on_track: '#f5853f',
  behind: '#fbbf24',
  missed: '#f87171',
  upcoming: '#e5e7eb',
}

// The same statuses drawn ON the orange hero card, where each has to read against #d94407..#f5853f.
export const STATUS_HEX_ON_BRAND = {
  met: '#6ee7b7',
  on_track: '#ffffff',
  behind: '#fde68a',
  missed: '#fecaca',
  upcoming: 'rgba(255,255,255,0.45)',
}

export const STATUS_ORDER = ['met', 'on_track', 'behind', 'missed', 'upcoming']

/** A status spread (counts per status) as one smooth bar background. */
export function statusGradient(counts, palette = STATUS_HEX) {
  return splitGradient(STATUS_ORDER.map((k) => ({ value: counts[k] || 0, color: palette[k] })))
}
