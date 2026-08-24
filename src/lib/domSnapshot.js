// A PICTURE OF SOMETHING THE APP ALREADY DRAWS.
//
// The shareable result used to be re-drawn on a canvas: a second implementation
// of the podium, in a different language, kept in step with the real one by
// hand. It drifted, because that is what a second implementation does - the
// canvas version had no "Watch" chips, no card behind it, its own bar heights
// and its own idea of what a leaderboard row looks like. Ethan compared the two
// and picked the real one, which is the correct answer.
//
// So this takes a photograph of the real component instead. The node is cloned,
// every computed style is written onto the clone (no stylesheet is fetched, so
// there is nothing to hang on - the earlier attempt with html-to-image hung
// exactly there), images become data URIs, Poppins is embedded from the copy
// this app already serves, and the whole thing is drawn through an SVG
// <foreignObject> onto a canvas.
//
// Nothing here reaches the network except for images the page is already
// showing and two font files from our own origin, which matters: the CSP allows
// `font-src 'self'` and does NOT allow fetching Google's copy.

const FONT_FILES = [
  { url: '/fonts/Poppins-Regular.ttf', weight: 400 },
  { url: '/fonts/Poppins-Bold.ttf', weight: 700 },
]

function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

async function fetchAsDataUrl(url) {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
  if (!res.ok) throw new Error(`${res.status}`)
  return toDataUrl(await res.blob())
}

// Fetched once per session. Two files, ~150kB each, and every snapshot needs
// them; re-reading them per render is the difference between a picture that
// appears and one you wait for.
let fontCssPromise = null
function fontFaces() {
  if (!fontCssPromise) {
    fontCssPromise = Promise.all(
      FONT_FILES.map((f) => fetchAsDataUrl(f.url).then((d) => ({ ...f, data: d })).catch(() => null)),
    ).then((loaded) => {
      const ok = loaded.filter(Boolean)
      if (!ok.length) return ''
      const regular = ok.find((f) => f.weight === 400) || ok[0]
      const bold = ok.find((f) => f.weight === 700) || regular
      // Only two weights exist on disk. 500 is set from the regular file and
      // 600/800 from the bold one, so a semibold heading stays heavy rather
      // than silently falling back to the system stack mid-picture.
      return [
        [400, regular], [500, regular], [600, bold], [700, bold], [800, bold],
      ].map(([weight, file]) => `@font-face{font-family:'Poppins';font-style:normal;font-weight:${weight};src:url(${file.data}) format('truetype');}`).join('')
    })
  }
  return fontCssPromise
}

// Properties worth copying. The full computed style is ~340 declarations per
// element and serialising all of them makes the SVG megabytes long for no
// visible gain; this is the set that actually describes how a box looks.
const COPY = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float', 'clear',
  'box-sizing', 'max-width', 'max-height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
  'justify-content', 'align-items', 'align-self', 'align-content', 'gap', 'row-gap', 'column-gap', 'order',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant-numeric',
  'line-height', 'letter-spacing', 'text-align', 'text-transform', 'text-decoration',
  'text-overflow', 'white-space', 'word-break', 'overflow-wrap', 'vertical-align',
  'color', 'background-color', 'background-image', 'background-size', 'background-position',
  'background-repeat', 'background-clip', 'background-origin',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'box-shadow', 'opacity', 'overflow-x', 'overflow-y', 'object-fit', 'object-position',
  'fill', 'stroke', 'stroke-width', 'transform', 'transform-origin', 'list-style-type',
]

function inlineStyles(source, clone) {
  const from = [source, ...source.querySelectorAll('*')]
  const to = [clone, ...clone.querySelectorAll('*')]
  for (let i = 0; i < from.length; i++) {
    const el = to[i]
    if (!el || el.nodeType !== 1) continue
    const cs = window.getComputedStyle(from[i])

    // A BOX OF TEXT IS GIVEN A FLOOR, NOT A SIZE.
    //
    // The embedded Poppins is not metrically identical to the one the browser
    // loaded from Google, so text is a few pixels wider in the photograph than
    // it was on screen. Copying a box's measured width and height freezes the
    // OLD layout around the NEW text, and both failures showed up immediately:
    // every leaderboard name came out two characters short with an ellipsis
    // ("Lisa Bur..."), and a line on the certificate wrapped inside its frozen
    // width and then printed on top of the line beneath it.
    //
    // So a box that is not clipping its own content gets `min-width` and
    // `min-height`: it can never be SMALLER than it was measured, and it can
    // grow by the pixel or two the font costs. A box that clips - a card, a
    // round avatar - keeps its exact size, because that is what holds the
    // layout together. A truncating box gets neither and is sized by its parent.
    const clips = cs.getPropertyValue('text-overflow') === 'ellipsis'
    const growX = cs.getPropertyValue('overflow-x') === 'visible'
    const growY = cs.getPropertyValue('overflow-y') === 'visible'

    let css = ''
    for (const prop of COPY) {
      if (clips && prop === 'max-width') continue
      const value = cs.getPropertyValue(prop)
      if (value) css += `${prop}:${value};`
    }

    // LAST, AND THE ELEMENT'S OWN min-width/min-height ARE NEVER COPIED.
    // Emitting these in list order put a computed `min-height:0px` after the
    // mapped one and quietly undid it - which is the overlap above, surviving
    // the fix for it.
    if (!clips) {
      const w = cs.getPropertyValue('width')
      const h = cs.getPropertyValue('height')
      if (w) css += `${growX ? 'min-width' : 'width'}:${w};`
      if (h) css += `${growY ? 'min-height' : 'height'}:${h};`
    }

    // A transition mid-flight would be photographed half-finished.
    css += 'transition:none;animation:none;'
    el.setAttribute('style', css)
    el.removeAttribute('class')
  }
}

// Every image has to be a data URI or the canvas is tainted and toBlob throws.
// An avatar that will not load is replaced by its initials rather than by a
// hole, which is the same fallback the Avatar component itself uses.
async function inlineImages(clone) {
  const imgs = [...clone.querySelectorAll('img')]
  await Promise.all(imgs.map(async (img) => {
    const src = img.getAttribute('src') || ''
    if (!src || src.startsWith('data:')) return
    try {
      img.setAttribute('src', await fetchAsDataUrl(src))
    } catch {
      const name = img.getAttribute('alt') || ''
      const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'
      const box = document.createElement('div')
      box.setAttribute('style', `${img.getAttribute('style') || ''};display:flex;align-items:center;justify-content:center;background:#f7ece6;color:#d94407;font-weight:700;`)
      box.textContent = initials
      img.replaceWith(box)
    }
  }))
}

/**
 * Photograph a node exactly as it is on screen.
 *
 * @param {HTMLElement} node
 * @param {{scale?: number, background?: string}} [opts]
 * @returns {Promise<Blob|null>} a PNG
 */
export async function snapshotNode(node, { scale = 2, background = '#ffffff' } = {}) {
  if (!node) return null
  const rect = node.getBoundingClientRect()
  const width = Math.ceil(rect.width)
  const height = Math.ceil(rect.height)
  if (!width || !height) return null

  try {
    if (document?.fonts?.ready) await document.fonts.ready
  } catch {
    // A missing webfont falls back to the system stack, which is survivable.
  }

  const clone = node.cloneNode(true)
  inlineStyles(node, clone)
  await inlineImages(clone)
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  clone.style.margin = '0'
  clone.style.width = `${width}px`

  const css = await fontFaces()
  const serialized = new XMLSerializer().serializeToString(clone)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><style>${css}</style></defs>` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">${serialized}</foreignObject>` +
    `</svg>`

  const img = new Image()
  img.decoding = 'sync'
  const loaded = new Promise((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('The picture could not be drawn.'))
  })
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await loaded

  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
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
