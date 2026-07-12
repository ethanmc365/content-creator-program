// Builds the prize invoice as a crisp vector PDF (A4) with pdf-lib.
// Layout mirrors the on-screen preview in AdminInvoices (and the finance
// team's sample): creator name up top, Tryp.com logo, INVOICE TO block,
// line item, NOTES + TOTAL, then a PAY TO box with the bank details.
// pdf-lib is dynamically imported so it never weighs down the main bundle.
import { format } from 'date-fns'
import { DEFAULT_BILL_TO, invoiceNo, invoiceMoney as money, paymentRows } from './invoice'

const A4 = { w: 595.28, h: 841.89 }
const MARGIN = 52

// The brand logo file is a full-bleed 1200x630 card; crop the wordmark area
// and round the corners on a canvas so the invoice gets a compact logo chip.
// Cached module-level (the PDF is always built in the browser).
let logoPngPromise
function logoPng() {
  if (!logoPngPromise) {
    logoPngPromise = (async () => {
      const img = new Image()
      img.src = '/brand/tryp-logo.png'
      await img.decode()
      const sx = 255, sy = 195, sw = 690, sh = 250 // tight crop around "TRYP.com"
      const c = document.createElement('canvas')
      c.width = sw / 2
      c.height = sh / 2
      const ctx = c.getContext('2d')
      const w = c.width, h = c.height, r = 26
      ctx.beginPath()
      ctx.moveTo(r, 0)
      ctx.arcTo(w, 0, w, h, r)
      ctx.arcTo(w, h, 0, h, r)
      ctx.arcTo(0, h, 0, 0, r)
      ctx.arcTo(0, 0, w, 0, r)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
      return new Uint8Array(await blob.arrayBuffer())
    })().catch(() => null)
  }
  return logoPngPromise
}

// Greedy word-wrap using real glyph widths.
function wrap(text, font, size, maxWidth) {
  const words = String(text || '').split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(probe, size) <= maxWidth) line = probe
    else { if (line) lines.push(line); line = w }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * inv = { number, issueDate (Date|ISO), creatorName, creatorAddress,
 *         amount, currency, description, notes, billTo (multiline), payee }
 * Returns a Uint8Array of PDF bytes.
 */
export async function buildInvoicePdf(inv) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

  const brand = rgb(0.851, 0.267, 0.027)      // #d94407
  const brandTint = rgb(0.992, 0.941, 0.906)  // #fdf0e7
  const ink = rgb(0.1, 0.1, 0.1)
  const smoke = rgb(0.45, 0.45, 0.47)
  const rule = rgb(0.88, 0.88, 0.88)

  const doc = await PDFDocument.create()
  const page = doc.addPage([A4.w, A4.h])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const issue = inv.issueDate ? new Date(inv.issueDate) : new Date()
  const due = new Date(issue.getTime() + 7 * 24 * 60 * 60 * 1000)
  const right = A4.w - MARGIN
  const contentW = A4.w - 2 * MARGIN
  const textR = (t, y, f, size, color) =>
    page.drawText(t, { x: right - f.widthOfTextAtSize(t, size), y, font: f, size, color })

  // ---- Creator name headline ----
  const name = String(inv.creatorName || 'Creator name').toUpperCase()
  let nameSize = 24
  while (nameSize > 12 && bold.widthOfTextAtSize(name, nameSize) > contentW) nameSize -= 1
  let y = A4.h - 78
  page.drawText(name, { x: MARGIN, y, font: bold, size: nameSize, color: ink })
  y -= 20
  page.drawText('C O N T E N T   C R E A T O R   P R O G R A M', { x: MARGIN, y, font: bold, size: 8, color: smoke })
  const addressOneLine = String(inv.creatorAddress || '').replace(/\n+/g, ', ')
  if (addressOneLine) {
    for (const line of wrap(addressOneLine, font, 9, contentW).slice(0, 2)) {
      y -= 14
      page.drawText(line, { x: MARGIN, y, font, size: 9, color: smoke })
    }
  }

  // ---- Logo (left) and INVOICE #(right) ----
  const logoTop = y - 20
  const logoH = 44
  const logoBytes = await logoPng()
  if (logoBytes) {
    const png = await doc.embedPng(logoBytes)
    const dims = png.scale(logoH / png.height)
    page.drawImage(png, { x: MARGIN, y: logoTop - logoH, width: dims.width, height: dims.height })
  } else {
    page.drawText('TRYP.com', { x: MARGIN, y: logoTop - 30, font: bold, size: 24, color: brand })
  }
  textR('INVOICE', logoTop - 26, bold, 30, ink)
  textR(`#${invoiceNo(inv.number)}`, logoTop - 46, bold, 14, brand)

  y = logoTop - logoH - 40

  // ---- INVOICE TO (left) + dates (right) ----
  const yBlockTop = y
  page.drawText('INVOICE TO', { x: MARGIN, y, font: bold, size: 9, color: brand })
  y -= 17
  const billLines = String(inv.billTo || DEFAULT_BILL_TO).split(/\n+/).map((l) => l.trim()).filter(Boolean)
  billLines.flatMap((l, i) => wrap(l, i === 0 ? bold : font, i === 0 ? 11.5 : 10, 320).map((t) => [t, i === 0]))
    .slice(0, 7)
    .forEach(([line, isFirst]) => {
      page.drawText(line, { x: MARGIN, y, font: isFirst ? bold : font, size: isFirst ? 11.5 : 10, color: isFirst ? ink : smoke })
      y -= isFirst ? 16 : 14.5
    })

  let yR = yBlockTop
  for (const [label, value] of [['Date', format(issue, 'd MMMM yyyy')], ['Payment due', format(due, 'd MMMM yyyy')]]) {
    textR(value, yR, bold, 10.5, ink)
    const vw = bold.widthOfTextAtSize(value, 10.5)
    page.drawText(label, { x: right - vw - 8 - font.widthOfTextAtSize(label, 9), y: yR + 0.5, font, size: 9, color: smoke })
    yR -= 17
  }

  // ---- Line item table ----
  let yT = Math.min(y, yR) - 28
  page.drawRectangle({ x: MARGIN - 10, y: yT - 7, width: contentW + 20, height: 24, color: brandTint })
  page.drawText('DESCRIPTION', { x: MARGIN, y: yT, font: bold, size: 8.5, color: brand })
  textR('AMOUNT', yT, bold, 8.5, brand)
  yT -= 26

  const desc = wrap(inv.description, font, 10.5, contentW - 120)
  const amountStr = money(inv.amount, inv.currency)
  textR(amountStr, yT, font, 10.5, ink)
  for (const line of desc.slice(0, 3)) {
    page.drawText(line, { x: MARGIN, y: yT, font, size: 10.5, color: ink })
    yT -= 15
  }
  yT -= 6
  page.drawLine({ start: { x: MARGIN - 10, y: yT }, end: { x: right + 10, y: yT }, thickness: 0.8, color: rule })

  // ---- NOTES (left) + TOTAL (right) ----
  let yN = yT - 26
  const totalX = right - 220
  if (inv.notes?.trim()) {
    page.drawText('NOTES', { x: MARGIN, y: yN, font: bold, size: 8.5, color: brand })
    let yNote = yN - 16
    for (const line of wrap(inv.notes, font, 9.5, totalX - MARGIN - 30).slice(0, 3)) {
      page.drawText(line, { x: MARGIN, y: yNote, font, size: 9.5, color: smoke })
      yNote -= 13.5
    }
  }
  page.drawText('TOTAL', { x: totalX, y: yN - 6, font: bold, size: 12, color: ink })
  textR(amountStr, yN - 8, bold, 16, brand)
  page.drawLine({ start: { x: totalX, y: yN - 20 }, end: { x: right, y: yN - 20 }, thickness: 1.2, color: ink })

  // ---- PAY TO box ----
  const rows = paymentRows(inv.payee || {})
  const boxH = 56 + rows.length * 17
  const yP = yN - 52 - boxH
  page.drawRectangle({ x: MARGIN - 10, y: yP, width: contentW + 20, height: boxH, color: brandTint })
  let yRow = yP + boxH - 24
  page.drawText('PAY TO', { x: MARGIN, y: yRow, font: bold, size: 9, color: brand })
  yRow -= 20
  for (const [label, value] of rows) {
    page.drawText(label, { x: MARGIN, y: yRow, font, size: 9.5, color: smoke })
    page.drawText(String(value), { x: MARGIN + 130, y: yRow, font: bold, size: 9.5, color: ink })
    yRow -= 17
  }
  page.drawText(`Please pay by bank transfer in ${inv.currency === 'EUR' ? 'euros' : 'pounds sterling'}.`, {
    x: MARGIN, y: yP + 12, font, size: 8.5, color: smoke,
  })

  // ---- Footer ----
  page.drawText('Thank you! Payment is due within 7 days of the issue date.', {
    x: MARGIN, y: 62, font, size: 9, color: smoke,
  })
  page.drawText('Tryp.com Content Creator Program', { x: MARGIN, y: 48, font, size: 9, color: smoke })
  page.drawRectangle({ x: 0, y: 0, width: A4.w, height: 24, color: brand })

  return doc.save()
}

export function invoiceFilename(inv) {
  return `Tryp.com-${invoiceNo(inv.number)}-${(inv.creatorName || 'creator').trim().replace(/\s+/g, '-')}.pdf`
}

export async function downloadInvoicePdf(inv) {
  const bytes = await buildInvoicePdf(inv)
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = invoiceFilename(inv)
  a.click()
  URL.revokeObjectURL(url)
}

export function pdfToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
