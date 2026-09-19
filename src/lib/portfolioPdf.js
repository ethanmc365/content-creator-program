import { snapshotNode } from './domSnapshot'
import { PAGE_H, PAGE_W } from './portfolio'

// THE PORTFOLIO, AS A PDF SOMEBODY CAN EMAIL A BRAND.
//
// A PHOTOGRAPH OF THE REAL PAGES, NOT A SECOND DRAWING OF THEM.
//
// `lib/invoicePdf` draws its document with pdf-lib primitives - real text, real
// vectors, selectable and tiny - and that is right for an invoice, which is a
// fixed form with eight fields in it that finance reads in a PDF viewer. It is
// the wrong answer here and the reason is written in the first paragraph of
// `lib/domSnapshot`: the shareable result used to be re-drawn on a canvas, "a
// second implementation of the podium, in a different language, kept in step
// with the real one by hand", and it drifted. A portfolio has photographs,
// avatars, a five-page layout and copy the creator edits live. Drawing it twice
// would mean the preview and the PDF disagree the first time anybody changes a
// margin, and the preview is the thing Ethan asked to be exact: "it should show
// on the screen exactly how the pdf will look".
//
// The cost is a raster PDF: text is not selectable and the file is a megabyte
// or two rather than fifty kilobytes. For a document whose whole job is to be
// LOOKED AT, that is the correct trade.
//
// EXPORTED AT 2x, so the page carries 2560x1440 pixels - about 190dpi at this
// size, which is past the point where type looks soft on a laptop screen or in
// print at arm's length, and half the file size of 3x.
const SCALE = 2

// THE PDF PAGE HAS TO BE THE SAME SHAPE AS THE PREVIEW, or the snapshot is
// stretched onto it and every circle becomes an ellipse. It used to be A4
// landscape (841.89 x 595.28, root-2) and the pages were 1123x794 to match.
// Both moved to 16:9 together on 20 Sep 2026 - see the note on PAGE_W. This is
// 13.333in x 7.5in in PostScript points, which is what PowerPoint and Google
// Slides call widescreen.
const SLIDE_16_9 = { w: 960, h: 540 }

/**
 * @param {HTMLElement[]} nodes   the page nodes, at their natural 1280x720
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<Blob>}
 */
export async function portfolioPdf(nodes, onProgress) {
  const pages = (nodes || []).filter(Boolean)
  if (!pages.length) throw new Error('There are no pages to export.')

  // pdf-lib is a 400kB chunk and almost nobody exports a portfolio on any given
  // visit, so it is never in the shell. Same reasoning as invoicePdf.
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle('Tryp.com creator portfolio')
  doc.setCreator('Tryp.com Content Creator Community')

  // REPORTED BEFORE THE PAGE, NOT AFTER IT. Photographing an A4 page at 2x
  // takes a few seconds, so reporting on completion leaves the button saying
  // "Preparing..." for the whole of page one - which is the stretch where
  // somebody is most likely to decide it has hung and press it again.
  onProgress?.(0, pages.length)

  for (const [i, node] of pages.entries()) {
    onProgress?.(i, pages.length)
    // A SANITY CHECK, BECAUSE THE FAILURE IS SILENT AND UGLY. `snapshotNode`
    // measures with `getBoundingClientRect`, which reports the TRANSFORMED box.
    // Hand it a node that is still scaled to fit a phone column and the export
    // is a crisp picture of a 340px page - it looks fine in the tool and awful
    // on the brand's screen. The export therefore renders its own unscaled
    // deck; this throws if somebody ever wires it to the visible one instead.
    const rect = node.getBoundingClientRect()
    if (Math.abs(rect.width - PAGE_W) > 2) {
      throw new Error(`A page measured ${Math.round(rect.width)}px rather than ${PAGE_W}px. The export deck must not be scaled.`)
    }

    const png = await snapshotNode(node, { scale: SCALE, background: '#ffffff' })
    if (!png) throw new Error('One of the pages could not be drawn.')
    const image = await doc.embedPng(await png.arrayBuffer())
    const page = doc.addPage([SLIDE_16_9.w, SLIDE_16_9.h])
    // Full bleed. The pages are authored at exactly A4's ratio (1123:794 is
    // root-2), so there is no letterboxing to reason about and no margin to
    // add - the margins are drawn INSIDE the page, where the designer put them.
    page.drawImage(image, { x: 0, y: 0, width: SLIDE_16_9.w, height: SLIDE_16_9.h })
  }

  return new Blob([await doc.save()], { type: 'application/pdf' })
}

/** `portfolio-roxanna-travels.pdf` */
export function portfolioFilename(name) {
  const slug = String(name || 'creator').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug || 'creator'}-portfolio.pdf`
}

export { PAGE_W, PAGE_H }
