// Renders a premium "official creator" card to a PNG (no server, no deps).
// Looks like a membership card the creator would actually want to share.
const W = 1080
const H = 1080

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

// Make sure the Poppins weights we draw with are actually loaded first,
// otherwise canvas silently falls back to an ugly default font.
async function ensureFonts() {
  try {
    await Promise.all(
      ['800 68px Poppins', '700 28px Poppins', '600 26px Poppins', '500 32px Poppins', '400 30px Poppins']
        .map((f) => document.fonts.load(f))
    )
    await document.fonts.ready
  } catch { /* fall back to system fonts */ }
}

export async function generateShareCard({ name, photoUrl, city, country, joinedYear, stats }) {
  await ensureFonts()
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.textAlign = 'center'

  // White card.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Orange header band.
  const bandH = 290
  const g = ctx.createLinearGradient(0, 0, W, bandH)
  g.addColorStop(0, '#d94407')
  g.addColorStop(1, '#f5853f')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, bandH)

  // Wordmark + eyebrow.
  ctx.fillStyle = '#ffffff'
  ctx.font = '800 62px Poppins, Arial, sans-serif'
  ctx.fillText('TRYP.com', W / 2, 112)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = '600 26px Poppins, Arial, sans-serif'
  if ('letterSpacing' in ctx) ctx.letterSpacing = '6px'
  ctx.fillText('CONTENT CREATOR PROGRAM', W / 2, 160)
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'

  // Avatar straddling the band, with a white ring.
  const cx = W / 2
  const cy = bandH
  const r = 122
  ctx.beginPath()
  ctx.arc(cx, cy, r + 14, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  const img = await loadImage(photoUrl)
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  if (img) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2)
  } else {
    const ag = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
    ag.addColorStop(0, '#d94407')
    ag.addColorStop(1, '#f5853f')
    ctx.fillStyle = ag
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 96px Poppins, Arial, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials(name), cx, cy + 4)
    ctx.textBaseline = 'alphabetic'
  }
  ctx.restore()

  // Verified badge on the avatar.
  const vx = cx + r * 0.72
  const vy = cy + r * 0.72
  const vr = 34
  ctx.beginPath()
  ctx.arc(vx, vy, vr, 0, Math.PI * 2)
  ctx.fillStyle = '#d94407'
  ctx.fill()
  ctx.lineWidth = 8
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(vx - 15, vy)
  ctx.lineTo(vx - 4, vy + 12)
  ctx.lineTo(vx + 16, vy - 13)
  ctx.stroke()

  // Name + location.
  ctx.fillStyle = '#1a1a1a'
  ctx.font = '800 68px Poppins, Arial, sans-serif'
  ctx.fillText(name || 'Tryp.com Creator', W / 2, 540)
  const loc = [city, country].filter(Boolean).join(', ')
  if (loc) {
    ctx.font = '500 32px Poppins, Arial, sans-serif'
    ctx.fillStyle = '#6b7280'
    ctx.fillText(loc, W / 2, 588)
  }

  // "Official member" pill.
  ctx.font = '700 27px Poppins, Arial, sans-serif'
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px'
  const pillText = 'OFFICIAL MEMBER'
  const pw = ctx.measureText(pillText).width + 84
  const py = 642
  const ph = 60
  roundRect(ctx, W / 2 - pw / 2, py, pw, ph, ph / 2)
  ctx.fillStyle = '#fde9dd'
  ctx.fill()
  ctx.fillStyle = '#d94407'
  ctx.fillText(pillText, W / 2, py + 40)
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'

  ctx.font = '400 30px Poppins, Arial, sans-serif'
  ctx.fillStyle = '#6b7280'
  ctx.fillText('of the Tryp.com Content Creator Program', W / 2, 752)

  // Stat tiles.
  const tiles = [
    ['Member since', joinedYear || '—'],
    ['Countries', stats.countries],
    ['Challenges', stats.challenges],
  ]
  const tw = 282
  const th = 150
  const gap = 24
  const total = tiles.length * tw + (tiles.length - 1) * gap
  let tx = (W - total) / 2
  const ty = 812
  for (const [label, value] of tiles) {
    roundRect(ctx, tx, ty, tw, th, 22)
    ctx.fillStyle = '#f7f5f3'
    ctx.fill()
    ctx.fillStyle = '#d94407'
    ctx.font = '800 52px Poppins, Arial, sans-serif'
    ctx.fillText(String(value), tx + tw / 2, ty + 80)
    ctx.fillStyle = '#6b7280'
    ctx.font = '600 24px Poppins, Arial, sans-serif'
    ctx.fillText(label, tx + tw / 2, ty + 120)
    tx += tw + gap
  }

  ctx.fillStyle = '#b6bcc4'
  ctx.font = '600 28px Poppins, Arial, sans-serif'
  ctx.fillText('tryp.com', W / 2, H - 48)

  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

export async function downloadShareCard(data) {
  const blob = await generateShareCard(data)
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tryp-creator-card-${(data.name || 'me').toLowerCase().replace(/\s+/g, '-')}.png`
  a.click()
  URL.revokeObjectURL(url)
}
