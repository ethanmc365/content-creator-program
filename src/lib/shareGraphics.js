// The two shareable pictures of a challenge result, drawn on canvas.
//
// A DOM snapshot would guarantee these match the components exactly, and that
// was tried: html-to-image hangs in this app - measured, on a plain text div
// with no images at all - so it is not an option. Canvas it is, which means the
// look has to be kept in step deliberately. Both renderers below follow
// WinnersPodium's colours and proportions on purpose; change one, look at the
// other.
//
// 1200x1200 square: it survives every crop a social app applies, and 1200 is
// enough that faces stay sharp full screen.
const W = 1200
const SCALE = 2

const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const INK = '#1a1a1a'
const SMOKE = '#6b6b6b'
const HAIRLINE = '#eeeeee'

// Matching WinnersPodium exactly, so the picture and the panel are the same
// thing seen twice.
const PLACES = [
  { bar: ['#f7d774', '#e0a32a'], label: '1st', text: '#6b4a06', ring: '#e0a32a', height: 300 },
  { bar: ['#e6e6e6', '#b9b9b9'], label: '2nd', text: '#4a4a4a', ring: '#c9c9c9', height: 230 },
  { bar: ['#fbd9c7', '#e08a4e'], label: '3rd', text: '#7a3406', ring: '#e08a4e', height: 180 },
]

function compact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k'
  return String(n)
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

async function ensureFonts() {
  try {
    if (document?.fonts?.ready) await document.fonts.ready
  } catch {
    // A missing webfont falls back to the system stack, which is survivable.
  }
}

// COVER, never stretch. A portrait photo squashed into a circle is instantly
// recognisable as a mistake, and it is the mistake people notice first because
// it happens to a face.
function avatar(ctx, img, name, cx, cy, r, ring) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  if (img && img.width && img.height) {
    const scale = Math.max((r * 2) / img.width, (r * 2) / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
  } else {
    ctx.fillStyle = '#f7ece6'
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    ctx.fillStyle = BRAND
    ctx.font = `700 ${Math.round(r * 0.8)}px Poppins, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials(name), cx, cy)
    ctx.textBaseline = 'alphabetic'
  }
  ctx.restore()

  if (ring) {
    ctx.beginPath()
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2)
    ctx.lineWidth = 6
    ctx.strokeStyle = ring
    ctx.stroke()
  }
}

function startCanvas(height) {
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, height)
  ctx.textAlign = 'center'
  return { canvas, ctx }
}

function header(ctx, title) {
  const warm = ctx.createLinearGradient(0, 0, W, 200)
  warm.addColorStop(0, BRAND)
  warm.addColorStop(1, BRAND_LIGHT)
  ctx.fillStyle = warm
  ctx.fillRect(0, 0, W, 158)

  ctx.fillStyle = '#ffffff'
  ctx.font = '600 26px Poppins, system-ui, sans-serif'
  ctx.fillText('TRYP.COM CREATOR PROGRAM', W / 2, 62)
  ctx.font = '700 44px Poppins, system-ui, sans-serif'
  const t = title.length > 36 ? `${title.slice(0, 35)}…` : title
  ctx.fillText(t, W / 2, 118)
}

function footerStats(ctx, y, stats) {
  ctx.strokeStyle = HAIRLINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(110, y)
  ctx.lineTo(W - 110, y)
  ctx.stroke()

  stats.forEach(([value, label], i) => {
    const cx = W / 2 + (i - (stats.length - 1) / 2) * 300
    ctx.fillStyle = INK
    ctx.font = '700 42px Poppins, system-ui, sans-serif'
    ctx.fillText(value, cx, y + 64)
    ctx.fillStyle = SMOKE
    ctx.font = '600 20px Poppins, system-ui, sans-serif'
    ctx.fillText(label, cx, y + 98)
  })
}

async function voucherBand(ctx, y, voucherWinners, voucherPrize) {
  const SHOWN = 10
  const shown = voucherWinners.slice(0, SHOWN)
  const extra = voucherWinners.length - shown.length
  const boxH = 128

  ctx.fillStyle = '#fdf1eb'
  roundRect(ctx, 100, y, W - 200, boxH, 20)
  ctx.fill()
  ctx.strokeStyle = 'rgba(217,68,7,0.18)'
  ctx.lineWidth = 2
  roundRect(ctx, 100, y, W - 200, boxH, 20)
  ctx.stroke()

  ctx.fillStyle = BRAND
  ctx.font = '700 21px Poppins, system-ui, sans-serif'
  ctx.fillText(
    (voucherPrize ? `${voucherPrize} for everyone here` : 'Everyone here earned the participation prize').toUpperCase(),
    W / 2,
    y + 38,
  )

  const faces = await Promise.all(shown.map((v) => loadImage(v?.photo_url)))
  const r = 25
  const gap = 12
  const unit = r * 2 + gap
  const totalW = shown.length * unit - gap + (extra > 0 ? 56 : 0)
  let x = W / 2 - totalW / 2 + r
  shown.forEach((v, i) => {
    avatar(ctx, faces[i], v?.name, x, y + 88, r, '#ffffff')
    x += unit
  })
  if (extra > 0) {
    ctx.fillStyle = BRAND
    ctx.font = '700 22px Poppins, system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`+${extra}`, x - gap + 6, y + 96)
    ctx.textAlign = 'center'
  }
  return boxH
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.95))

/** The top three, on a podium, exactly as the board draws them. */
export async function renderPodium({
  title, winners = [], entries = 0, totalViews = 0, voucherWinners = [], voucherPrize = '',
}) {
  await ensureFonts()
  const H = 1200
  const { canvas, ctx } = startCanvas(H)
  header(ctx, title || 'Challenge')

  ctx.fillStyle = INK
  ctx.font = '700 32px Poppins, system-ui, sans-serif'
  ctx.fillText('Winners', W / 2, 228)

  const top = winners.slice(0, 3)
  const photos = await Promise.all(top.map((w) => loadImage(w?.profiles?.photo_url)))
  // 2nd, 1st, 3rd - the shape of an actual podium.
  const order = [1, 0, 2]
  const xs = [W / 2 - 300, W / 2, W / 2 + 300]
  const baseY = 800

  order.forEach((rankIndex, slot) => {
    const w = top[rankIndex]
    if (!w) return
    const place = PLACES[rankIndex]
    const cx = xs[slot]
    const barY = baseY - place.height

    const r = rankIndex === 0 ? 92 : 74
    const cy = barY - r - 104
    avatar(ctx, photos[rankIndex], w.profiles?.name, cx, cy, r, place.ring)

    ctx.fillStyle = INK
    ctx.font = `700 ${rankIndex === 0 ? 34 : 28}px Poppins, system-ui, sans-serif`
    ctx.fillText((w.profiles?.name || 'Creator').split(' ')[0], cx, cy + r + 48)

    ctx.fillStyle = SMOKE
    ctx.font = '500 24px Poppins, system-ui, sans-serif'
    ctx.fillText(`${compact(w.final_views || 0)} views`, cx, cy + r + 82)

    const g = ctx.createLinearGradient(0, barY, 0, baseY)
    g.addColorStop(0, place.bar[0])
    g.addColorStop(1, place.bar[1])
    ctx.fillStyle = g
    roundRect(ctx, cx - 128, barY, 256, place.height, 18)
    ctx.fill()

    ctx.fillStyle = place.text
    ctx.font = '700 32px Poppins, system-ui, sans-serif'
    ctx.fillText(place.label, cx, barY + 50)
  })

  let y = baseY + 44
  if (voucherWinners.length) y += (await voucherBand(ctx, y, voucherWinners, voucherPrize)) + 26
  else y += 12

  footerStats(ctx, y, [
    [String(entries), entries === 1 ? 'ENTRY' : 'ENTRIES'],
    [compact(totalViews), 'TOTAL VIEWS'],
    [String(Math.min(3, top.length)), 'ON THE PODIUM'],
  ])

  return toBlob(canvas)
}

/** Every place, in order, with the voucher marked against whoever earned it. */
export async function renderLeaderboard({
  title, ranking = [], entries = 0, totalViews = 0, voucherIds = new Set(), voucherPrize = '', limit = 10,
}) {
  await ensureFonts()
  const rows = ranking.slice(0, limit)

  const ROW_H = 86
  const listTop = 210
  const H = Math.max(760, listTop + rows.length * ROW_H + 190)
  const { canvas, ctx } = startCanvas(H)
  header(ctx, title || 'Challenge')

  ctx.fillStyle = INK
  ctx.font = '700 30px Poppins, system-ui, sans-serif'
  ctx.fillText('Leaderboard', W / 2, 205)

  const photos = await Promise.all(rows.map((r) => loadImage(r?.profiles?.photo_url)))
  const left = 120
  const right = W - 120

  rows.forEach((row, i) => {
    const y = listTop + i * ROW_H
    const mid = y + ROW_H / 2
    const place = PLACES[i]

    if (i > 0) {
      ctx.strokeStyle = HAIRLINE
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(right, y)
      ctx.stroke()
    }

    // The place: a coloured pill for the top three, a plain number after that.
    if (place) {
      const g = ctx.createLinearGradient(left, mid - 20, left, mid + 20)
      g.addColorStop(0, place.bar[0])
      g.addColorStop(1, place.bar[1])
      ctx.fillStyle = g
      roundRect(ctx, left, mid - 20, 74, 40, 20)
      ctx.fill()
      ctx.fillStyle = place.text
      ctx.font = '700 21px Poppins, system-ui, sans-serif'
      ctx.fillText(place.label, left + 37, mid + 7)
    } else {
      ctx.fillStyle = SMOKE
      ctx.font = '600 24px Poppins, system-ui, sans-serif'
      ctx.fillText(String(i + 1), left + 37, mid + 8)
    }

    avatar(ctx, photos[i], row.profiles?.name, left + 138, mid, 30, place ? place.ring : null)

    ctx.textAlign = 'left'
    ctx.fillStyle = INK
    ctx.font = '600 27px Poppins, system-ui, sans-serif'
    const name = row.profiles?.name || 'Creator'
    ctx.fillText(name.length > 22 ? `${name.slice(0, 21)}…` : name, left + 182, mid + (voucherIds.has(row.creator_id) ? -2 : 9))

    if (voucherIds.has(row.creator_id) && voucherPrize) {
      ctx.fillStyle = BRAND
      ctx.font = '600 18px Poppins, system-ui, sans-serif'
      ctx.fillText(voucherPrize, left + 182, mid + 26)
    }

    ctx.textAlign = 'right'
    ctx.fillStyle = INK
    ctx.font = '700 28px Poppins, system-ui, sans-serif'
    ctx.fillText(compact(row.final_views || 0), right, mid + 4)
    ctx.fillStyle = SMOKE
    ctx.font = '500 17px Poppins, system-ui, sans-serif'
    ctx.fillText('views', right, mid + 28)
    ctx.textAlign = 'center'
  })

  footerStats(ctx, listTop + rows.length * ROW_H + 34, [
    [String(entries), entries === 1 ? 'ENTRY' : 'ENTRIES'],
    [compact(totalViews), 'TOTAL VIEWS'],
    [String(ranking.length), 'RANKED'],
  ])

  return toBlob(canvas)
}

export async function downloadBlob(blob, filename) {
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function slugForFile(title, suffix) {
  return `${(title || 'challenge').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${suffix}.png`
}
