// Renders a premium "official creator" card to a high-res PNG (no server, no
// deps). Looks like a membership card a creator would proudly share.
const W = 1080
const H = 1080
const SCALE = 2 // render at 2x for crisp, high-quality output

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

// Compact view count: 1500 -> 1.5K, 1200000 -> 1.2M.
function compact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K'
  return String(n)
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
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)
  ctx.imageSmoothingQuality = 'high'
  ctx.textAlign = 'center'

  // White card.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Header band — use the real Tryp.com logo, and fill the band with the logo's
  // own background colour so the logo blends in seamlessly (no patch/seam).
  const bandH = 300
  const logo = await loadImage('/brand/tryp-logo.png')
  let bandColor = '#d94407'
  if (logo) {
    try {
      const tc = document.createElement('canvas')
      tc.width = logo.naturalWidth || logo.width
      tc.height = logo.naturalHeight || logo.height
      const tctx = tc.getContext('2d')
      tctx.drawImage(logo, 0, 0)
      const d = tctx.getImageData(2, 2, 1, 1).data
      bandColor = `rgb(${d[0]},${d[1]},${d[2]})`
    } catch { /* keep default */ }
  }
  ctx.fillStyle = bandColor
  ctx.fillRect(0, 0, W, bandH)
  if (logo) {
    const lw = 420
    const lh = lw * (logo.height / logo.width)
    ctx.drawImage(logo, (W - lw) / 2, 16, lw, lh)
  } else {
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 60px Poppins, Arial, sans-serif'
    ctx.fillText('TRYP.com', W / 2, 120)
  }

  // Avatar straddling the band, clear of the eyebrow above.
  const cx = W / 2
  const cy = 312
  const r = 118
  ctx.beginPath()
  ctx.arc(cx, cy, r + 13, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  const img = await loadImage(photoUrl)
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  if (img) {
    // cover-fit the photo into the circle
    const ar = img.width / img.height
    let dw = r * 2, dh = r * 2, dx = cx - r, dy = cy - r
    if (ar > 1) { dw = r * 2 * ar; dx = cx - dw / 2 } else { dh = (r * 2) / ar; dy = cy - dh / 2 }
    ctx.drawImage(img, dx, dy, dw, dh)
  } else {
    const ag = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
    ag.addColorStop(0, '#d94407')
    ag.addColorStop(1, '#f5853f')
    ctx.fillStyle = ag
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 92px Poppins, Arial, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials(name), cx, cy + 4)
    ctx.textBaseline = 'alphabetic'
  }
  ctx.restore()

  // Verified badge.
  const vx = cx + r * 0.72
  const vy = cy + r * 0.72
  const vr = 33
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
  ctx.moveTo(vx - 14, vy)
  ctx.lineTo(vx - 4, vy + 11)
  ctx.lineTo(vx + 15, vy - 12)
  ctx.stroke()

  // Name + location.
  ctx.fillStyle = '#1a1a1a'
  ctx.font = '800 66px Poppins, Arial, sans-serif'
  ctx.fillText(name || 'Tryp.com Creator', W / 2, 558)
  const loc = [city, country].filter(Boolean).join(', ')
  if (loc) {
    ctx.font = '500 32px Poppins, Arial, sans-serif'
    ctx.fillStyle = '#6b7280'
    ctx.fillText(loc, W / 2, 606)
  }

  // "Official member" pill.
  ctx.font = '700 27px Poppins, Arial, sans-serif'
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px'
  const pillText = 'OFFICIAL MEMBER'
  const pw = ctx.measureText(pillText).width + 84
  const py = 654
  const ph = 60
  roundRect(ctx, W / 2 - pw / 2, py, pw, ph, ph / 2)
  ctx.fillStyle = '#fde9dd'
  ctx.fill()
  ctx.fillStyle = '#d94407'
  ctx.fillText(pillText, W / 2, py + 40)
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'

  ctx.font = '400 30px Poppins, Arial, sans-serif'
  ctx.fillStyle = '#6b7280'
  ctx.fillText('of the Tryp.com Content Creator Program', W / 2, 764)

  // Stat tiles — portfolio value: videos created, countries, and total views
  // (or member-since if they have no logged views yet).
  const tiles = [
    ['Videos created', stats.videos],
    ['Countries', stats.countries],
    stats.totalViews > 0 ? ['Total views', compact(stats.totalViews)] : ['Member since', joinedYear || '—'],
  ]
  const tw = 282
  const th = 150
  const gap = 24
  const total = tiles.length * tw + (tiles.length - 1) * gap
  let tx = (W - total) / 2
  const ty = 822
  for (const [label, value] of tiles) {
    roundRect(ctx, tx, ty, tw, th, 22)
    ctx.fillStyle = '#f7f5f3'
    ctx.fill()
    ctx.fillStyle = '#d94407'
    ctx.font = '800 50px Poppins, Arial, sans-serif'
    ctx.fillText(String(value), tx + tw / 2, ty + 78)
    ctx.fillStyle = '#6b7280'
    ctx.font = '600 23px Poppins, Arial, sans-serif'
    ctx.fillText(label, tx + tw / 2, ty + 120)
    tx += tw + gap
  }

  ctx.fillStyle = '#b6bcc4'
  ctx.font = '600 28px Poppins, Arial, sans-serif'
  ctx.fillText('tryp.com', W / 2, H - 46)

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
