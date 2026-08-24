// The podium as a shareable PNG.
//
// The leaderboard card already exists as a message type, but a card only renders
// inside the app - it cannot be sent to somebody, posted to a story, or dropped
// into a deck. This draws the same three places as an image, on canvas, with no
// server and no dependency, the same way the creator share card does.
//
// 1200x1200: square survives every crop a social app applies, and 1200 is enough
// that avatars stay sharp on a phone.
const W = 1200
const H = 1200
const SCALE = 2

const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const INK = '#1a1a1a'
const SMOKE = '#6b6b6b'

// The podium's own colours, matching WinnersPodium so the image and the card in
// the app are recognisably the same thing.
const PLACES = [
  { bar: ['#f7d774', '#e0a32a'], label: '1st', text: '#6b4a06', height: 300 },
  { bar: ['#e6e6e6', '#b9b9b9'], label: '2nd', text: '#4a4a4a', height: 230 },
  { bar: ['#fbd9c7', '#e08a4e'], label: '3rd', text: '#7a3406', height: 180 },
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

function avatar(ctx, img, name, cx, cy, r, ring) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  if (img) {
    // Cover, not stretch: a portrait photo squashed into a circle is instantly
    // recognisable as a mistake.
    const scale = Math.max((r * 2) / img.width, (r * 2) / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
  } else {
    ctx.fillStyle = '#f0e6e0'
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    ctx.fillStyle = BRAND
    ctx.font = `700 ${r * 0.8}px Poppins, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials(name), cx, cy)
  }
  ctx.restore()

  ctx.beginPath()
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2)
  ctx.lineWidth = 8
  ctx.strokeStyle = ring
  ctx.stroke()
}

/**
 * @param {object} opts
 * @param {string} opts.title      the challenge title
 * @param {Array}  opts.winners    [{ profiles: {name, photo_url}, final_views }]
 * @param {number} opts.entries
 * @param {number} opts.totalViews
 * @param {Array}  opts.voucherWinners  everyone who earned the participation prize
 * @param {string} opts.voucherPrize    e.g. "£10 Tryp.com voucher"
 * @returns {Promise<Blob>}
 */
export async function generatePodiumImage({
  title, winners = [], entries = 0, totalViews = 0, voucherWinners = [], voucherPrize = '',
}) {
  await ensureFonts()

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)

  // White-dominant, per the design rules: the orange is an accent, never the
  // ground.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  const warm = ctx.createLinearGradient(0, 0, W, 220)
  warm.addColorStop(0, BRAND)
  warm.addColorStop(1, BRAND_LIGHT)
  ctx.fillStyle = warm
  ctx.fillRect(0, 0, W, 168)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  ctx.font = '600 30px Poppins, system-ui, sans-serif'
  ctx.fillText('TRYP.COM CREATOR PROGRAM', W / 2, 68)
  ctx.font = '700 46px Poppins, system-ui, sans-serif'
  const t = title.length > 34 ? `${title.slice(0, 33)}…` : title
  ctx.fillText(t, W / 2, 126)

  ctx.fillStyle = INK
  ctx.font = '700 34px Poppins, system-ui, sans-serif'
  ctx.fillText('Winners', W / 2, 240)

  // Order on screen is 2nd, 1st, 3rd - the shape of an actual podium.
  const order = [1, 0, 2]
  const top = winners.slice(0, 3)
  const xs = [W / 2 - 300, W / 2, W / 2 + 300]
  const baseY = 820
  const photos = await Promise.all(top.map((w) => loadImage(w.profiles?.photo_url)))

  order.forEach((rankIndex, slot) => {
    const w = top[rankIndex]
    if (!w) return
    const place = PLACES[rankIndex]
    const cx = xs[slot]
    const barH = place.height
    const barY = baseY - barH

    const r = rankIndex === 0 ? 96 : 78
    const cy = barY - r - 108
    avatar(ctx, photos[rankIndex], w.profiles?.name, cx, cy, r, rankIndex === 0 ? '#e0a32a' : '#ffffff')

    ctx.fillStyle = INK
    ctx.font = `700 ${rankIndex === 0 ? 36 : 30}px Poppins, system-ui, sans-serif`
    const name = (w.profiles?.name || 'Creator').split(' ')[0]
    ctx.fillText(name, cx, cy + r + 52)

    ctx.fillStyle = SMOKE
    ctx.font = '500 26px Poppins, system-ui, sans-serif'
    ctx.fillText(`${compact(w.final_views || 0)} views`, cx, cy + r + 88)

    const g = ctx.createLinearGradient(0, barY, 0, baseY)
    g.addColorStop(0, place.bar[0])
    g.addColorStop(1, place.bar[1])
    ctx.fillStyle = g
    roundRect(ctx, cx - 130, barY, 260, barH, 18)
    ctx.fill()

    ctx.fillStyle = place.text
    ctx.font = '700 34px Poppins, system-ui, sans-serif'
    ctx.fillText(place.label, cx, barY + 52)
  })

  // THE VOUCHER ROW, because the image has to be the podium as it is SHOWN.
  // Leaving it out made the picture a different thing from the panel it was
  // shared from - and the people who earned a voucher are half the point of it.
  let y = baseY + 44
  if (voucherWinners.length) {
    const SHOWN = 10
    const shown = voucherWinners.slice(0, SHOWN)
    const extra = voucherWinners.length - shown.length
    const boxH = 132
    ctx.fillStyle = '#fdf1eb'
    roundRect(ctx, 100, y, W - 200, boxH, 20)
    ctx.fill()
    ctx.strokeStyle = 'rgba(217,68,7,0.18)'
    ctx.lineWidth = 2
    roundRect(ctx, 100, y, W - 200, boxH, 20)
    ctx.stroke()

    ctx.fillStyle = BRAND
    ctx.font = '700 22px Poppins, system-ui, sans-serif'
    ctx.fillText(
      (voucherPrize ? `${voucherPrize} for everyone here` : 'Everyone here earned the participation prize').toUpperCase(),
      W / 2,
      y + 40,
    )

    const faces = await Promise.all(shown.map((v) => loadImage(v.photo_url)))
    const r = 26
    const gap = 12
    const unit = r * 2 + gap
    const totalW = shown.length * unit - gap + (extra > 0 ? 60 : 0)
    let x = W / 2 - totalW / 2 + r
    shown.forEach((v, i) => {
      avatar(ctx, faces[i], v.name, x, y + 92, r, '#ffffff')
      x += unit
    })
    if (extra > 0) {
      ctx.fillStyle = BRAND
      ctx.font = '700 24px Poppins, system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`+${extra}`, x - gap + 6, y + 100)
      ctx.textAlign = 'center'
    }
    y += boxH + 28
  } else {
    y += 16
  }

  ctx.strokeStyle = '#eeeeee'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(120, y)
  ctx.lineTo(W - 120, y)
  ctx.stroke()

  const facts = [
    [String(entries), entries === 1 ? 'ENTRY' : 'ENTRIES'],
    [compact(totalViews), 'TOTAL VIEWS'],
    [String(Math.min(3, top.length)), 'ON THE PODIUM'],
  ]
  facts.forEach(([value, label], i) => {
    const cx = W / 2 + (i - 1) * 300
    ctx.fillStyle = INK
    ctx.font = '700 44px Poppins, system-ui, sans-serif'
    ctx.fillText(value, cx, y + 72)
    ctx.fillStyle = SMOKE
    ctx.font = '600 22px Poppins, system-ui, sans-serif'
    ctx.fillText(label, cx, y + 108)
  })

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.95))
}

export async function downloadPodiumImage(data) {
  const blob = await generatePodiumImage(data)
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(data.title || 'podium').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-winners.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
