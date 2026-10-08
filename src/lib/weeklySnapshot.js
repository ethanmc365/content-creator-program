// THE WEEKLY SNAPSHOT: one picture (SVG) and one paragraph (text) of the numbers a country-manager meeting needs.
//
// 9 Oct 2026. Ethan: "I'm running these weekly meetings with all the country managers, and currently I have to bring a lot of info
// ... Give me a weekly snapshot somewhere ... and an SVG that I can share on the Meet." Every figure comes from the one RPC,
// `admin_views_gained`, so the picture, the text and the page can never disagree. Pure functions: no network, no DOM.

const ORANGE = '#d94407'
const ORANGE_LIGHT = '#f5853f'
const INK = '#1c1c1c'
const SMOKE = '#6b6b6b'

export const compact = (n) => {
  const v = Number(n) || 0
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, '')}k`
  return String(Math.round(v))
}

export const pctChange = (now, before) => (Number(before) > 0 ? Math.round(((Number(now) - Number(before)) / Number(before)) * 100) : null)

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const day = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
export const rangeLabel = (from, to) => (from === to ? day(from) : `${day(from)} to ${day(to)}`)

/** Which halves count: 'community', 'vip' or 'both'. */
export function viewsFor(row, scope) {
  if (scope === 'community') return Number(row.community) || 0
  if (scope === 'vip') return Number(row.vip) || 0
  return (Number(row.community) || 0) + (Number(row.vip) || 0)
}

/** The paragraph for a chat message or an email. */
export function snapshotText(r, scope = 'both') {
  if (!r?.totals) return ''
  const t = r.totals
  const p = r.prev || {}
  const now = viewsFor(t, scope)
  const before = viewsFor(p, scope)
  const ch = pctChange(now, before)
  const which = scope === 'community' ? 'community' : scope === 'vip' ? 'VIP' : 'community + VIP'
  const lines = [
    `Tryp.com Creator Community, ${rangeLabel(r.from, r.to)}`,
    `Views gained (${which}): ${compact(now)}${ch == null ? '' : ` (${ch >= 0 ? '+' : ''}${ch}% on the ${r.days} days before)`}`,
  ]
  if (scope === 'both') lines.push(`  Community ${compact(t.community)} · VIP ${compact(t.vip)}`)
  lines.push(`Videos posted: ${(Number(t.videos) || 0) + (scope === 'community' ? 0 : Number(t.vip_videos) || 0)} · New creators: ${t.new_members} · Creators whose videos gained views: ${t.active_creators}`)
  lines.push('', 'By market:')
  for (const m of (r.markets || []).filter((x) => viewsFor(x, scope) > 0 || x.new_members > 0 || x.videos > 0)) {
    lines.push(`- ${m.name}: ${compact(viewsFor(m, scope))} views · ${m.videos} videos · ${m.new_members} new creators · ${m.active_creators} active`)
  }
  return lines.join('\n')
}

/** The daily bars, folded into weeks when there are too many days to read. */
export function foldWeeks(daily) {
  const out = new Map()
  for (const r of daily) {
    const dt = new Date(`${r.d}T12:00:00Z`)
    const mon = new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10)
    const cur = out.get(mon) || { d: mon, community: 0, vip: 0 }
    cur.community += Number(r.community) || 0
    cur.vip += Number(r.vip) || 0
    out.set(mon, cur)
  }
  return [...out.values()]
}

/** 1280x720 SVG, self-contained (no external fonts or images) so it pastes into Slides, Meet or chat. */
export function snapshotSvg(r, scope = 'both', title = 'Weekly snapshot') {
  const W = 1280
  const H = 720
  const t = r?.totals || {}
  const p = r?.prev || {}
  const now = viewsFor(t, scope)
  const before = viewsFor(p, scope)
  const ch = pctChange(now, before)
  const chText = ch == null ? 'no earlier week to compare' : `${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch)}% on the ${r.days} days before`
    const which = scope === 'community' ? 'Community' : scope === 'vip' ? 'VIP creators' : 'Community + VIP'

  const rows = (r?.markets || []).filter((m) => viewsFor(m, scope) > 0 || m.new_members > 0 || m.videos > 0).slice(0, 7)
  const maxRow = Math.max(1, ...rows.map((m) => viewsFor(m, scope)))
  const series = r?.days > 21 ? foldWeeks(r.daily || []) : (r?.daily || [])
  const maxBar = Math.max(1, ...series.map((d) => (scope === 'community' ? d.community : scope === 'vip' ? d.vip : d.community + d.vip)))

  // chart box
  const cx0 = 48, cy0 = 300, cw = 560, chh = 230
  const bw = series.length ? Math.min(54, (cw - 8 * (series.length - 1)) / series.length) : 40
  const gap = series.length > 1 ? (cw - bw * series.length) / (series.length - 1) : 0
  const bars = series.map((d, i) => {
    const c = scope === 'vip' ? 0 : d.community
    const v = scope === 'community' ? 0 : d.vip
    const hc = Math.round((c / maxBar) * chh)
    const hv = Math.round((v / maxBar) * chh)
    const x = cx0 + i * (bw + gap)
    const label = r.days > 21 ? day(d.d) : new Date(`${d.d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
    return `<g>
      <rect x="${x.toFixed(1)}" y="${cy0 + chh - hc}" width="${bw.toFixed(1)}" height="${hc}" rx="6" fill="${ORANGE}"/>
      <rect x="${x.toFixed(1)}" y="${cy0 + chh - hc - hv}" width="${bw.toFixed(1)}" height="${hv}" rx="6" fill="${INK}"/>
      <text x="${(x + bw / 2).toFixed(1)}" y="${cy0 + chh + 20}" font-size="13" text-anchor="middle" fill="${SMOKE}">${esc(label)}</text>
    </g>`
  }).join('')

  const table = rows.map((m, i) => {
    const y = 306 + i * 52
    const v = viewsFor(m, scope)
    const w = Math.max(4, Math.round((v / maxRow) * 190))
    const mch = pctChange(viewsFor(m, scope), scope === 'both' ? m.prev_combined : null)
    return `<g>
      <text x="676" y="${y + 17}" font-size="17" font-weight="700" fill="${INK}">${esc(m.name)}</text>
      <rect x="676" y="${y + 26}" width="190" height="7" rx="3.5" fill="#f1ece8"/>
      <rect x="676" y="${y + 26}" width="${w}" height="7" rx="3.5" fill="${ORANGE}"/>
      <text x="880" y="${y + 17}" font-size="17" font-weight="800" fill="${INK}">${compact(v)}</text>
      ${mch == null ? '' : `<text x="880" y="${y + 36}" font-size="12" fill="${mch >= 0 ? '#16803c' : '#b91c1c'}">${mch >= 0 ? '▲' : '▼'} ${Math.abs(mch)}%</text>`}
      <text x="962" y="${y + 17}" font-size="15" fill="${SMOKE}">${m.videos} videos</text>
      <text x="962" y="${y + 36}" font-size="13" fill="${SMOKE}">${m.new_members} new · ${m.active_creators} active</text>
    </g>`
  }).join('')

  const tile = (x, label, big, accent) => `<g>
    <rect x="${x}" y="150" width="${x === 48 ? 440 : 360}" height="108" rx="20" fill="${accent ? ORANGE : '#ffffff'}" ${accent ? '' : 'stroke="#ece6e1"'}/>
    <text x="${x + 22}" y="182" font-size="13" font-weight="700" letter-spacing="1.4" fill="${accent ? '#ffe3d2' : SMOKE}">${esc(label.toUpperCase())}</text>
    <text x="${x + 22}" y="230" font-size="46" font-weight="800" fill="${accent ? '#ffffff' : INK}">${esc(big)}</text>
  </g>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Poppins, 'Helvetica Neue', Arial, sans-serif" role="img" aria-label="${esc(title)}">
  <defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${ORANGE}"/><stop offset="1" stop-color="${ORANGE_LIGHT}"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="#faf7f4"/>
  <rect width="${W}" height="108" fill="url(#hg)"/>
  <text x="48" y="46" font-size="14" font-weight="700" letter-spacing="2" fill="#ffe3d2">TRYP.COM CREATOR COMMUNITY</text>
  <text x="48" y="86" font-size="34" font-weight="800" fill="#ffffff">${esc(title)} · ${esc(rangeLabel(r.from, r.to))}</text>
  <text x="${W - 48}" y="86" font-size="16" font-weight="700" text-anchor="end" fill="#ffffff">${esc(which)}</text>

  ${tile(48, 'Views gained', compact(now), true)}
  <text x="70" y="250" font-size="14" fill="#ffe3d2">${esc(chText)}</text>
  ${tile(512, 'Videos posted', String((Number(t.videos) || 0) + (scope === 'community' ? 0 : Number(t.vip_videos) || 0)), false)}
  ${tile(888, 'New creators', String(t.new_members ?? 0), false)}

  <text x="48" y="290" font-size="13" font-weight="700" letter-spacing="1.4" fill="${SMOKE}">VIEWS GAINED ${r.days > 21 ? 'PER WEEK' : 'PER DAY'}</text>
  ${bars}
  <g font-size="12" fill="${SMOKE}">
    ${scope !== 'vip' ? `<rect x="48" y="${cy0 + chh + 42}" width="12" height="12" rx="3" fill="${ORANGE}"/><text x="66" y="${cy0 + chh + 52}">Community ${compact(t.community)}</text>` : ''}
    ${scope !== 'community' ? `<rect x="${scope === 'vip' ? 48 : 200}" y="${cy0 + chh + 42}" width="12" height="12" rx="3" fill="${INK}"/><text x="${scope === 'vip' ? 66 : 218}" y="${cy0 + chh + 52}">VIP ${compact(t.vip)}</text>` : ''}
  </g>

  <text x="676" y="290" font-size="13" font-weight="700" letter-spacing="1.4" fill="${SMOKE}">BY MARKET</text>
  ${table}

  <text x="48" y="${H - 28}" font-size="13" fill="${SMOKE}">Views gained inside the dates shown, not lifetime totals. ${scope === 'both' ? 'Community and VIP added together.' : ''}</text>
</svg>`
}
