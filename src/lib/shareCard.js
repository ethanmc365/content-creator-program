// Renders a branded, shareable creator card to a PNG (no server, no deps).
// Returns a Blob the caller can download. Works whether or not the avatar
// loads cross-origin (falls back to initials).
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

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = text.split(' ')
  let line = ''
  let lines = 0
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i]
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y)
      line = words[i]
      y += lineHeight
      if (++lines >= maxLines - 1) break
    } else {
      line = test
    }
  }
  ctx.fillText(line, x, y)
}

export async function generateShareCard({ name, photoUrl, bio, stats }) {
  await (document.fonts?.ready ?? Promise.resolve())
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Brand gradient background.
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#d94407')
  g.addColorStop(1, '#f5853f')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  ctx.font = '800 66px Poppins, Arial, sans-serif'
  ctx.fillText('TRYP.com', W / 2, 140)
  ctx.font = '600 30px Poppins, Arial, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillText('CONTENT CREATOR PROGRAM', W / 2, 188)

  // Avatar (photo if it loads, else initials).
  const cx = W / 2
  const cy = 410
  const r = 150
  const img = await loadImage(photoUrl)
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  if (img) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2)
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 120px Poppins, Arial, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials(name), cx, cy + 4)
    ctx.textBaseline = 'alphabetic'
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.lineWidth = 10
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.stroke()

  // Name + bio.
  ctx.fillStyle = '#ffffff'
  ctx.font = '800 72px Poppins, Arial, sans-serif'
  ctx.fillText(name || 'Tryp.com Creator', W / 2, 680)
  if (bio) {
    ctx.font = '400 36px Poppins, Arial, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    wrapText(ctx, bio, W / 2, 740, 900, 48, 2)
  }

  // Stat tiles.
  const tiles = [
    ['Countries', stats.countries],
    ['Challenges', stats.challenges],
    ['Badges', stats.badges],
  ]
  const tw = 240
  const th = 150
  const gap = 30
  const totalW = tiles.length * tw + (tiles.length - 1) * gap
  let tx = (W - totalW) / 2
  const ty = 850
  for (const [label, value] of tiles) {
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    const rr = 24
    ctx.beginPath()
    ctx.moveTo(tx + rr, ty)
    ctx.arcTo(tx + tw, ty, tx + tw, ty + th, rr)
    ctx.arcTo(tx + tw, ty + th, tx, ty + th, rr)
    ctx.arcTo(tx, ty + th, tx, ty, rr)
    ctx.arcTo(tx, ty, tx + tw, ty, rr)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 56px Poppins, Arial, sans-serif'
    ctx.fillText(String(value), tx + tw / 2, ty + 75)
    ctx.font = '600 26px Poppins, Arial, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText(label, tx + tw / 2, ty + 115)
    tx += tw + gap
  }

  ctx.font = '600 30px Poppins, Arial, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillText('tryp.com', W / 2, H - 60)

  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

// Build + download the card.
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
