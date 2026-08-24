// The two shareable pictures of a challenge result, drawn on canvas.
//
// A DOM snapshot would guarantee these match the components exactly, and that
// was tried: html-to-image hangs in this app - measured, on a plain text div
// with no images at all - so it is not an option. Canvas it is, which means the
// look has to be kept in step deliberately. Both renderers below follow
// WinnersPodium's colours and proportions on purpose; change one, look at the
// other.
//
// 1200 wide: it survives every crop a social app applies, and 1200 is enough
// that faces stay sharp full screen. The HEIGHT is measured from the content,
// because a challenge can end with one winner or with twenty-four ranked
// entries and a fixed canvas serves exactly one of those well.
//
// NOTHING HERE IS POSITIONED AGAINST A GUESSED CONSTANT. The podium used to put
// its heading at a fixed y and its tallest avatar at a fixed y, and the two
// collided - the word "Winners" came out from behind the first-placed creator's
// face. Every block now reports its height and the next one starts after it.
import { formatViews } from './utils'

const W = 1200
const SCALE = 2

const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const INK = '#1a1a1a'
const SMOKE = '#6b6b6b'
const HAIRLINE = '#ededed'
const TINT = '#fdf1eb'

const FONT = 'Poppins, system-ui, -apple-system, Segoe UI, sans-serif'
const font = (weight, size) => `${weight} ${size}px ${FONT}`

// Matching WinnersPodium exactly, so the picture and the panel are the same
// thing seen twice.
const PLACES = [
  { bar: ['#fbdd7e', '#cf9312'], label: '1st', text: '#5b410a', ring: '#e0a92b', height: 216 },
  { bar: ['#eef1f5', '#a3adb9'], label: '2nd', text: '#404a56', ring: '#b8c1cc', height: 156 },
  { bar: ['#e2a774', '#9d5f2e'], label: '3rd', text: '#4d2f14', ring: '#bf7c46', height: 112 },
]

const PAD = 110
const FOOTER_H = 112

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
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// Measured, never counted. Cutting at 21 characters puts the ellipsis in a
// different place for every name and still overflows a wide one.
function fitText(ctx, text, maxWidth) {
  const s = String(text ?? '')
  if (ctx.measureText(s).width <= maxWidth) return s
  let lo = 0
  let hi = s.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(`${s.slice(0, mid).trimEnd()}…`).width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return `${s.slice(0, lo).trimEnd()}…`
}

// Greedy word wrap at the current font.
function wrapText(ctx, text, maxWidth) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

// THE TITLE IS THE BIG WRITING, and a title is whatever somebody typed into the
// challenge form. So it is set as large as it fits on one line, dropped to two
// lines when it cannot, and only then cut. Nothing about the band is a constant
// that a longer name can walk through.
function layoutTitle(ctx, text, maxWidth) {
  for (let size = 58; size >= 40; size -= 2) {
    ctx.font = font(800, size)
    if (ctx.measureText(text).width <= maxWidth) return { size, lines: [text] }
  }
  for (let size = 46; size >= 32; size -= 2) {
    ctx.font = font(800, size)
    const lines = wrapText(ctx, text, maxWidth)
    if (lines.length <= 2) return { size, lines }
  }
  ctx.font = font(800, 32)
  const lines = wrapText(ctx, text, maxWidth)
  return { size: 32, lines: [lines[0], fitText(ctx, lines.slice(1).join(' '), maxWidth)] }
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
    ctx.font = font(700, Math.round(r * 0.8))
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials(name), cx, cy)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'center'
  }
  ctx.restore()

  if (ring) {
    ctx.beginPath()
    ctx.arc(cx, cy, r + Math.max(2, r * 0.05), 0, Math.PI * 2)
    ctx.lineWidth = Math.max(4, r * 0.08)
    ctx.strokeStyle = ring
    ctx.stroke()
  }
}

function startCanvas(height) {
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = Math.round(height) * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, height)
  ctx.textAlign = 'center'
  return { canvas, ctx }
}

// ONE LINE AT THE TOP: THE CHALLENGE'S OWN NAME, in the big writing.
//
// What used to be here was a small "TRYP.COM CREATOR PROGRAM" caption set above
// it - the programme's internal name, in label case, on a picture that goes out
// to the public and to a room full of creators who already know whose programme
// it is. The name of the challenge is the only thing the top of this picture has
// to say. Returns the band's height, because a two-line title needs a taller
// band and everything below is placed from what this returns.
function bandLayout(ctx, title) {
  const text = String(title || '').trim() || 'Tryp.com Creative Challenge'
  const { size, lines } = layoutTitle(ctx, text, W - 150)
  const lineH = Math.round(size * 1.16)
  return { size, lines, lineH, height: Math.round(lines.length * lineH + 96) }
}

// The height has to be known before the canvas exists, so the band is measured
// on a scratch context and then drawn on the real one from the same numbers.
function measureBand(title) {
  return bandLayout(document.createElement('canvas').getContext('2d'), title)
}

function header(ctx, band) {
  const { size, lines, lineH, height: bandH } = band

  const warm = ctx.createLinearGradient(0, 0, W, bandH)
  warm.addColorStop(0, BRAND)
  warm.addColorStop(1, BRAND_LIGHT)
  ctx.fillStyle = warm
  ctx.fillRect(0, 0, W, bandH)

  // A soft highlight off the top-left, so the band reads as lit rather than as
  // a flat rectangle of orange.
  const glow = ctx.createRadialGradient(W * 0.28, 0, 0, W * 0.28, 0, W * 0.75)
  glow.addColorStop(0, 'rgba(255,255,255,0.20)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, bandH)

  ctx.fillStyle = '#ffffff'
  ctx.font = font(800, size)
  const first = Math.round((bandH - lines.length * lineH) / 2 + size * 0.86)
  lines.forEach((line, i) => ctx.fillText(line, W / 2, first + i * lineH))

  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(W / 2 - 46, bandH - 7, 92, 4)
}

// The section label, in a pill of its own. A pill occupies space; a bare word
// floating over a layout is what got overlapped in the first place.
const LABEL_H = 48
function sectionLabel(ctx, y, text) {
  ctx.font = font(700, 21)
  const w = ctx.measureText(text.toUpperCase()).width + 60
  ctx.fillStyle = TINT
  roundRect(ctx, W / 2 - w / 2, y, w, LABEL_H, LABEL_H / 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(217,68,7,0.16)'
  ctx.lineWidth = 2
  roundRect(ctx, W / 2 - w / 2, y, w, LABEL_H, LABEL_H / 2)
  ctx.stroke()
  ctx.fillStyle = BRAND
  ctx.fillText(text.toUpperCase(), W / 2, y + 31)
  return LABEL_H
}

function footerStats(ctx, y, stats) {
  ctx.strokeStyle = HAIRLINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(W - PAD, y)
  ctx.stroke()

  const slot = (W - PAD * 2) / stats.length
  stats.forEach(([value, label], i) => {
    const cx = PAD + slot * (i + 0.5)
    ctx.fillStyle = INK
    ctx.font = font(700, 42)
    ctx.fillText(String(value), cx, y + 62)
    ctx.fillStyle = SMOKE
    ctx.font = font(600, 19)
    ctx.fillText(String(label).toUpperCase(), cx, y + 94)
  })
  return FOOTER_H
}

// The participation prize, and the faces of everyone who earned it. Twelve
// shown and the rest counted, matching WinnersPodium.
const VOUCHER_SHOWN = 12
const VOUCHER_H = 138
async function voucherBand(ctx, y, voucherWinners, voucherPrize) {
  const shown = voucherWinners.slice(0, VOUCHER_SHOWN)
  const extra = voucherWinners.length - shown.length

  ctx.fillStyle = TINT
  roundRect(ctx, PAD, y, W - PAD * 2, VOUCHER_H, 22)
  ctx.fill()
  ctx.strokeStyle = 'rgba(217,68,7,0.18)'
  ctx.lineWidth = 2
  roundRect(ctx, PAD, y, W - PAD * 2, VOUCHER_H, 22)
  ctx.stroke()

  ctx.fillStyle = BRAND
  ctx.font = font(700, 21)
  const heading = (voucherPrize ? `${voucherPrize} for everyone here` : 'Everyone here earned the participation prize').toUpperCase()
  ctx.fillText(fitText(ctx, heading, W - PAD * 2 - 60), W / 2, y + 42)

  const faces = await Promise.all(shown.map((v) => loadImage(v?.photo_url)))
  const r = 25
  const gap = 12
  const unit = r * 2 + gap
  ctx.font = font(700, 22)
  const extraW = extra > 0 ? ctx.measureText(`+${extra}`).width + 14 : 0
  const totalW = shown.length * unit - gap + extraW
  let x = W / 2 - totalW / 2 + r
  shown.forEach((v, i) => {
    avatar(ctx, faces[i], v?.name, x, y + 94, r, '#ffffff')
    x += unit
  })
  if (extra > 0) {
    ctx.textAlign = 'left'
    ctx.fillStyle = BRAND
    ctx.fillText(`+${extra}`, x - gap + 8, y + 102)
    ctx.textAlign = 'center'
  }
  return VOUCHER_H
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.95))

function scoreReader(scoring) {
  const points = scoring === 'points'
  return {
    unit: points ? 'points' : 'views',
    fmt: (n) => (points ? Number(n || 0).toLocaleString() : formatViews(Number(n || 0))),
    of: (row) => (points ? (row?.points ?? row?.final_views ?? 0) : (row?.final_views ?? 0)),
  }
}

function emptyNote(ctx, y, text) {
  ctx.fillStyle = SMOKE
  ctx.font = font(500, 26)
  ctx.fillText(text, W / 2, y + 60)
  return 110
}

/**
 * The top three on a podium, anyone past bronze in a row beneath, the voucher
 * row, and the totals. Survives one winner, two, three, or a challenge that
 * pays five places.
 */
export async function renderPodium({
  title, winners = [], entries = 0, totalViews = 0, voucherWinners = [], voucherPrize = '', scoring = 'views',
}) {
  await ensureFonts()
  const score = scoreReader(scoring)
  const top = winners.slice(0, 3)
  const rest = winners.slice(3)

  // ---- measure, then draw. -------------------------------------------------
  const cols = top.map((w, i) => {
    const place = PLACES[i]
    const r = top.length === 1 ? 104 : i === 0 ? 92 : 74
    // avatar + name + score + breathing space + the bar itself
    return { w, place, r, height: r * 2 + 44 + 36 + 26 + place.height }
  })
  const podiumH = cols.length ? Math.max(...cols.map((c) => c.height)) : 0

  const restRows = rest.length ? Math.ceil(rest.length / 3) : 0
  const restH = restRows ? restRows * 56 + 40 : 0

  const band = measureBand(title)
  const labelY = band.height + 40
  const podiumY = labelY + LABEL_H + 44
  let y = podiumY + podiumH
  if (restH) y += 34 + restH
  if (voucherWinners.length) y += 32 + VOUCHER_H
  const contentEnd = y + 40 + FOOTER_H

  // A square-ish picture unless the content genuinely needs more room; the
  // slack goes above the totals rather than leaving a gap under them. A result
  // with nobody in it does not get padded out to a square of empty white.
  const empty = !top.length
  const H = empty ? podiumY + 110 + 40 + FOOTER_H + 46 : Math.max(1080, contentEnd + 46)
  const slack = empty ? 0 : Math.max(0, H - 46 - contentEnd)

  const { canvas, ctx } = startCanvas(H)
  header(ctx, band)
  sectionLabel(ctx, labelY, winners.length === 1 ? 'Winner' : 'Winners')

  if (empty) {
    const noteY = emptyNote(ctx, podiumY, 'No winners have been decided yet.')
    footerStats(ctx, podiumY + noteY, [[entries, entries === 1 ? 'entry' : 'entries'], [score.fmt(totalViews), `total ${score.unit}`], ['0', 'on the podium']])
    return toBlob(canvas)
  }

  const photos = await Promise.all(top.map((c) => loadImage(c?.profiles?.photo_url)))
  const base = podiumY + podiumH

  // 2nd | 1st | 3rd - the shape of an actual podium - and centred properly when
  // fewer than three people are on it.
  const slots = top.length === 1
    ? [[0, W / 2]]
    : top.length === 2
      ? [[0, W / 2 - 158], [1, W / 2 + 158]]
      : [[1, W / 2 - 300], [0, W / 2], [2, W / 2 + 300]]

  slots.forEach(([i, cx]) => {
    const col = cols[i]
    if (!col) return
    const { w, place, r } = col
    const barY = base - place.height
    const barW = top.length === 1 ? 300 : 256
    const scoreBaseline = barY - 26
    const nameBaseline = scoreBaseline - 36
    const cy = nameBaseline - 44 - r

    avatar(ctx, photos[i], w.profiles?.name, cx, cy, r, place.ring)

    ctx.fillStyle = INK
    ctx.font = font(700, i === 0 ? 34 : 28)
    const name = w.profiles?.name?.split(' ')[0] || 'Creator'
    ctx.fillText(fitText(ctx, name, barW + 24), cx, nameBaseline)

    ctx.fillStyle = SMOKE
    ctx.font = font(500, 24)
    ctx.fillText(`${score.fmt(score.of(w))} ${score.unit}`, cx, scoreBaseline)

    const g = ctx.createLinearGradient(0, barY, 0, base)
    g.addColorStop(0, place.bar[0])
    g.addColorStop(1, place.bar[1])
    ctx.fillStyle = g
    roundRect(ctx, cx - barW / 2, barY, barW, place.height, 18)
    ctx.fill()

    ctx.fillStyle = place.text
    ctx.font = font(700, 32)
    ctx.fillText(place.label, cx, barY + 50)
  })

  y = base

  // Places four and beyond: a quiet row, no invented fourth medal - the same
  // decision WinnersPodium makes. Each chip is MEASURED and the row centred on
  // its real width; a fixed slot leaves two names stranded at the edges.
  if (restH) {
    y += 34
    ctx.fillStyle = SMOKE
    ctx.font = font(600, 19)
    ctx.fillText('ALSO ON THE PODIUM', W / 2, y + 4)

    const faces = await Promise.all(rest.map((w) => loadImage(w?.profiles?.photo_url)))
    const chips = rest.map((w, i) => {
      const place = String(w.rank ?? i + 4)
      ctx.font = font(600, 21)
      const name = fitText(ctx, w.profiles?.name?.split(' ')[0] || 'Creator', 150)
      const nameW = ctx.measureText(name).width
      ctx.font = font(700, 20)
      const placeW = ctx.measureText(place).width
      ctx.font = font(500, 19)
      const value = score.fmt(score.of(w))
      const valueW = ctx.measureText(value).width
      return { place, placeW, name, nameW, value, valueW, face: faces[i], full: w,
        width: placeW + 12 + 40 + 12 + nameW + 14 + valueW }
    })

    const PER_ROW = 3
    const GAP = 44
    for (let row = 0; row * PER_ROW < chips.length; row++) {
      const items = chips.slice(row * PER_ROW, row * PER_ROW + PER_ROW)
      const total = items.reduce((sum, c) => sum + c.width, 0) + GAP * (items.length - 1)
      const mid = y + 40 + row * 56 + 18
      let x = W / 2 - total / 2
      ctx.textAlign = 'left'
      items.forEach((c) => {
        ctx.fillStyle = SMOKE
        ctx.font = font(700, 20)
        ctx.fillText(c.place, x, mid + 7)
        x += c.placeW + 12
        avatar(ctx, c.face, c.full.profiles?.name, x + 20, mid, 20, '#f0c3ab')
        x += 40 + 12
        ctx.fillStyle = INK
        ctx.font = font(600, 21)
        ctx.fillText(c.name, x, mid + 7)
        x += c.nameW + 14
        ctx.fillStyle = SMOKE
        ctx.font = font(500, 19)
        ctx.fillText(c.value, x, mid + 7)
        x += c.valueW + GAP
      })
      ctx.textAlign = 'center'
    }
    y += restH
  }

  if (voucherWinners.length) {
    y += 32
    y += await voucherBand(ctx, y, voucherWinners, voucherPrize)
  }

  footerStats(ctx, y + 40 + slack, [
    [entries, entries === 1 ? 'entry' : 'entries'],
    [score.fmt(totalViews), `total ${score.unit}`],
    [winners.length, 'on the podium'],
  ])

  return toBlob(canvas)
}

/** Every place, in order, with the voucher marked against whoever earned it. */
export async function renderLeaderboard({
  title, ranking = [], entries = 0, totalViews = 0, voucherIds = new Set(), voucherPrize = '',
  scoring = 'views', limit = 10,
}) {
  await ensureFonts()
  const score = scoreReader(scoring)
  const rows = ranking.slice(0, limit)
  const hidden = ranking.length - rows.length

  const ROW_H = 92
  const band = measureBand(title)
  const labelY = band.height + 40
  const headY = labelY + LABEL_H + 40
  const listTop = headY + 30
  const listH = rows.length * ROW_H
  const moreH = hidden > 0 ? 46 : 0
  const contentEnd = listTop + Math.max(listH, rows.length ? 0 : 110) + moreH + 40 + FOOTER_H
  const H = rows.length ? Math.max(900, contentEnd + 46) : contentEnd + 46

  const { canvas, ctx } = startCanvas(H)
  header(ctx, band)
  sectionLabel(ctx, labelY, 'Leaderboard')

  const left = PAD
  const right = W - PAD

  // One column heading instead of the word "views" printed against every single
  // row, which is ten repetitions of a fact the reader learned once.
  ctx.textAlign = 'left'
  ctx.fillStyle = SMOKE
  ctx.font = font(600, 17)
  ctx.fillText('PLACE', left, headY)
  ctx.fillText('CREATOR', left + 186, headY)
  ctx.textAlign = 'right'
  ctx.fillText(score.unit.toUpperCase(), right, headY)
  ctx.textAlign = 'center'
  ctx.strokeStyle = HAIRLINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(left, headY + 16)
  ctx.lineTo(right, headY + 16)
  ctx.stroke()

  if (!rows.length) {
    const h = emptyNote(ctx, listTop, 'No entries have been ranked yet.')
    footerStats(ctx, listTop + h + 40, [
      [entries, entries === 1 ? 'entry' : 'entries'],
      [score.fmt(totalViews), `total ${score.unit}`],
      [0, 'ranked'],
    ])
    return toBlob(canvas)
  }

  const photos = await Promise.all(rows.map((r) => loadImage(r?.profiles?.photo_url)))

  rows.forEach((row, i) => {
    const y = listTop + i * ROW_H
    const mid = y + ROW_H / 2
    const place = PLACES[i]
    const hasVoucher = voucherIds?.has?.(row.creator_id) && !!voucherPrize
    // Every row carries a second line, so no name ever sits at a different
    // height from the name above it.
    const second = hasVoucher ? voucherPrize : row.platform || ''

    // The top three get a tinted card; everyone else a hairline. It reads as a
    // leaderboard rather than as ten identical rows.
    if (place) {
      ctx.fillStyle = i === 0 ? 'rgba(217,68,7,0.06)' : 'rgba(0,0,0,0.025)'
      roundRect(ctx, left - 14, y + 6, right - left + 28, ROW_H - 12, 16)
      ctx.fill()
    } else if (i > 3) {
      ctx.strokeStyle = HAIRLINE
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(right, y)
      ctx.stroke()
    }

    // The place: a medal pill for the top three, a plain number after that.
    if (place) {
      const g = ctx.createLinearGradient(left, mid - 21, left, mid + 21)
      g.addColorStop(0, place.bar[0])
      g.addColorStop(1, place.bar[1])
      ctx.fillStyle = g
      roundRect(ctx, left, mid - 21, 78, 42, 21)
      ctx.fill()
      ctx.fillStyle = place.text
      ctx.font = font(700, 21)
      ctx.fillText(place.label, left + 39, mid + 8)
    } else {
      ctx.fillStyle = SMOKE
      ctx.font = font(600, 24)
      ctx.fillText(String(row.rank ?? i + 1), left + 39, mid + 9)
    }

    avatar(ctx, photos[i], row.profiles?.name, left + 140, mid, 30, place ? place.ring : '#eadfd9')

    ctx.textAlign = 'left'
    ctx.fillStyle = INK
    ctx.font = font(600, 27)
    const nameX = left + 186
    const nameMax = right - nameX - 190
    ctx.fillText(fitText(ctx, row.profiles?.name || 'Creator', nameMax), nameX, second ? mid - 1 : mid + 9)

    if (second) {
      ctx.fillStyle = hasVoucher ? BRAND : SMOKE
      ctx.font = font(hasVoucher ? 600 : 500, 18)
      ctx.fillText(fitText(ctx, second, nameMax), nameX, mid + 27)
    }

    ctx.textAlign = 'right'
    ctx.fillStyle = INK
    ctx.font = font(700, 30)
    ctx.fillText(score.fmt(score.of(row)), right, mid + 10)
    ctx.textAlign = 'center'
  })

  let y = listTop + listH
  if (hidden > 0) {
    ctx.fillStyle = SMOKE
    ctx.font = font(500, 20)
    ctx.fillText(`+ ${hidden} more ${hidden === 1 ? 'entry' : 'entries'} ranked below`, W / 2, y + 30)
    y += moreH
  }

  footerStats(ctx, y + 40, [
    [entries, entries === 1 ? 'entry' : 'entries'],
    [score.fmt(totalViews), `total ${score.unit}`],
    [ranking.length, 'ranked'],
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
