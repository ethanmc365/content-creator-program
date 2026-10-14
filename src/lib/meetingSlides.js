// THE MEETING DECK (14 Oct 2026). "On the weekly meetings, each manager will have the slides and share the info from
// their market ... being able to choose specific challenges ... Even if two slides are necessary, and global slides."
//
// Every slide is a self-contained 1280x720 SVG (no external fonts; thumbnails and photos are passed in as data URIs by
// the caller, or drawn as an initial) built from the same `admin_views_gained` answer as the page, so the deck, the page
// and the CSV cannot disagree. Pure functions: no network, no DOM.
import { compact, foldWeeks, pctChange, rangeLabel, snapshotSvg, viewsFor } from './weeklySnapshot'

const ORANGE = '#d94407'
const ORANGE_LIGHT = '#f5853f'
const INK = '#1c1c1c'
const SMOKE = '#6b6b6b'
const W = 1280
const H = 720
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clip = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t }

function frame(title, sub, right, body, foot = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Poppins, 'Helvetica Neue', Arial, sans-serif" role="img" aria-label="${esc(title)}">
  <defs>
    <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${ORANGE}"/><stop offset="1" stop-color="${ORANGE_LIGHT}"/></linearGradient>
    <clipPath id="thumb"><rect width="186" height="236" rx="16"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#faf7f4"/>
  <rect width="${W}" height="108" fill="url(#hg)"/>
  <text x="48" y="46" font-size="14" font-weight="700" letter-spacing="2" fill="#ffe3d2">${esc(sub.toUpperCase())}</text>
  <text x="48" y="86" font-size="34" font-weight="800" fill="#ffffff">${esc(title)}</text>
  <text x="${W - 48}" y="86" font-size="16" font-weight="700" text-anchor="end" fill="#ffffff">${esc(right)}</text>
  ${body}
  ${foot ? `<text x="48" y="${H - 28}" font-size="13" fill="${SMOKE}">${esc(foot)}</text>` : ''}
</svg>`
}

const avatar = (x, y, r, name, uri) => (uri
  ? `<g><clipPath id="a${x}${y}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath><image href="${uri}" x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#a${x}${y})"/></g>`
  : `<g><circle cx="${x}" cy="${y}" r="${r}" fill="#fde3d1"/><text x="${x}" y="${y + r * 0.36}" font-size="${Math.round(r * 0.9)}" font-weight="800" text-anchor="middle" fill="${ORANGE}">${esc(String(name || '?').trim().slice(0, 1).toUpperCase())}</text></g>`)

/** The headline slide: the existing snapshot, titled for a market when there is one. */
export function overviewSlide(r, scope, title, marketName) {
  const t = marketName ? `${marketName} · ${title}` : title
  return snapshotSvg(r, scope, t)
}

/** Who and what gained most: top creators on the left, top videos (as thumbnails) on the right. */
export function leadersSlide(r, scope, { title, marketName, images = {} }) {
  const creators = (r?.top_creators || []).filter((c) => scope === 'both' || (scope === 'vip') === !!c.vip).slice(0, 6)
  const videos = (r?.top_videos || []).filter((v) => scope === 'both' || (scope === 'vip') === !!v.vip).slice(0, 6)
  const maxC = Math.max(1, ...creators.map((c) => Number(c.views) || 0))
  const left = creators.map((c, i) => {
    const y = 176 + i * 78
    const w = Math.max(6, Math.round(((Number(c.views) || 0) / maxC) * 300))
    return `<g>
      <text x="48" y="${y + 8}" font-size="22" font-weight="800" fill="${i < 3 ? ORANGE : SMOKE}">${i + 1}</text>
      ${avatar(104, y, 24, c.name, images[c.photo_url])}
      <text x="142" y="${y - 2}" font-size="19" font-weight="700" fill="${INK}">${esc(clip(c.name, 22))}${c.vip ? ' · VIP' : ''}</text>
      <rect x="142" y="${y + 10}" width="300" height="8" rx="4" fill="#f1ece8"/>
      <rect x="142" y="${y + 10}" width="${w}" height="8" rx="4" fill="${ORANGE}"/>
      <text x="456" y="${y + 6}" font-size="20" font-weight="800" fill="${INK}">+${compact(c.views)}</text>
      <text x="456" y="${y + 26}" font-size="12" fill="${SMOKE}">${c.videos} ${Number(c.videos) === 1 ? 'video' : 'videos'}</text>
    </g>`
  }).join('')
  const right = videos.map((v, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = 640 + col * 202
    const y = 140 + row * 270
    const thumb = images[v.thumb]
    return `<g>
      <svg x="${x}" y="${y}" width="186" height="236">
        <rect width="186" height="236" rx="16" fill="${INK}"/>
        ${thumb ? `<image href="${thumb}" width="186" height="236" preserveAspectRatio="xMidYMid slice" clip-path="url(#thumb)"/>` : `<text x="93" y="122" font-size="14" text-anchor="middle" fill="#ffffff" opacity="0.6">${esc(v.platform || 'Video')}</text>`}
        <rect y="140" width="186" height="96" fill="#000000" opacity="0.55"/>
      </svg>
      <text x="${x + 12}" y="${y + 196}" font-size="24" font-weight="800" fill="#ffffff">+${compact(v.views)}</text>
      <text x="${x + 12}" y="${y + 220}" font-size="13" fill="#ffffff" opacity="0.85">${esc(clip(v.name, 20))}${v.vip ? ' · VIP' : ''}</text>
    </g>`
  }).join('')
  const empty = `<text x="48" y="200" font-size="18" fill="${SMOKE}">No views gained in these dates.</text>`
  return frame(
    `${marketName ? `${marketName} · ` : ''}Who gained most`,
    'Tryp.com Creator Community',
    `${title} · ${rangeLabel(r.from, r.to)}`,
    `<text x="48" y="140" font-size="13" font-weight="700" letter-spacing="1.4" fill="${SMOKE}">TOP CREATORS</text>
     <text x="640" y="128" font-size="13" font-weight="700" letter-spacing="1.4" fill="${SMOKE}">TOP VIDEOS</text>
     ${creators.length ? left : empty}${right}`,
    'Views gained inside the dates shown. A creator in several videos counts once, with every video added together.',
  )
}

/** One challenge as it stands: the podium five, the entries and views, and how the markets split it. */
export function challengeSlide(ch, { results = [], entries = 0, creators = 0, views = 0, title, images = {} }) {
  const top = results.slice(0, 5)
  const pts = ch.scoring === 'points'
  const rows = top.map((r, i) => {
    const y = 300 + i * 76
    return `<g>
      <rect x="48" y="${y - 32}" width="700" height="64" rx="16" fill="${i === 0 ? '#fff1e8' : '#ffffff'}" stroke="#ece6e1"/>
      <text x="76" y="${y + 9}" font-size="24" font-weight="800" fill="${i < 3 ? ORANGE : SMOKE}">${r.rank ?? i + 1}</text>
      ${avatar(136, y, 22, r.name, images[r.photo_url])}
      <text x="172" y="${y + 7}" font-size="20" font-weight="700" fill="${INK}">${esc(clip(r.name, 26))}</text>
      <text x="720" y="${y + 8}" font-size="20" font-weight="800" text-anchor="end" fill="${INK}">${pts ? `${Number(r.final_views || 0).toLocaleString('en-GB')} pts` : compact(r.final_views)}</text>
    </g>`
  }).join('')
  const tile = (x, label, big) => `<g><rect x="${x}" y="140" width="250" height="100" rx="20" fill="#ffffff" stroke="#ece6e1"/>
    <text x="${x + 20}" y="170" font-size="12" font-weight="700" letter-spacing="1.4" fill="${SMOKE}">${esc(label.toUpperCase())}</text>
    <text x="${x + 20}" y="216" font-size="40" font-weight="800" fill="${INK}">${esc(big)}</text></g>`
  const left = ch.status === 'active' && ch.end_date ? Math.max(0, Math.ceil((Date.parse(ch.end_date) - Date.now()) / 864e5)) : null
  return frame(
    clip(ch.title, 40),
    'Tryp.com Creator Community · challenge',
    title,
    `${tile(48, 'Entries', String(entries))}${tile(318, 'Creators', String(creators))}${tile(588, 'Views', compact(views))}
     <g><rect x="858" y="140" width="374" height="100" rx="20" fill="${ORANGE}"/>
       <text x="878" y="170" font-size="12" font-weight="700" letter-spacing="1.4" fill="#ffe3d2">${ch.status === 'active' ? 'STATUS' : 'FINISHED'}</text>
       <text x="878" y="216" font-size="34" font-weight="800" fill="#ffffff">${ch.status === 'active' ? (left === 0 ? 'Last day' : `${left} days left`) : 'Final'}</text></g>
     <text x="48" y="262" font-size="13" font-weight="700" letter-spacing="1.4" fill="${SMOKE}">${ch.status === 'active' ? 'LEADERBOARD RIGHT NOW' : 'FINAL LEADERBOARD'}</text>
     ${rows || `<text x="48" y="320" font-size="18" fill="${SMOKE}">No results yet.</text>`}
     <text x="800" y="300" font-size="15" fill="${SMOKE}">${esc(pts ? 'Ranked by points.' : 'Ranked by views.')}</text>`,
    ch.status === 'active' ? 'Standings can still change until the challenge closes.' : '',
  )
}

/** The market table on its own slide, for a deck that leads with the worldwide picture. */
export function marketsSlide(r, scope, title) {
  const rows = (r?.markets || []).filter((m) => viewsFor(m, scope) > 0 || m.videos > 0).slice(0, 8)
  const max = Math.max(1, ...rows.map((m) => viewsFor(m, scope)))
  const body = rows.map((m, i) => {
    const y = 170 + i * 64
    const v = viewsFor(m, scope)
    const ch = scope === 'both' ? pctChange(v, m.prev_combined) : null
    return `<g>
      <text x="48" y="${y + 6}" font-size="20" font-weight="700" fill="${INK}">${esc(m.name)}</text>
      <rect x="300" y="${y - 10}" width="560" height="18" rx="9" fill="#f1ece8"/>
      <rect x="300" y="${y - 10}" width="${Math.max(8, Math.round((v / max) * 560))}" height="18" rx="9" fill="${ORANGE}"/>
      <text x="880" y="${y + 6}" font-size="20" font-weight="800" fill="${INK}">${compact(v)}</text>
      ${ch == null ? '' : `<text x="980" y="${y + 6}" font-size="15" font-weight="700" fill="${ch >= 0 ? '#16803c' : '#b91c1c'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch)}%</text>`}
      <text x="1070" y="${y + 6}" font-size="15" fill="${SMOKE}">${m.videos} videos</text>
    </g>`
  }).join('')
  return frame('Markets, side by side', 'Tryp.com Creator Community', `${title} · ${rangeLabel(r.from, r.to)}`,
    `<text x="48" y="140" font-size="13" font-weight="700" letter-spacing="1.4" fill="${SMOKE}">VIEWS GAINED BY MARKET</text>${body}`,
    'A creator counts for their home market; a VIP for their VIP market.')
}

export { foldWeeks }

/** An SVG string to a PNG blob at 2x, for Slides, Meet and WhatsApp. */
export function svgToPng(svg, scale = 2) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = W * scale; c.height = H * scale
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      c.toBlob((b) => resolve(b), 'image/png')
    }
    img.onerror = () => resolve(null)
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

/** Image URLs to data URIs (best effort, 4s each), so a slide carries its pictures inside it. */
export async function inlineImages(urls) {
  const out = {}
  await Promise.all([...new Set(urls.filter(Boolean))].map(async (u) => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 4000)
      const res = await fetch(u, { signal: ctrl.signal })
      clearTimeout(t)
      if (!res.ok) return
      const blob = await res.blob()
      if (!blob.type.startsWith('image/')) return
      out[u] = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => ok(null); fr.readAsDataURL(blob) })
    } catch { /* a missing picture becomes an initial or a plain tile */ }
  }))
  return out
}
