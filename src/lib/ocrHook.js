// READING A HOOK OFF THE PICTURE.
//
// The team: the 100k page missed the hook on Jacob's Paris Christmas markets post, and Noa's showed nothing ("End goal."
// is on it). Both are TikTok PHOTO posts: the words are drawn into the slide image, so there is no text sticker for the
// scraper to read (view-sync's tiktokScreenText) and nothing in the page either. The only place the words exist is the
// picture. So this reads them off it, the way a person would: optical character recognition on the stored cover.
//
// IT RUNS IN THE TEAM MEMBER'S BROWSER, NEVER ON SUPABASE ("without crashing Supabase or anything"). The engine
// (tesseract.js, self-hosted under /ocr because the CSP only runs our own scripts) and the language data (from jsdelivr,
// which connect-src allows) load the first time somebody presses "Read it off the picture", and not before. The answer
// is shown to the person, who can correct it, and only then saved through set_video_hook like a typed hook.
//
// A RAW READ OF A TRAVEL PHOTO IS NOISE (measured: "BREN hi == o AN > a..." for the Paris cover). Hook text on TikTok is
// a light word (white, or yellow) on a busy picture, or white on a coloured box. So the picture is read three ways - a
// mask of near-white pixels, a mask of bright warm (yellow) pixels, and plain grey - each scaled up, and only lines the
// engine is confident about and that look like words are kept. The read with the most confident text wins.

const ENGINE = {
  workerPath: '/ocr/worker.min.js',
  corePath: '/ocr/tesseract-core-simd-lstm.wasm.js',
  workerBlobURL: false,
}

// App language -> tesseract language code. English is always read as well.
const TESS = { en: 'eng', es: 'spa', pt: 'por', de: 'deu', ro: 'ron', it: 'ita', fr: 'fra', nl: 'nld', pl: 'pol', da: 'dan', sv: 'swe', nb: 'nor', no: 'nor', fi: 'fin' }

const workers = new Map()
async function workerFor(langs) {
  const key = langs.join('+')
  if (!workers.has(key)) {
    workers.set(key, import('tesseract.js').then(({ createWorker }) => createWorker(langs, 1, ENGINE)))
  }
  return workers.get(key)
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The picture could not be loaded.'))
    img.src = url
  })
}

// One canvas per way of reading the picture. `keep(r, g, b)` says which pixels are text (drawn black on white).
function variant(img, keep) {
  const scale = Math.min(3, 1200 / Math.max(1, img.naturalWidth))
  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h)
  const p = d.data
  for (let i = 0; i < p.length; i += 4) {
    const v = keep ? (keep(p[i], p[i + 1], p[i + 2]) ? 0 : 255) : Math.round(0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2])
    p[i] = p[i + 1] = p[i + 2] = v
  }
  ctx.putImageData(d, 0, 0)
  return c
}

// Measured on the Paris cover (white words on blue boxes): > 230 read all four lines at 83-92% confidence, > 205 only
// two of them, and a plain grey read nothing but noise. So the strict white comes first and grey is the last resort.
const BRIGHT = (r, g, b) => Math.min(r, g, b) > 230
const WHITE = (r, g, b) => Math.min(r, g, b) > 205
const WARM = (r, g, b) => r > 200 && g > 160 && b < 130 && r - b > 90
const LETTER = /\p{L}/u

/** The lines worth keeping from one read: confident, mostly letters, more than a stray character. */
export function goodLines(blocks, min = 72) {
  const out = []
  for (const b of blocks || []) for (const para of b.paragraphs || []) for (const line of para.lines || []) {
    const text = String(line.text || '').replace(/\s+/g, ' ').trim()
    if (!text || line.confidence < min) continue
    const letters = [...text].filter((ch) => LETTER.test(ch)).length
    const words = (line.words || []).filter((w) => w.confidence >= min - 10 && [...String(w.text)].some((ch) => LETTER.test(ch)))
    if (letters < 2 || letters / text.replace(/\s/g, '').length < 0.5 || !words.length) continue
    out.push({ text, confidence: line.confidence })
  }
  return out
}

/** The engine's usual slips on a hook: a lone "|" is the word I, and stray marks at either end are bits of the picture. */
export function tidyHook(text) {
  return String(text || '')
    .replace(/(^|\s)\|(?=\s|$)/g, '$1I')
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/^[\s.,:;|*~_\-—–'"`]+/, '')
    .replace(/[\s|*~_\-—–`]+$/, '')
    .replace(/\s+/g, ' ')
    .trim() || null
}

/**
 * The words on a picture, best effort. Resolves to { text, confidence } (text null when nothing readable was found).
 * `lang` is the app language of the video's market; English is always read too.
 */
export async function readHookFromImage(url, lang = 'en') {
  const langs = [...new Set(['eng', TESS[lang] || 'eng'])]
  const [img, worker] = await Promise.all([loadImage(url), workerFor(langs)])
  let best = { text: null, confidence: 0, score: 0 }
  for (const keep of [BRIGHT, WHITE, WARM, null]) {
    if (keep === null && best.text) break
    const { data } = await worker.recognize(variant(img, keep), {}, { blocks: true, text: false })
    const lines = goodLines(data.blocks)
    if (!lines.length) continue
    const score = lines.reduce((n, l) => n + l.confidence * l.text.length, 0)
    if (score > best.score) {
      best = { text: tidyHook(lines.map((l) => tidyHook(l.text)).filter(Boolean).join(' ')), confidence: Math.round(lines.reduce((n, l) => n + l.confidence, 0) / lines.length), score }
    }
  }
  return { text: best.text, confidence: best.confidence }
}

