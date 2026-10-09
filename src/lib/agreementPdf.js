// A SIGNED AGREEMENT AS A PDF, FOR BOTH SIDES (10 Oct 2026).
//
// Ethan: the VIP and official creator agreements "need to be signed and retained, a copy for us and a copy for them in
// settings etc that they can download, ensure you format it properly." The text in the PDF is exactly what was signed
// (`agreement_acceptances.rendered_body`, frozen at the moment of signing with its SHA-256), followed by the signature and
// an evidence block: who, when, how, from which account and device, and the document fingerprint - the same record the
// database keeps, so either side can show what was agreed. Built in the browser with pdf-lib (lazy, like the invoices),
// in Poppins, A4, with page numbers.
import { fontBytes, logoPng } from './invoicePdf'
import { SIGNATURE_FONT } from '../components/agreements/SignaturePad'

const A4 = { w: 595.28, h: 841.89 }
const M = 56

/** "**bold** and plain" -> [{ text, bold }] runs. */
function runsOf(line) {
  const out = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  let m
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), bold: false })
    out.push({ text: m[1], bold: true })
    last = re.lastIndex
  }
  if (last < line.length) out.push({ text: line.slice(last), bold: false })
  return out.map((r) => ({ ...r, text: r.text.replace(/\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') }))
}

/** Word-wrap mixed bold/plain runs to a width, as lines of runs. */
function wrapRuns(runs, fonts, size, width) {
  const words = []
  for (const r of runs) for (const w of r.text.split(/(\s+)/)) if (w) words.push({ text: w, bold: r.bold })
  const lines = []
  let line = []
  let w = 0
  for (const word of words) {
    const f = word.bold ? fonts.bold : fonts.reg
    const ww = f.widthOfTextAtSize(word.text, size)
    if (/^\s+$/.test(word.text)) { if (line.length) { line.push(word); w += ww } continue }
    if (w + ww > width && line.length) {
      while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop()
      lines.push(line); line = []; w = 0
    }
    line.push(word); w += ww
  }
  if (line.length) lines.push(line)
  return lines
}

/** A signature as PNG bytes: a drawn one from its SVG, a typed one written in the signature font. */
async function signaturePng(acc) {
  try {
    const c = document.createElement('canvas')
    c.width = 900; c.height = 240
    const ctx = c.getContext('2d')
    if (acc.method === 'drawn' && acc.signature_svg) {
      const img = new Image()
      img.src = `data:image/svg+xml;utf8,${encodeURIComponent(acc.signature_svg)}`
      await img.decode()
      const r = Math.min(c.width / img.width, c.height / img.height)
      ctx.drawImage(img, 0, 0, img.width * r, img.height * r)
    } else if (acc.signed_name) {
      try { await document.fonts?.load(`72px ${SIGNATURE_FONT}`) } catch { /* the fallback cursive is fine */ }
      ctx.fillStyle = '#111'
      ctx.font = `92px ${SIGNATURE_FONT}`
      ctx.textBaseline = 'middle'
      ctx.fillText(acc.signed_name, 12, c.height / 2, c.width - 24)
    } else return null
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null
  } catch { return null }
}

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : '-')

/**
 * acc: { title, version, published_at?, rendered_body, accepted_at, method, signed_name, signature_svg, body_sha256,
 *        account_email?, ip?, user_agent?, locale?, name, guardian_name?, guardian_email? }
 * Returns PDF bytes.
 */
export async function buildAgreementPdf(acc) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const brand = rgb(0.851, 0.267, 0.027)
  const ink = rgb(0.1, 0.1, 0.11)
  const smoke = rgb(0.42, 0.42, 0.45)
  const rule = rgb(0.9, 0.9, 0.9)
  const tint = rgb(0.992, 0.953, 0.925)

  const doc = await PDFDocument.create()
  doc.setTitle(`${acc.title} v${acc.version} - ${acc.name || acc.signed_name || 'signed'}`)
  doc.setAuthor('Tryp.com ApS')
  doc.setSubject('Signed agreement')
  doc.setCreator('Tryp.com creator platform')
  const [regBytes, boldBytes] = await fontBytes()
  let reg, bold
  if (regBytes && boldBytes) {
    const fontkit = (await import('@pdf-lib/fontkit')).default
    doc.registerFontkit(fontkit)
    reg = await doc.embedFont(regBytes, { subset: true })
    bold = await doc.embedFont(boldBytes, { subset: true })
  } else {
    reg = await doc.embedFont(StandardFonts.Helvetica)
    bold = await doc.embedFont(StandardFonts.HelveticaBold)
  }
  const fonts = { reg, bold }
  const W = A4.w - 2 * M
  let page
  let y
  const pages = []
  const newPage = () => {
    page = doc.addPage([A4.w, A4.h])
    pages.push(page)
    y = A4.h - M
  }
  const need = (h) => { if (y - h < M + 24) newPage() }

  // ---- first page head: logo, title, the status line ----
  newPage()
  const logo = await logoPng()
  if (logo) {
    const img = await doc.embedPng(logo)
    const h = 30
    page.drawImage(img, { x: M, y: y - h, width: (img.width / img.height) * h, height: h })
  }
  const tag = 'SIGNED COPY'
  page.drawText(tag, { x: A4.w - M - bold.widthOfTextAtSize(tag, 8), y: y - 12, font: bold, size: 8, color: brand })
  const v = `Version ${acc.version}`
  page.drawText(v, { x: A4.w - M - reg.widthOfTextAtSize(v, 8), y: y - 24, font: reg, size: 8, color: smoke })
  y -= 58
  for (const line of wrapRuns([{ text: acc.title, bold: true }], fonts, 20, W)) {
    page.drawText(line.map((w) => w.text).join(''), { x: M, y, font: bold, size: 20, color: ink })
    y -= 26
  }
  page.drawText(`Signed by ${acc.signed_name || acc.name || '-'} on ${when(acc.accepted_at)}`, { x: M, y, font: reg, size: 9, color: smoke })
  y -= 14
  page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 1, color: brand })
  y -= 18

  // ---- the body, exactly as signed ----
  const body = String(acc.rendered_body || '').replace(/\r\n/g, '\n')
  const lines = body.split('\n')
  // The document's own `# Title` repeats the heading above.
  if (/^\s*#\s+/.test(lines[0] || '')) lines.shift()
  const draw = (runsLines, size, x0, color, lead) => {
    for (const ln of runsLines) {
      need(lead)
      let x = x0
      for (const w of ln) {
        const f = w.bold ? bold : reg
        page.drawText(w.text, { x, y: y - size, font: f, size, color })
        x += f.widthOfTextAtSize(w.text, size)
      }
      y -= lead
    }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) { y -= 5; continue }
    if (/^---+$/.test(line.trim())) { need(14); y -= 6; page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.6, color: rule }); y -= 10; continue }
    const h2 = line.match(/^##\s+(.*)$/)
    if (h2) {
      need(34); y -= 8
      draw(wrapRuns([{ text: h2[1].replace(/\*/g, ''), bold: true }], fonts, 12, W), 12, M, ink, 17)
      y -= 3
      continue
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    if (bullet) {
      const wrapped = wrapRuns(runsOf(bullet[1]), fonts, 9.5, W - 14)
      need(14)
      page.drawCircle({ x: M + 3, y: y - 6.2, size: 1.6, color: brand })
      draw(wrapped, 9.5, M + 14, ink, 14)
      y -= 2
      continue
    }
    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      const wrapped = wrapRuns(runsOf(quote[1]), fonts, 9.5, W - 20)
      const h = wrapped.length * 14 + 10
      need(h)
      page.drawRectangle({ x: M, y: y - h + 4, width: W, height: h, color: tint })
      y -= 5
      draw(wrapped, 9.5, M + 10, ink, 14)
      y -= 6
      continue
    }
    draw(wrapRuns(runsOf(line), fonts, 9.5, W), 9.5, M, ink, 14)
    y -= 3
  }

  // ---- the signature ----
  const png = await signaturePng(acc)
  need(150)
  y -= 14
  page.drawText('SIGNATURE', { x: M, y, font: bold, size: 8, color: brand })
  y -= 10
  page.drawRectangle({ x: M, y: y - 92, width: 260, height: 92, borderColor: rule, borderWidth: 1, color: rgb(1, 1, 1) })
  if (png) {
    const img = await doc.embedPng(png)
    const r = Math.min(240 / img.width, 70 / img.height)
    page.drawImage(img, { x: M + 10, y: y - 82, width: img.width * r, height: img.height * r })
  } else if (acc.method === 'click') {
    page.drawText('Accepted by pressing "I agree"', { x: M + 12, y: y - 50, font: reg, size: 10, color: smoke })
  } else if (acc.signed_name) {
    // No image could be made (no canvas, or the drawing would not decode): the name they signed with, large, so the box
    // is never empty on a signed copy.
    let size = 22
    while (size > 11 && bold.widthOfTextAtSize(acc.signed_name, size) > 236) size -= 1
    page.drawText(acc.signed_name, { x: M + 12, y: y - 54, font: bold, size, color: ink })
  }
  page.drawText(acc.signed_name || acc.name || '', { x: M + 280, y: y - 30, font: bold, size: 11, color: ink })
  page.drawText(when(acc.accepted_at), { x: M + 280, y: y - 46, font: reg, size: 9, color: smoke })
  page.drawText(acc.method === 'drawn' ? 'Drawn signature' : acc.method === 'typed' ? 'Typed signature' : 'Accepted in the app', { x: M + 280, y: y - 60, font: reg, size: 9, color: smoke })
  y -= 112

  // ---- the evidence ----
  const rows = [
    ['Document', `${acc.title}, version ${acc.version}${acc.published_at ? `, published ${when(acc.published_at)}` : ''}`],
    ['Signed by', `${acc.name || '-'}${acc.signed_name && acc.signed_name !== acc.name ? ` (signed as "${acc.signed_name}")` : ''}`],
    ['Account', acc.account_email || '-'],
    ['Time', when(acc.accepted_at)],
    ['Method', acc.method === 'click' ? 'Accepted in the app' : `${acc.method === 'drawn' ? 'Drawn' : 'Typed'} electronic signature (EU Regulation 910/2014)`],
    ...(acc.guardian_name ? [['Parent or guardian', `${acc.guardian_name}${acc.guardian_email ? `, ${acc.guardian_email}` : ''}`]] : []),
    ...(acc.ip ? [['Network address', acc.ip]] : []),
    ...(acc.user_agent ? [['Device', acc.user_agent]] : []),
    ['Text fingerprint', `SHA-256 ${acc.body_sha256 || '-'}`],
  ]
  need(40)
  page.drawText('RECORD OF SIGNING', { x: M, y, font: bold, size: 8, color: brand })
  y -= 14
  for (const [k, val] of rows) {
    const wrapped = wrapRuns([{ text: String(val), bold: false }], fonts, 8, W - 110)
    need(wrapped.length * 11 + 4)
    page.drawText(k, { x: M, y: y - 8, font: bold, size: 8, color: smoke })
    for (const ln of wrapped) { page.drawText(ln.map((w) => w.text).join(''), { x: M + 110, y: y - 8, font: reg, size: 8, color: ink }); y -= 11 }
    y -= 3
  }
  need(30)
  y -= 6
  for (const ln of wrapRuns([{ text: 'Tryp.com ApS keeps this record. The fingerprint is calculated over the exact text above; any change to the text gives a different fingerprint. Tryp.com ApS, CVR 42533165, Drewsensvej 3, st. th, 5000 Odense C, Denmark.', bold: false }], fonts, 7.5, W)) {
    page.drawText(ln.map((w) => w.text).join(''), { x: M, y: y - 8, font: reg, size: 7.5, color: smoke }); y -= 10
  }

  // ---- page numbers ----
  pages.forEach((p, i) => {
    const t = `${acc.title} · v${acc.version} · page ${i + 1} of ${pages.length}`
    p.drawText(t, { x: (A4.w - reg.widthOfTextAtSize(t, 7.5)) / 2, y: 28, font: reg, size: 7.5, color: smoke })
  })
  return doc.save()
}

export function agreementFilename(acc) {
  const who = String(acc.name || acc.signed_name || 'creator').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
  const what = String(acc.title || 'agreement').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
  const d = acc.accepted_at ? new Date(acc.accepted_at).toISOString().slice(0, 10) : 'signed'
  return `${what}-v${acc.version}-${who}-${d}.pdf`
}

export async function downloadAgreementPdf(acc) {
  const bytes = await buildAgreementPdf(acc)
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = agreementFilename(acc)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
