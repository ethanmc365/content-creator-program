// THE MEETING DECK (14 Oct 2026). "On the weekly meetings, each manager will have the slides and share the info from
// their market ... being able to choose specific challenges ... Even if two slides are necessary, and global slides."
//
// Every slide is a self-contained 1280x720 SVG (no external fonts; thumbnails and photos are passed in as data URIs by
// the caller, or drawn as an initial) built from the same `admin_views_gained` answer as the page, so the deck, the page
// and the CSV cannot disagree. Pure functions: no network, no DOM.
import { compact, foldWeeks, pctChange, rangeLabel, snapshotSvg, viewsFor } from './weeklySnapshot'
import { challengeDaysLeft } from './utils'

const ORANGE = '#d94407'
const ORANGE_LIGHT = '#f5853f'
const INK = '#1c1c1c'
const SMOKE = '#6b6b6b'
const W = 1280
const H = 720
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clip = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t }

// ONE HEADER, FOUR TONES (15 Oct 2026). "They all look very similar": each kind of slide now has its own header colour,
// and every slide says WHERE (the market's flag, or a globe for Worldwide) and WHEN (the dates in a pill) at a glance.
// `badge` is a flag emoji, 'globe', or null.
const TONES = {
  orange: { bg: 'url(#hg)', kick: '#ffe3d2', title: '#ffffff' },
  ink: { bg: INK, kick: ORANGE_LIGHT, title: '#ffffff' },
  light: { bg: '#fff1e8', kick: ORANGE, title: INK },
  green: { bg: 'url(#hg)', kick: '#ffe3d2', title: '#ffffff' },
}
const GLOBE = (cx, cy, r, c) => `<g fill="none" stroke="${c}" stroke-width="2.4"><circle cx="${cx}" cy="${cy}" r="${r}"/><ellipse cx="${cx}" cy="${cy}" rx="${r * 0.45}" ry="${r}"/><path d="M${cx - r} ${cy} H${cx + r} M${cx - r * 0.86} ${cy - r * 0.5} H${cx + r * 0.86} M${cx - r * 0.86} ${cy + r * 0.5} H${cx + r * 0.86}"/></g>`
export function slideHeader({ kicker, title, date, badge = null, tone = 'orange' }) {
  const t = TONES[tone] || TONES.orange
  const pillW = Math.max(150, String(date || '').length * 9 + 36)
  const pillX = W - 48 - (badge ? 76 : 0) - pillW
  return `<defs>
    <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${ORANGE}"/><stop offset="1" stop-color="${ORANGE_LIGHT}"/></linearGradient>
    <linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#047857"/><stop offset="1" stop-color="#10b981"/></linearGradient>
  </defs>
  <rect width="${W}" height="116" fill="${t.bg}"/>
  <path d="M0 112 H1280" stroke="${ORANGE_LIGHT}" stroke-width="4" opacity="0.4"/>
  <text x="48" y="48" font-size="14" font-weight="700" letter-spacing="2" fill="${t.kick}">${esc(String(kicker || '').toUpperCase())}</text>
  <text x="48" y="90" font-size="34" font-weight="800" fill="${t.title}">${esc(clip(title, Math.max(14, Math.floor(((date ? pillX : W - (badge ? 150 : 48)) - 72) / 18))))}</text>
  ${date ? `<g><rect x="${pillX}" y="38" width="${pillW}" height="40" rx="20" fill="#ffffff" ${tone === 'light' ? 'stroke="#f3d6c4"' : ''}/>
    <text x="${pillX + pillW / 2}" y="64" font-size="16" font-weight="700" text-anchor="middle" fill="${ORANGE}">${esc(date)}</text></g>` : ''}
  ${badge ? `<g><circle cx="${W - 78}" cy="58" r="30" fill="#ffffff"/>${badge === 'globe' ? GLOBE(W - 78, 58, 17, ORANGE) : `<text x="${W - 78}" y="70" font-size="32" text-anchor="middle">${esc(badge)}</text>`}</g>` : ''}`
}

function frame(head, body, foot = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Poppins, 'Helvetica Neue', Arial, sans-serif" role="img" aria-label="${esc(head.title)}">
  <rect width="${W}" height="${H}" fill="#faf8f6"/>
  <circle cx="1240" cy="670" r="230" fill="#f5853f" opacity="0.035"/>
  ${slideHeader(head)}
  ${body}
  ${foot ? `<text x="48" y="${H - 28}" font-size="13" fill="${SMOKE}">${esc(foot)}</text>` : ''}
</svg>`
}

/** Slide numbers, added once the deck's order is known: "3 / 7" bottom right. */
export function numberSlide(svg, n, total) {
  return svg.replace(/<\/svg>\s*$/, `<text x="${W - 48}" y="${H - 28}" font-size="13" font-weight="700" text-anchor="end" fill="${SMOKE}">${n} / ${total}</text></svg>`)
}

const avatar = (x, y, r, name, uri) => (uri
  ? `<g><clipPath id="a${x}${y}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath><image href="${uri}" x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#a${x}${y})"/></g>`
  : `<g><circle cx="${x}" cy="${y}" r="${r}" fill="#fde3d1"/><text x="${x}" y="${y + r * 0.36}" font-size="${Math.round(r * 0.9)}" font-weight="800" text-anchor="middle" fill="${ORANGE}">${esc(String(name || '?').trim().slice(0, 1).toUpperCase())}</text></g>`)

/** The headline slide: the existing snapshot, with the deck's header (where and when). */
export function overviewSlide(r, scope, title, marketName, badge = null) {
  const which = scope === 'community' ? 'Community' : scope === 'vip' ? 'VIP creators' : 'Community + VIP'
  return snapshotSvg(r, scope, title, {
    header: slideHeader({ kicker: `Tryp.com Creator Community · ${which}`, title: `${marketName || 'Worldwide'} · ${title}`, date: rangeLabel(r.from, r.to), badge: badge || (marketName ? null : 'globe'), tone: 'orange' }),
  })
}

/** Who and what gained most: top creators on the left, top videos (as thumbnails) on the right. */
export function leadersSlide(r, scope, { title, marketName, images = {}, badge = null }) {
  const creators = (r?.top_creators || []).filter((c) => scope === 'both' || (scope === 'vip') === !!c.vip).slice(0, 6)
  const videos = (r?.top_videos || []).filter((v) => scope === 'both' || (scope === 'vip') === !!v.vip).slice(0, 6)
  const maxC = Math.max(1, ...creators.map((c) => Number(c.views) || 0))
  const left = creators.map((c, i) => {
    const y = 196 + i * 76
    const w = Math.max(6, Math.round(((Number(c.views) || 0) / maxC) * 300))
    return `<g>
      <text x="48" y="${y + 8}" font-size="22" font-weight="800" fill="${i < 3 ? ORANGE : SMOKE}">${i + 1}</text>
      ${avatar(104, y, 24, c.name, images[c.photo_url])}
      <text x="142" y="${y - 2}" font-size="19" font-weight="700" fill="${INK}">${esc(clip(c.name, 22))}${c.vip ? ' · VIP' : ''}</text>
      <rect x="142" y="${y + 10}" width="300" height="8" rx="4" fill="#f1ece8"/>
      <rect x="142" y="${y + 10}" width="${w}" height="8" rx="4" fill="url(#hg)"/>
      <text x="456" y="${y + 6}" font-size="20" font-weight="800" fill="${INK}">+${compact(c.views)}</text>
      <text x="456" y="${y + 26}" font-size="12" fill="${SMOKE}">${c.videos} ${Number(c.videos) === 1 ? 'video' : 'videos'}</text>
    </g>`
  }).join('')
  const right = videos.map((v, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    // SIZED TO FIT (15 Oct 2026: the second row ran into the foot of the slide). Two rows of 170x226 end at y 640.
    const x = 640 + col * 196
    const y = 168 + row * 246
    const thumb = images[v.thumb]
    return `<g>
      <svg x="${x}" y="${y}" width="170" height="226">
        <defs><clipPath id="vt${i}"><rect width="170" height="226" rx="16"/></clipPath></defs>
        <rect width="170" height="226" rx="16" fill="${INK}"/>
        ${thumb ? `<image href="${thumb}" width="170" height="226" preserveAspectRatio="xMidYMid slice" clip-path="url(#vt${i})"/>` : `<text x="85" y="118" font-size="14" text-anchor="middle" fill="#ffffff" opacity="0.6">${esc(v.platform || 'Video')}</text>`}
        <rect y="136" width="170" height="90" fill="#000000" opacity="0.55" clip-path="url(#vt${i})"/>
        <circle cx="22" cy="22" r="14" fill="#ffffff"/>
        <text x="22" y="27" font-size="13" font-weight="800" text-anchor="middle" fill="${ORANGE}">${i + 1}</text>
      </svg>
      <text x="${x + 12}" y="${y + 186}" font-size="22" font-weight="800" fill="#ffffff">+${compact(v.views)}</text>
      <text x="${x + 12}" y="${y + 210}" font-size="13" fill="#ffffff" opacity="0.85">${esc(clip(v.name, 19))}${v.vip ? ' · VIP' : ''}</text>
    </g>`
  }).join('')
  const empty = `<text x="48" y="210" font-size="18" fill="${SMOKE}">No views gained in these dates.</text>`
  return frame(
    { kicker: `Tryp.com Creator Community · ${title}`, title: `${marketName || 'Worldwide'} · View leaders`, date: rangeLabel(r.from, r.to), badge: badge || (marketName ? null : 'globe'), tone: 'light' },
    `<text x="48" y="158" font-size="13" font-weight="700" letter-spacing="1.4" fill="${SMOKE}">TOP CREATORS</text>
     <text x="640" y="156" font-size="13" font-weight="700" letter-spacing="1.4" fill="${SMOKE}">TOP VIDEOS</text>
     <rect x="28" y="172" width="560" height="478" rx="24" fill="#ffffff" stroke="#eee7e2"/>
     ${creators.length ? left : empty}${right}`,
    'Views gained inside the dates shown. A creator in several videos counts once, with every video added together.',
  )
}

/** One challenge as it stands: the podium five, the entries and views, and how the markets split it. */
export function challengeSlide(ch, { results = [], entries = 0, creators = 0, views = 0, title, images = {}, badge = null, date = '' }) {
  const top = results.slice(0, 5)
  const pts = ch.scoring === 'points'
  const rows = top.map((r, i) => {
    const y = 316 + i * 74
    return `<g>
      <rect x="48" y="${y - 32}" width="700" height="64" rx="16" fill="${i === 0 ? '#fff1e8' : '#ffffff'}" stroke="#ece6e1"/>
      <text x="76" y="${y + 9}" font-size="24" font-weight="800" fill="${i < 3 ? ORANGE : SMOKE}">${r.rank ?? i + 1}</text>
      ${avatar(136, y, 22, r.name, images[r.photo_url])}
      <text x="172" y="${y + 7}" font-size="20" font-weight="700" fill="${INK}">${esc(clip(r.name, 26))}</text>
      <text x="720" y="${y + 8}" font-size="20" font-weight="800" text-anchor="end" fill="${INK}">${pts ? `${Number(r.final_views || 0).toLocaleString('en-GB')} pts` : compact(r.final_views)}</text>
    </g>`
  }).join('')
  const tile = (x, label, big) => `<g><rect x="${x}" y="148" width="250" height="100" rx="20" fill="#ffffff" stroke="#ece6e1"/>
    <text x="${x + 20}" y="178" font-size="12" font-weight="700" letter-spacing="1.4" fill="${SMOKE}">${esc(label.toUpperCase())}</text>
    <text x="${x + 20}" y="224" font-size="40" font-weight="800" fill="${INK}">${esc(big)}</text></g>`
  const left = ch.status === 'active' && ch.end_date ? Math.max(0, challengeDaysLeft(ch) ?? 0) : null
  return frame(
    { kicker: `Challenge · ${title}`, title: ch.title, date, badge: badge || 'globe', tone: ch.status === 'active' ? 'ink' : 'green' },
    `${tile(48, 'Entries', String(entries))}${tile(318, 'Creators', String(creators))}${tile(588, 'Views', compact(views))}
     <g><rect x="858" y="148" width="374" height="100" rx="20" fill="${ORANGE}"/>
       <text x="878" y="178" font-size="12" font-weight="700" letter-spacing="1.4" fill="#ffe3d2">${ch.status === 'active' ? 'STATUS' : 'FINISHED'}</text>
       <text x="878" y="224" font-size="34" font-weight="800" fill="#ffffff">${ch.status === 'active' ? (left === 0 ? 'Last day' : `${left} days left`) : 'Final'}</text></g>
     <text x="48" y="274" font-size="13" font-weight="700" letter-spacing="1.4" fill="${SMOKE}">${ch.status === 'active' ? 'LEADERBOARD RIGHT NOW' : 'FINAL LEADERBOARD'}</text>
     ${rows || `<text x="48" y="320" font-size="18" fill="${SMOKE}">No results yet.</text>`}
     <text x="800" y="316" font-size="15" fill="${SMOKE}">${esc(pts ? 'Ranked by points.' : 'Ranked by views.')}</text>`,
    ch.status === 'active' ? 'Standings can still change until the challenge closes.' : '',
  )
}

/** The market table on its own slide, for a deck that leads with the worldwide picture. */
export function marketsSlide(r, scope, title, flags = {}) {
  const rows = (r?.markets || []).filter((m) => viewsFor(m, scope) > 0 || m.videos > 0).slice(0, 8)
  const max = Math.max(1, ...rows.map((m) => viewsFor(m, scope)))
  const body = rows.map((m, i) => {
    const y = 190 + i * 62
    const v = viewsFor(m, scope)
    const ch = scope === 'both' ? pctChange(v, m.prev_combined) : null
    return `<g>
      <text x="48" y="${y + 8}" font-size="24">${esc(flags[m.name] || '')}</text>
      <text x="${flags[m.name] ? 88 : 48}" y="${y + 6}" font-size="20" font-weight="700" fill="${INK}">${esc(clip(m.name, 18))}</text>
      <rect x="300" y="${y - 10}" width="560" height="18" rx="9" fill="#f1ece8"/>
      <rect x="300" y="${y - 10}" width="${Math.max(8, Math.round((v / max) * 560))}" height="18" rx="9" fill="${ORANGE}"/>
      <text x="880" y="${y + 6}" font-size="20" font-weight="800" fill="${INK}">${compact(v)}</text>
      ${ch == null ? '' : `<text x="980" y="${y + 6}" font-size="15" font-weight="700" fill="${ch >= 0 ? '#16803c' : '#b91c1c'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch)}%</text>`}
      <text x="1070" y="${y + 6}" font-size="15" fill="${SMOKE}">${m.videos} videos</text>
    </g>`
  }).join('')
  return frame({ kicker: `Tryp.com Creator Community · ${title}`, title: 'Markets, side by side', date: rangeLabel(r.from, r.to), badge: 'globe', tone: 'ink' },
    `<text x="48" y="158" font-size="13" font-weight="700" letter-spacing="1.4" fill="${SMOKE}">VIEWS GAINED BY MARKET</text>${body}`,
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
