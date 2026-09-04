import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { compressImage } from '../lib/image'
import { uploadFile } from '../lib/upload'
import Icon from './Icon'
import { Spinner } from './ui'
import { cx } from '../lib/utils'
import { onPhotosChanged, photosChanged } from '../lib/photoEvents'
import { confirm, notice } from '../lib/confirm'
import { useT } from '../lib/i18n'

// THE TRAVEL PHOTO BOARD: A PACKED COLLAGE YOU REARRANGE.
//
// FOUR ATTEMPTS. WHAT EACH ONE GOT WRONG, SO THE NEXT PERSON DOES NOT REPEAT IT.
//
//  1. A 12-column grid with free 2-D placement. Every `creator_photos` row in
//     production had `pos_x = null`: nobody ever completed an arrangement.
//     Unbounded `pos_y` let the board grow taller than the screen, and twelve
//     columns at 375px is a 31px cell, so it was switched off on phones.
//  2. Masonry with drag-to-REORDER and a "narrower" button. It worked. Ethan
//     wanted to resize by dragging, not by pressing a button.
//  3. Free placement again, snapped to a twelfth, overlap allowed, four corner
//     grips. This is the one Ethan is reporting on now, and the report names
//     all three faults exactly:
//       "I don't like the current shuffliness when moving them around, and I
//        don't like that you're able to overlap photos. Whenever you overlap
//        photos, the other ones are suddenly moving... I tried to move one of
//        the landscape ones up to the middle and the vertical one down, and it
//        caused the other ones to all rejumble."
//
// THE REJUMBLE WAS NOT A BUG IN THE DRAG. It was structural, and it is worth
// writing down because it is invisible from the outside: the board drew
// ARRANGED photos from their stored coordinates and UNARRANGED ones from a
// masonry packer run over *only the unarranged ones*. So the moment you moved
// your first photo it left that set, the packer re-ran over a different list,
// and every photo you had not touched jumped somewhere else. Every drag
// rearranged the whole board. No amount of smoothing the pointer maths could
// have fixed that.
//
// SO THE BOARD IS ONE LAYOUT NOW, ALWAYS. `packBoard` is a pure function of
// (order, spans, aspects) run over EVERY photo on every render - there is no
// placed/unplaced split left to disagree with itself. Which means:
//
//   * NOTHING OVERLAPS, by construction rather than by clamping. A masonry
//     packer cannot produce an overlap; it is not a rule being enforced.
//   * NOTHING JITTERS. The layout is deterministic, so a photo only moves when
//     the order or a span actually changes, and then it TRANSITIONS there.
//   * A DRAG IS A REORDER. You pick a photo up, the rest re-flow live to show
//     you where it will land, and it snaps into that place when you let go.
//     Ethan: "creators can rearrange it, but the photos always snap in place,
//     so they're not overlapping each other."
//   * THE UNARRANGED BOARD AND THE ARRANGED ONE ARE THE SAME LAYOUT. "It should
//     always start, whenever they upload, just as 'tidy them up' - the way it
//     looks there, in a clean collage format." A fresh board is simply this
//     packer with every span at 1, which is exactly what "Tidy them up" resets
//     to. There is no second code path to drift.
//
//  4. The packed collage with a corner hit zone for resizing. The packing is
//     right and stays; the resize was not. An invisible 36px zone in the
//     bottom-right of a tile, marked only by a hairline that fades in under the
//     pointer, is a control you have to be told about - and on a phone there is
//     no pointer to fade it in with, so on the device most of this board is
//     looked at, resizing was undiscoverable and effectively absent.
//
// SO SIZE IS A BUTTON NOW, AND IT IS THE FIFTH DESIGN (1 Sep 2026).
//
// Ethan: "rather than the ability to drag to resize, we should have a simple
// button in top right of each photo and clicking it alters the size, there
// should be three sizes, every photo should start at the small size then one
// click makes it the middle size, and another the big size, then we just need
// the ability to drag the photos to rearrange them."
//
// One gesture per job: DRAG MOVES, BUTTON SIZES. That is the whole change, and
// it removes a real ambiguity as well as an invisible control - a press near
// the corner of a tile used to mean one of two things depending on 36 pixels,
// and on a touch screen you cannot see which one you are about to get.
//
// THE SIZE IS A STORED LEVEL, NOT A DERIVED SPAN. `creator_photos.size` is
// small | medium | large (migration 162 widened the CHECK, which only had two
// values and would have silently rejected the third). The span it draws at is
// `min(level, cols)`, so the same board reads as 1/2/3 of three columns on a
// desktop and 1/2/2 of two on a phone: a photo you made large is still the
// widest thing on the board at any width, which is what "large" has to mean.
// The old span-out-of-pos_w derivation is kept as the FALLBACK for the 285
// rows in production that predate this, so nobody's board is reset by the
// change.
//
// STILL PER-MILLE, STILL IN THE SAME FOUR COLUMNS. x, y, w and h are written as
// thousandths of the board's width, so the profile renders the identical
// arrangement, scaled, at any width - and the read-only path is unchanged.
// `smallint` holds 0..32767, which is plenty.

const MILLE = 1000

// The gap between tiles, as a fraction of the board's width. One number, used
// by the packer and by nothing else.
const GAP = 0.02

// BELOW THIS, A STORED POSITION IS NOT A POSITION.
//
// These four columns used to hold 12-COLUMN GRID CELLS - `pos_w = 4` meant four
// columns wide - and they hold per-mille fractions now. Both are smallint, so
// nothing complained, and the board read a leftover `4` as four thousandths of
// the board. Migration 150 cleared those rows; this is the guard that means a
// straggler degrades to a default span instead of vanishing.
export const MIN_PLACED_MILLE = 40

/** Has this row been arranged with coordinates this board can actually read? */
export function isPlaced(p) {
  return p != null
    && p.pos_x != null && p.pos_y != null && p.pos_w != null && p.pos_h != null
    && Number(p.pos_w) >= MIN_PLACED_MILLE
    && Number(p.pos_h) >= MIN_PLACED_MILLE
}

const toFrac = (n, fallback = null) => (Number.isFinite(Number(n)) && n !== null ? Number(n) / MILLE : fallback)
const toMille = (f) => Math.round(f * MILLE)

// HOW MANY COLUMNS THE BOARD RUNS AT, AND WHY THEY GOT FINER (2 Sep 2026).
//
// Ethan: "the current big version is too big. The current middle version should
// be the big version, the middle version should be the small version, and then
// we should have a new small version."
//
// That is three sizes still - every one of them a notch smaller, with a genuinely
// new smallest. You cannot express that on a three-column grid: the old small
// was already one whole column, and there is nothing under it. So the GRID got
// finer rather than the ladder getting longer - six columns on a desktop, four
// on a phone - and the three levels sit at 1, 2 and 4 of them. Which lands
// almost exactly where he asked:
//
//   new large  = 4/6 = 0.67 of the board  (the old MEDIUM, 2/3)
//   new medium = 2/6 = 0.33               (the old SMALL, 1/3)
//   new small  = 1/6 = 0.17               (new, and half the old smallest)
//
// On a phone the same levels clamp to 1, 2 and 4 of four columns, so "large" is
// still the widest thing on the board at any width - which is what large has to
// mean, and the whole reason the LEVEL is stored rather than a column count.
export function colsFor(width) {
  if (!width) return 6
  return width < 520 ? 4 : 6
}

/** Which of the two stored arrangements this width reads and writes. */
export function variantFor(width) {
  return width && width < 520 ? 'mobile' : 'desktop'
}

// The column each variant keeps its running order and its size ladder in.
// `null` on a mobile row means "nobody has arranged this board on a phone", and
// it falls through to the desktop value - so every board that existed before
// migration 164 looks exactly as it did at both widths.
export const ORDER_KEY = { desktop: 'sort_order', mobile: 'sort_order_mobile' }
export const SIZE_KEY = { desktop: 'size', mobile: 'size_mobile' }

/** This photo's running order in one variant, falling back to the desktop one. */
export function orderOf(p, variant = 'desktop') {
  const own = p?.[ORDER_KEY[variant]]
  if (own != null) return Number(own)
  return Number(p?.sort_order ?? 0)
}

/** This photo's size in one variant, falling back to the desktop one. */
export function sizeOf(p, variant = 'desktop') {
  return p?.[SIZE_KEY[variant]] || p?.size || 'small'
}

// THE THREE SIZES, AND WHAT EACH ONE IS WORTH IN COLUMNS.
//
// A level, not a column count, because the board runs at two columns on a phone
// and three above it: storing "2 columns" would mean a photo that fills half a
// desktop board fills the whole of a phone one and a photo that fills the whole
// desktop board cannot be distinguished from it. Storing the INTENT and
// clamping at draw time keeps "large is the biggest" true at every width.
export const SIZES = ['small', 'medium', 'large']
// 1, 2 and 4 of the board's columns. See `colsFor` for why the middle step
// skips three: it is what makes large two thirds of a desktop board rather than
// the whole of it.
export const SIZE_LEVEL = { small: 1, medium: 2, large: 4 }
const SIZE_TITLE = { small: 'Small - press to make it medium', medium: 'Medium - press to make it large', large: 'Large - press to make it small again' }

/**
 * The next size in the cycle, wrapping large -> small.
 *
 * An unrecognised size counts as SMALL and therefore steps up to medium. The
 * first version returned 'small' for it, so pressing the button on a row whose
 * size was missing or misspelt drew exactly what was already on screen and the
 * control read as dead.
 */
export function nextSize(size) {
  const i = Math.max(0, SIZES.indexOf(size))
  return SIZES[(i + 1) % SIZES.length]
}

/**
 * HOW MANY COLUMNS A PHOTO SPANS, read back out of its stored width.
 *
 * The span is not its own column in the table: it is implied by `pos_w`, which
 * is what the profile already renders from. That keeps one source of truth and
 * needs no migration - and it means a photo widened to two of three columns on
 * a desktop reads as one of two on a phone, which is the right answer rather
 * than a compromise.
 */
export function spanOf(p, cols, variant = 'desktop') {
  // THE STORED SIZE WINS WHERE THERE IS ONE. Every row has a `size` (the column
  // defaults to 'small'), so this is the normal path; the width derivation
  // below only runs for a row whose size is missing or unrecognised.
  // The RAW stored value, not `sizeOf` - that defaults to 'small', and a row
  // with no size at all has to fall through to the width derivation below
  // rather than collapsing to one column. There are 285 such rows in
  // production, all predating the stored level.
  const level = SIZE_LEVEL[p?.[SIZE_KEY[variant]] ?? p?.size]
  if (level) return Math.max(1, Math.min(cols, level))
  const w = isPlaced(p) ? toFrac(p.pos_w, null) : null
  if (w == null) return 1
  const colW = (1 - GAP * (cols - 1)) / cols
  const span = Math.round((w + GAP) / (colW + GAP))
  return Math.max(1, Math.min(cols, span))
}

/**
 * THE WHOLE LAYOUT, AND THE ONLY THING THAT DECIDES WHERE ANYTHING GOES.
 *
 * Masonry with spans: each photo takes `span` adjacent columns and drops into
 * the run of columns whose tallest member is lowest, leftmost winning ties.
 * Height is always width / aspect, so a photograph is never squeezed into a
 * shape it is not and `object-cover` never gets the chance to crop it.
 *
 * Two properties matter more than the arithmetic:
 *   - OVERLAP IS IMPOSSIBLE. A tile is placed at the current top of its columns
 *     and then raises them; there is nowhere for a second tile to land on it.
 *   - IT IS PURE. Same order, same spans, same aspects, same board - always.
 *     That is what makes a drag preview honest and stops the board moving on
 *     its own.
 *
 * @param items [{ aspect, span }] in board order
 * @param cols  how many columns the board runs at
 * @returns [{ x, y, w, h }] as fractions of the board's WIDTH
 */
export function packBoard(items, cols) {
  const n = Math.max(1, cols)
  const colW = (1 - GAP * (n - 1)) / n
  const heights = new Array(n).fill(0)
  return items.map((it) => {
    const span = Math.max(1, Math.min(n, Math.round(it?.span) || 1))
    let start = 0
    let top = Infinity
    for (let c = 0; c + span <= n; c += 1) {
      let t = 0
      for (let k = c; k < c + span; k += 1) t = Math.max(t, heights[k])
      // A strict `<` is what makes leftmost win a tie, which keeps the board
      // reading left to right instead of drifting.
      if (t < top - 1e-9) { top = t; start = c }
    }
    if (!Number.isFinite(top)) top = 0
    const a = Number.isFinite(it?.aspect) && it.aspect > 0 ? it.aspect : 1
    const w = span * colW + GAP * (span - 1)
    const h = w / a
    const x = start * (colW + GAP)
    for (let k = start; k < start + span; k += 1) heights[k] = top + h + GAP
    return { x, y: top, w, h }
  })
}

/**
 * Where a photo being dragged would be dropped, as an index into the list of
 * the OTHER photos.
 *
 * Nearest centre, then before or after it depending on which side of that
 * centre the pointer is. Predictable is the whole requirement here: a drop
 * target you cannot guess is a board you rearrange by trial and error.
 *
 * THERE IS A DEAD BAND AROUND EVERY CENTRE (2 Sep 2026).
 *
 * Ethan: "sometimes when dragging them around they wouldn't really fit well,
 * and all the other ones were moving around - it just wasn't the best
 * experience."
 *
 * That is not the drag maths, it is the ABSENCE of hysteresis. A bare
 * before/after test flips the instant the pointer crosses a tile's centre line,
 * so a finger resting within a pixel of one - which is exactly where it rests,
 * because that is where the tile you are aiming at is - flips the answer back
 * and forth every frame, and every flip re-packs the entire board. The band is
 * a tenth of the tile's width: inside it the previous answer stands, so the
 * board only re-flows when you have genuinely committed to a side.
 *
 * @param boxes the other tiles' packed rects, in order
 * @param prev  the index this drag last settled on, held inside the band
 */
export function dropIndex(boxes, px, py, prev = null) {
  let hit = -1
  let best = Infinity
  for (let i = 0; i < boxes.length; i += 1) {
    const b = boxes[i]
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    const d = Math.hypot(px - cx, py - cy)
    if (d < best) { best = d; hit = i }
  }
  if (hit < 0) return 0
  const b = boxes[hit]
  const cx = b.x + b.w / 2
  const band = b.w * 0.1
  if (px < cx - band) return hit
  if (px > cx + band) return hit + 1
  return prev == null ? (px < cx ? hit : hit + 1) : prev
}

// THE MOST PHOTOS ANYBODY CAN PUT ON A BOARD. Lived in TravelGallery until the
// uploader moved in here.
export const MAX_PHOTOS = 10

/** Width / height of an image blob, or null, so the board can lay a photo out
 *  in the shape it was taken. Measured from the COMPRESSED blob: compressImage
 *  caps the long edge, so the two can differ by a rounding, and the number that
 *  matters is the one describing the file that actually got stored. */
async function imageAspect(blob) {
  try {
    const bmp = await createImageBitmap(blob)
    const a = bmp.width && bmp.height ? bmp.width / bmp.height : null
    bmp.close?.()
    return a
  } catch {
    return null
  }
}

export default function PhotoBoard({ creatorId, editable = false, alwaysArranging = false, onCount }) {
  const tr = useT()
  const [photos, setPhotos] = useState(null)
  const [arrangingSelf, setArranging] = useState(false)
  const [cropping, setCropping] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [aspects, setAspects] = useState({})
  const [broken, setBroken] = useState({})
  const [width, setWidth] = useState(0)
  const boardRef = useRef(null)

  const arranging = editable && (alwaysArranging || arrangingSelf)

  const load = useCallback(async () => {
    const { data } = await supabase.from('creator_photos').select('*')
      .eq('creator_id', creatorId).order('sort_order')
    setPhotos(data ?? [])
    // The count is reported from the DRAWABLE tiles, not from the row count -
    // see the effect below.
  }, [creatorId])
  useEffect(() => { load() }, [load])

  // ADDING OR DELETING A PHOTO UPDATES THE BOARD IMMEDIATELY.
  //
  // The uploader (TravelGallery) and the board are siblings that both read
  // `creator_photos`, and neither knew about the other - so uploading a photo
  // left the board a photo short until the next full page load, and deleting
  // one left a tile pointing at a row that was gone. Ethan noticed both.
  // A tiny module-level event is the honest fix here: they are peers, not
  // parent and child, and threading a callback through Edit profile to join
  // them would put this plumbing in a page that has no interest in it.
  useEffect(() => onPhotosChanged((id) => { if (id === creatorId) load() }), [creatorId, load])

  // MEASURING THE BOARD, AND WHY ONE MEASUREMENT IS NOT ENOUGH.
  //
  // Every tile is positioned in FRACTIONS of the board's width, so a width of
  // zero draws eight 0x0 tiles - the board is there, the rows are loaded, and
  // the screen is blank. It has to be right, and it has to become right on its
  // own from any starting point.
  //
  // The single mount-time measurement it replaces was measuring the wrong thing
  // more often than it looks: EditProfile mounts ALL FOUR of its panels and
  // hides three of them with `hidden` (deliberately - see the note there about
  // unmounted fields posting stale values), so a board reached by pressing the
  // Photos tab has already run its effect at clientWidth 0. It recovered
  // because the ResizeObserver fires when an element stops being
  // `display: none`, which makes the whole thing depend on one browser
  // behaviour with no fallback - and there are environments where RO does not
  // deliver at all.
  //
  // So: the observer for live resizes, a window listener as a backstop, and a
  // LAYOUT EFFECT ON EVERY RENDER that reconciles the two. The layout effect
  // only calls setState when the number actually differs, so it converges in
  // one extra render and never loops.
  const measure = useCallback(() => {
    const el = boardRef.current
    if (el) setWidth((cur) => (el.clientWidth && el.clientWidth !== cur ? el.clientWidth : cur))
  }, [])

  useLayoutEffect(measure)

  useEffect(() => {
    const el = boardRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [photos, measure])

  // Measure each photo once, and write back what the database is missing.
  // `new Image()` rather than an onLoad on the rendered tile: the layout needs
  // the aspect BEFORE it can place anything, and an onLoad fires after the
  // browser has already laid the wrong shape out once.
  useEffect(() => {
    if (!photos?.length) return undefined
    let alive = true
    const missing = photos.filter((p) => !p.aspect && !aspects[p.id])
    if (!missing.length) return undefined
    for (const p of missing) {
      const img = new Image()
      img.onload = () => {
        if (!alive || !img.naturalWidth || !img.naturalHeight) return
        const a = img.naturalWidth / img.naturalHeight
        setAspects((cur) => (cur[p.id] ? cur : { ...cur, [p.id]: a }))
        if (editable) supabase.from('creator_photos').update({ aspect: a }).eq('id', p.id).then(() => {})
      }
      // The same probe that measures also reports a file that is gone, so a
      // missing photo is known before it can paint a broken-image icon.
      img.onerror = () => { if (alive) setBroken((cur) => ({ ...cur, [p.id]: true })) }
      img.src = p.photo_url
    }
    return () => { alive = false }
  }, [photos, aspects, editable])

  // A FILE CAN GO MISSING AFTER ITS ASPECT WAS MEASURED, and that is the
  // common case rather than the rare one.
  //
  // THE BUG THIS FIXES. The probe above is the only thing that ever set
  // `broken`, and it only runs for a photo whose aspect is still UNKNOWN. Every
  // one of one creator's ten photos had been measured back when the files
  // existed, so none of them was ever probed again, `broken` stayed empty, and
  // the board rendered ten <img> tags at dead URLs - ten grey boxes with the
  // browser's broken-image glyph and the word "Travel photo". Ethan: "the
  // travel photo section on mobile seems to not be working at all, I'll just
  // check for Jacob's and it's not working." It looks the same at every width;
  // the files are gone from storage and nothing had noticed.
  //
  // The rendered tile reports its own failure now, which catches every case the
  // probe cannot: a file deleted after upload, a bucket permission change, a
  // URL that was rewritten. Costs nothing until something actually fails.
  const markBroken = useCallback((id) => {
    setBroken((cur) => (cur[id] ? cur : { ...cur, [id]: true }))
  }, [])

  const cols = colsFor(width)
  // WHICH OF THE TWO ARRANGEMENTS THIS WIDTH IS LOOKING AT (migration 164).
  // Everything below - the running order, the size ladder, and what a drag or a
  // size press writes back - is scoped to it, so tidying the board on a phone
  // cannot touch the desktop collage and vice versa.
  const variant = variantFor(width)
  const sizeKey = SIZE_KEY[variant]

  // WHAT IS IN THE HAND, IF ANYTHING.
  //  { id, order?, pointer? }
  // `order` is the PREVIEW: the layout memo below packs it instead of the
  // committed order, so the board shows the result of the drag while it is
  // still happening. Declared up here because the layout reads it.
  const [drag, setDrag] = useState(null)
  const dragState = useRef(null)
  const detach = useRef(null)
  const commitRef = useRef(null)

  // THE BOARD'S ORDER. `sort_order` is the running order; the packer turns it
  // into coordinates. A drag rewrites this list and nothing else.
  const ordered = useMemo(() => {
    const rows = (photos ?? []).filter((p) => editable || !broken[p.id])
    return [...rows].sort((a, b) => orderOf(a, variant) - orderOf(b, variant)
      || String(a.id).localeCompare(String(b.id)))
  }, [photos, broken, editable, variant])

  // ONE LAYOUT, OVER EVERY PHOTO, EVERY RENDER.
  //
  // The placed/unplaced split that used to live here is the rejumble - see the
  // note at the top of this file. There is no split any more: a photo that has
  // never been arranged is a photo with a span of 1, in its upload position, in
  // the same packer as everything else.
  //
  // While a drag is in flight the list is the PREVIEW list (the dragged photo
  // moved to where it would land, or resized), so the other tiles show you the
  // result before you commit to it.
  const layout = useMemo(() => {
    const items = ordered.map((p) => ({
      aspect: p.aspect || aspects[p.id] || 1,
      span: spanOf(p, cols, variant),
    }))
    let list = ordered
    let sizes = items
    if (drag?.order) {
      const index = new Map(ordered.map((p, i) => [p.id, i]))
      list = drag.order
      sizes = drag.order.map((p) => items[index.get(p.id)])
    }
    const boxes = packBoard(sizes, cols)
    const byId = new Map(list.map((p, i) => [p.id, boxes[i]]))
    return { byId, order: list }
  }, [ordered, aspects, cols, variant, drag])

  const tiles = useMemo(() => ordered.map((p) => ({
    ...p,
    ...(layout.byId.get(p.id) || { x: 0, y: 0, w: 0.3, h: 0.3 }),
    aspect: p.aspect || aspects[p.id] || 1,
    missing: !!broken[p.id],
  })), [ordered, layout, aspects, broken])

  // THE BOARD IS AS TALL AS ITS CONTENTS. Derived every render rather than
  // stored, so the page grows with the collage instead of clipping it.
  const bottom = tiles.reduce((m, t) => Math.max(m, t.y + t.h), 0)
  const boardHeight = width ? Math.max(width * 0.4, width * bottom + 8) : 320

  // THE COUNT THE SECTION HEADER USES IS WHAT IS ACTUALLY DRAWABLE.
  //
  // It used to be the row count, which is how a creator whose ten files had
  // gone from storage got a "Travel photos" heading over ten dead tiles. A
  // visitor sees none of them, so for a visitor this reports zero and the
  // section says nobody has added any - which is the honest thing to say about
  // photographs that no longer exist. The owner still sees the rows, marked, so
  // they can clear them out.
  // Not before the rows are in: `tiles` is empty while `photos` is still null,
  // and reporting that zero would flash "no photos yet" on every load.
  useEffect(() => { if (photos !== null) onCount?.(tiles.length) }, [photos, tiles.length, onCount])

  // ------------------------------------------------------------------ drag
  //
  // ONE GESTURE. A press on the tile MOVES it, which on a packed board means
  // REORDERING it: the drag rewrites the preview order and the packer does the
  // rest. Nothing here positions anything itself, which is why a drag cannot
  // produce an overlap. Size is a button and writes one column (see the size
  // cycle below).

  // WRITING THE WHOLE BOARD, NOT ONE TILE.
  //
  // A packed layout means moving one photo moves others, so a commit is every
  // row whose coordinates or order actually changed. Rows that did not change
  // are not written: a board of thirty photographs should not issue thirty
  // updates because one moved to the end of a row.
  //
  // A REJECTED SAVE HAS TO SAY SO. This used to throw the result away, and that
  // silence is why the board looked like a usability problem for three
  // rewrites: a CHECK constraint left over from the 12-column grid rejected
  // every per-mille write Postgres was ever offered, so a creator dragged a
  // photo, watched it move, and found it back where it started on the next
  // load with nothing anywhere saying so. Migration 151 fixed the constraint;
  // this makes the next such fault visible in seconds rather than in weeks.
  const commit = useCallback(async (order) => {
    const items = order.map((p) => ({
      aspect: p.aspect || aspects[p.id] || 1,
      span: spanOf(p, cols, variant),
    }))
    const boxes = packBoard(items, cols)
    const before = photos
    const patches = []
    order.forEach((p, i) => {
      const b = boxes[i]
      // A DESKTOP COMMIT STILL WRITES THE per-mille BOX; A PHONE ONE DOES NOT.
      // `pos_*` is the legacy read path and there is exactly one set of it, so
      // writing it from a phone is how the phone's arrangement used to leak
      // into the desktop's. The phone writes its own running order and nothing
      // else (migration 164).
      const next = variant === 'mobile'
        ? { sort_order_mobile: i }
        : {
          sort_order: i,
          pos_x: toMille(b.x), pos_y: toMille(b.y),
          pos_w: toMille(b.w), pos_h: toMille(b.h),
        }
      const changed = Object.entries(next).some(([k, v]) => v !== (p[k] ?? null))
      if (changed) patches.push({ id: p.id, next })
    })
    if (!patches.length) return
    const byId = new Map(patches.map((x) => [x.id, x.next]))
    setPhotos((cur) => (cur || []).map((p) => (byId.has(p.id) ? { ...p, ...byId.get(p.id) } : p)))
    const results = await Promise.all(patches.map(({ id, next }) =>
      supabase.from('creator_photos').update(next).eq('id', id)))
    const failed = results.find((r) => r.error)
    if (!failed) return
    setPhotos(before)
    await notice(`The board could not be saved: ${failed.error.message}`)
  }, [photos, aspects, cols, variant])
  useEffect(() => { commitRef.current = commit }, [commit])
  useEffect(() => () => detach.current?.(), [])

  // ONE GESTURE: A DRAG MOVES A PHOTO. Size is a button now (see PhotoTile),
  // so there is no longer a second thing a press can mean depending on which
  // 36 pixels of the tile it landed on - which was unreadable on a touch
  // screen, where nothing hovers to show you the corner is live.
  function beginDrag(e, tile) {
    if (!arranging || !width) return
    e.preventDefault()
    e.stopPropagation()
    dragState.current = {
      id: tile.id,
      startX: e.clientX, startY: e.clientY,
      // Where inside the tile the finger landed, so a moved tile does not jump
      // its own top-left corner under the pointer.
      grabX: (e.clientX - (boardRef.current?.getBoundingClientRect().left ?? 0)) / width - tile.x,
      grabY: (e.clientY - (boardRef.current?.getBoundingClientRect().top ?? 0)) / width - tile.y,
      order: layout.order,
      at: null,
      moved: false,
    }
    setDrag({ id: tile.id, order: layout.order, pointer: { x: tile.x, y: tile.y } })

    const move = (ev) => {
      const d = dragState.current
      if (!d) return
      const rect = boardRef.current?.getBoundingClientRect()
      if (!rect) return
      const px = (ev.clientX - rect.left) / width
      const py = (ev.clientY - rect.top) / width
      if (!d.moved && Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 4) return
      d.moved = true

      // MOVE = REORDER. The dragged tile is lifted out of the list, the drop
      // index is read off where the finger is, and it goes back in there. The
      // packer then lays everything out, so the other tiles slide to show you
      // the answer before you let go.
      const others = d.order.filter((p) => p.id !== d.id)
      const items = others.map((p) => ({
        aspect: p.aspect || aspects[p.id] || 1,
        span: spanOf(p, cols, variant),
      }))
      const boxes = packBoard(items, cols)
      // `d.at` is the index this drag last settled on. Passing it back in is
      // what gives dropIndex its dead band - without it the board re-packs on
      // every frame the finger hovers near a tile's centre line.
      const at = dropIndex(boxes, px, py, d.at)
      d.at = at
      const me = d.order.find((p) => p.id === d.id)
      const next = [...others.slice(0, at), me, ...others.slice(at)]
      const same = next.length === d.order.length && next.every((p, i) => p.id === d.order[i].id)
      if (!same) d.order = next
      setDrag((cur) => (cur ? {
        ...cur,
        order: d.order,
        // The tile under the finger is drawn free, at the pointer, so the hand
        // never lags the drag. Everything else is packed.
        pointer: { x: px - d.grabX, y: py - d.grabY },
      } : cur))
    }

    const up = () => {
      const d = dragState.current
      detach.current?.()
      dragState.current = null
      setDrag(null)
      if (!d || !d.moved) return
      commitRef.current?.(d.order)
    }

    // Attached HERE, not in an effect keyed on `drag`: an effect's listeners
    // are not live until React commits, so the first move and sometimes the
    // pointerup are simply lost. Same race as the boarding-pass camera.
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
    detach.current = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      detach.current = null
    }
  }

  // EVERY PHOTO BACK TO THE CLEAN COLLAGE, in one write.
  //
  // "Tidy them up" clears the four position columns, which sets every span back
  // to one and drops the whole board through the packer in upload order - side
  // by side and below, each at its own shape, nothing overlapping. That is the
  // same layout a brand new board has, which is the point: Ethan asked that the
  // board "should always start, whenever they upload, just as tidy them up",
  // and the only way to guarantee that is for the two to be the same code path.
  //
  // Optimistic, then written; a failure says so and puts the board back rather
  // than leaving the screen disagreeing with the table.
  // ADDING PHOTOS HAPPENS ON THE BOARD (1 Sep 2026).
  //
  // Ethan: "i think rather than seperating the upload section and the board
  // section they should be integrated so you upload them and rather than having
  // to press x there, there should be a button to x it on the actual board."
  //
  // It was two cards: a film strip of 104px squares with the add / caption /
  // delete controls, and the board underneath it with the arrangement. Two
  // grids of the same ten photographs, and the one you captioned was never the
  // one you were looking at. The board is the only surface now - it already
  // knows every row, it already writes to the same table, and it is the thing
  // the caption and the size are ABOUT.
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  // How many of this batch have landed, so the button can count rather than
  // spin. See addFiles.
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  // ADDING PHOTOS: THREE AT A TIME, AND EACH ONE APPEARS AS IT LANDS.
  //
  // Ethan, on the onboarding flow: "I added photos, but it takes so so long to
  // load. It just shows adding and loading for ages. And they haven't actually
  // added."
  //
  // Both halves of that were one loop. It was `for (const file of files)` with
  // an await on every step, so six photographs meant six full round trips end
  // to end - decode, downscale, re-encode, base64, upload, measure, insert -
  // and NOTHING was drawn until the last one finished, because `load()` was
  // called once after the loop. On a phone picking six camera photos that is
  // the better part of a minute of a button reading "Adding…" over an empty
  // board, which is indistinguishable from a broken uploader. It is why he
  // concluded they had not been added: on that evidence, they had not.
  //
  // THREE CHANGES, AND THE THIRD IS THE ONE THAT MATTERS MOST.
  //
  //  1  A POOL OF THREE. This work is network-bound (the edge function does the
  //     writing), so running three at once is close to three times faster. Not
  //     unbounded: ten simultaneous canvas re-encodes on a phone is how you
  //     stall the main thread and drop the whole UI, and the browser would
  //     queue the requests anyway.
  //  2  EACH ONE IS DRAWN THE MOMENT ITS ROW EXISTS. `load()` after every
  //     insert rather than once at the end, so the board fills in front of you.
  //     A photo you can see is proof; a spinner is a promise.
  //  3  THE BUTTON COUNTS. "Adding 2 of 6" is the difference between a slow
  //     operation and a stuck one, and it is the whole of what made this feel
  //     broken rather than merely slow.
  //
  // FAILURES ARE NAMED AND THEY DO NOT STOP THE BATCH. One unreadable photo out
  // of six used to leave a bare message with no clue which; every other photo
  // still goes up, and the message says how many did not and why.
  const UPLOAD_CONCURRENCY = 3

  async function addFiles(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const have = (photos || []).length
    if (have + files.length > MAX_PHOTOS) {
      setUploadError(`You can share up to ${MAX_PHOTOS} photos. Remove some first.`)
      return
    }
    setUploadError('')
    setUploading(true)
    setProgress({ done: 0, total: files.length })

    // The slot each file will take on the board is decided HERE, before any of
    // them start, so three uploads finishing out of order cannot collide on a
    // `sort_order` or shuffle the board against the order they were picked in.
    const jobs = files.map((file, i) => ({ file, order: have + i }))
    const failures = []

    async function one({ file, order }) {
      const looksImage = file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name)
      if (!looksImage || file.size > 15 * 1024 * 1024) {
        failures.push(`${file.name || 'A photo'}: must be an image under 15MB`)
        return
      }
      let compressed
      try {
        // A travel tile is at most ~600 CSS px wide, so 1200 keeps the retina
        // headroom, and WebP at 0.8 is visually cleaner than the JPEG it
        // replaces while landing about a third smaller. Ten photos a creator on
        // a free 1GB tier is why this matters.
        compressed = await compressImage(file, { maxDim: 1200, quality: 0.8 })
      } catch (err) { failures.push(`${file.name || 'A photo'}: ${err.message}`); return }
      const ext = (compressed.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
      // `order` rather than an index into the batch, and the random suffix
      // because three uploads starting inside the same millisecond used to be
      // able to agree on a filename.
      const path = `${creatorId}/${Date.now()}-${order}-${Math.random().toString(36).slice(2, 7)}.${ext}`
      let url
      try {
        url = await uploadFile('gallery', path, compressed, compressed.type || 'image/jpeg')
      } catch (err) { failures.push(`${file.name || 'A photo'}: ${err.message}`); return }
      const aspect = await imageAspect(compressed)
      // EVERY PHOTO STARTS SMALL. Ethan: "every photo should start at the small
      // size then one click makes it the middle size, and another the big
      // size." The column defaults to it; stating it here means a change to the
      // default cannot silently change what a new upload looks like.
      // EVERY NEW PHOTO GOES TO THE END OF BOTH BOARDS. Leaving
      // `sort_order_mobile` null would have put it wherever its desktop order
      // happens to land in the phone's arrangement, which for a creator who has
      // arranged their phone board is the middle of it.
      const { error } = await supabase.from('creator_photos').insert({
        creator_id: creatorId,
        photo_url: url,
        sort_order: order,
        sort_order_mobile: order,
        aspect,
        size: 'small',
        size_mobile: 'small',
      })
      if (error) { failures.push(`${file.name || 'A photo'}: ${error.message}`); return }
      // IT IS ON THE BOARD NOW, not when the batch is over.
      await load()
    }

    // A fixed pool of workers pulling off one shared queue: three in flight,
    // and the moment one finishes it takes the next file rather than waiting
    // for the other two. Batching in threes would idle two workers on every
    // slow photo.
    let next = 0
    async function worker() {
      for (;;) {
        const i = next
        next += 1
        if (i >= jobs.length) return
        await one(jobs[i])
        setProgress((pr) => ({ ...pr, done: pr.done + 1 }))
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, jobs.length) }, worker),
    )

    setUploading(false)
    setProgress({ done: 0, total: 0 })
    if (failures.length) {
      setUploadError(
        failures.length === files.length
          ? `Nothing could be added. ${failures[0]}`
          : `${failures.length} of ${files.length} could not be added. ${failures[0]}`,
      )
    }
    await load()
    photosChanged(creatorId)
  }

  // TIDYING IT UP HAS TO RESET THE SIZES, OR IT DOES NOTHING VISIBLE.
  //
  // It used to clear the four `pos_*` columns only - which was the whole layout
  // back when the board rendered from stored coordinates, and has been dead
  // since the packer took over: the drawn span comes from `size` now, so a
  // board of large photographs was "tidied" into exactly the board of large
  // photographs it already was. It resets this variant's ladder to small and
  // renumbers it by UPLOAD ORDER (`created_at`), which is what the button has
  // always claimed to do and is the same layout a fresh board has.
  //
  // IT ONLY TOUCHES THE VARIANT YOU ARE LOOKING AT. Tidying on a phone leaves
  // the desktop collage exactly where it was (migration 164).
  const [resetting, setResetting] = useState(false)
  async function resetAll() {
    if (resetting) return
    setResetting(true)
    const before = photos
    const byUpload = [...(photos || [])].sort((a, b) =>
      String(a.created_at || '').localeCompare(String(b.created_at || ''))
      || String(a.id).localeCompare(String(b.id)))
    // TIDYING PUTS EVERYTHING AT THE MIDDLE SIZE, NOT THE SMALLEST
    // (4 Sep 2026). Ethan: "the tidy them up button shouldn't necessarily put
    // them all in the smallest size, the middle size makes more sense."
    //
    // He is right, and the reason is what the button is FOR. "Tidy" means "put
    // this board back into a good default", and the smallest size is not a
    // default, it is one end of the ladder - a wall of tiny thumbnails is not
    // what anybody would arrange by hand. `medium` is the size a photograph is
    // actually worth looking at on this board, and it is still one press from
    // either of the others.
    //
    // NOTE the asymmetry with a NEW upload, which stays 'small' on purpose: a
    // photo arriving should not shove the board about, and a tidy is explicitly
    // a request to re-lay it out.
    const TIDY_SIZE = 'medium'
    const patch = (i) => (variant === 'mobile'
      ? { sort_order_mobile: i, size_mobile: TIDY_SIZE }
      : { sort_order: i, size: TIDY_SIZE, pos_x: null, pos_y: null, pos_w: null, pos_h: null })
    const byId = new Map(byUpload.map((p, i) => [p.id, patch(i)]))
    setPhotos((cur) => (cur || []).map((p) => ({ ...p, ...(byId.get(p.id) || {}) })))
    const results = await Promise.all(byUpload.map((p, i) =>
      supabase.from('creator_photos').update(patch(i)).eq('id', p.id)))
    setResetting(false)
    const failed = results.find((r) => r.error)
    if (failed) {
      setPhotos(before)
      await notice(`The board could not be tidied: ${failed.error.message}`)
    }
  }

  // ONE PRESS, ONE STEP UP THE LADDER, WRAPPING AT THE TOP.
  //
  // Optimistic and then written, like every other change on this board: the
  // tile has to answer the press immediately or the button reads as dead, and
  // the packer re-flows everything around it in the same frame. The write also
  // re-commits the whole board, because a wider photo moves its neighbours and
  // `pos_*` is what the profile renders from - leaving those stale would make
  // the profile and the editor disagree until the next drag.
  async function cycleSize(photo) {
    const size = nextSize(sizeOf(photo, variant))
    const before = photos
    const after = (photos || []).map((p) => (p.id === photo.id ? { ...p, [sizeKey]: size } : p))
    setPhotos(after)
    const { error } = await supabase.from('creator_photos').update({ [sizeKey]: size }).eq('id', photo.id)
    if (error) {
      setPhotos(before)
      await notice(`That size could not be saved: ${error.message}`)
      return
    }
    // Re-pack from the list we just set, in the same order the board is in.
    const order = [...after].sort((a, b) => orderOf(a, variant) - orderOf(b, variant)
      || String(a.id).localeCompare(String(b.id)))
    commitRef.current?.(order)
  }

  // REMOVING A PHOTO ASKS FIRST, AND IT ASKS ON THE BOARD.
  //
  // Ethan: "there should be a button to x it on the actual board, pressing this
  // should show a popup asking if you're sure you want to remove this photo, to
  // stop any accidental deletions."
  //
  // `confirm` here is the app's own dialog from lib/confirm - NOT the browser
  // global. A missing import silently falls through to `window.confirm`, which
  // Chrome can suppress permanently, and the button then does nothing for ever
  // with no error anywhere. That has bitten this codebase before.
  //
  // The storage object goes too, or a deleted photo keeps eating the free
  // tier's gigabyte for ever. RLS only lets somebody delete inside their own
  // folder, so a failure here is not worth blocking the row delete over.
  async function removePhoto(photo) {
    const ok = await confirm(
      'It comes off your board and is deleted from your gallery. This cannot be undone.',
      { title: 'Remove this photo?', confirmLabel: 'Remove it', danger: true },
    )
    if (!ok) return
    const before = photos
    setPhotos((cur) => (cur || []).filter((p) => p.id !== photo.id))
    const { error } = await supabase.from('creator_photos').delete().eq('id', photo.id)
    if (error) {
      setPhotos(before)
      await notice(`That photo could not be removed: ${error.message}`)
      return
    }
    const key = photo.photo_url?.split('/gallery/')[1]
    if (key) await supabase.storage.from('gallery').remove([decodeURIComponent(key)])
    photosChanged(creatorId)
  }

  async function saveCaption(photo, caption) {
    if ((caption || '') === (photo.caption || '')) return
    setPhotos((cur) => (cur || []).map((p) => (p.id === photo.id ? { ...p, caption } : p)))
    const { error } = await supabase.from('creator_photos').update({ caption }).eq('id', photo.id)
    if (error) await notice(`That caption could not be saved: ${error.message}`)
  }

  async function saveCrop(photo, focal, zoom) {
    setPhotos((cur) => (cur || []).map((p) => (
      p.id === photo.id ? { ...p, focal_x: focal.x, focal_y: focal.y, zoom } : p)))
    setCropping(null)
    await supabase.from('creator_photos')
      .update({ focal_x: focal.x, focal_y: focal.y, zoom }).eq('id', photo.id)
  }

  if (photos === null) return <div className="h-64 w-full animate-pulse rounded-card bg-cloud" />
  // A VISITOR'S EMPTY BOARD IS NOTHING; THE OWNER'S IS THE ADD BUTTON.
  // It used to be nothing either way, which was correct while the uploader was
  // a separate card above it and is a dead end now that it is not.
  if (!photos.length && !editable) return null

  return (
    <>
      {editable && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/* ADD, FIRST AND IN THE BRAND. It is the only thing to do on an
              empty board and the most common thing to do on a full one. */}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={addFiles} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || photos.length >= MAX_PHOTOS}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-card transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {uploading ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />}
            {/* IT COUNTS. "Adding…" for forty seconds is a stuck button; "Adding
                2 of 6" is a slow one, and only one of those makes somebody wait
                rather than reload the page. */}
            {uploading
              ? (progress.total > 1 ? `Adding ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : tr('Adding…'))
              : tr('Add photos')}
          </button>
          <span className="text-xs tabular-nums text-smoke">{photos.length} / {MAX_PHOTOS}</span>
          {!alwaysArranging && (
            <button
              type="button"
              onClick={() => setArranging((v) => !v)}
              className={cx('inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200',
                arranging ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hover:text-ink')}
            >
              <Icon name={arranging ? 'check' : 'pencil'} className="h-3.5 w-3.5" />
              {arranging ? 'Done' : 'Arrange the board'}
            </button>
          )}
          {/* A WAY BACK. Any arrangement tool needs one, and this one needed it
              badly: there was no undo, no reset, and a board you have shuffled
              into a mess is a board you cannot recover without dragging every
              photograph back by hand. Ethan: "there should be a button at the
              top to reset all the photos back to how they originally were, the
              original way should just arrange the photos nicely, side by side
              and below each other, none of them getting covered."
              Clearing every position is exactly that: the automatic layout is a
              masonry packer, so nothing overlaps by construction. */}
          {arranging && (
            <button
              type="button"
              onClick={resetAll}
              disabled={resetting}
              className="inline-flex items-center gap-1.5 rounded-full bg-cloud px-3.5 py-1.5 text-xs font-semibold text-smoke transition-all duration-200 hover:text-ink disabled:opacity-50"
            >
              <Icon name="reorder" className="h-3.5 w-3.5" />
              {resetting ? 'Tidying…' : 'Tidy them up'}
            </button>
          )}
        </div>
      )}

      {uploadError && <p className="mb-3 text-xs text-red-600">{uploadError}</p>}

      {editable && photos.length === 0 ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-gray-200 px-6 py-12 text-center transition-colors duration-200 hover:border-brand/40 hover:bg-brand-tint/20"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-tint text-brand">
            <Icon name="image" className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold">{tr('Add your first travel photo')}</span>
          <span className="max-w-xs text-xs text-smoke">
            {tr('Up to {n} photos. Drag them into any order, press the corner button to make one bigger, and type the caption straight onto it.', { n: MAX_PHOTOS })}
          </span>
        </button>
      ) : (
      <div
        ref={boardRef}
        style={{
          position: 'relative',
          height: boardHeight,
          // `touch-action: none` only while arranging, or the browser claims
          // the first pixel of a drag as a page scroll and the tile never moves.
          touchAction: arranging ? 'none' : undefined,
        }}
        className={cx('w-full', arranging && 'rounded-card ring-1 ring-inset ring-brand/20')}
      >
        {tiles.map((t) => {
          // The tile in the hand is drawn at the POINTER, at its packed size,
          // so it follows the finger exactly while everything else slides into
          // the arrangement it is about to join.
          const held = drag?.id === t.id && drag.pointer
          const live = held ? { ...t, x: drag.pointer.x, y: drag.pointer.y } : t
          return (
            <PhotoTile
              key={t.id}
              photo={t}
              box={live}
              width={width}
              arranging={arranging}
              editable={editable}
              dragging={drag?.id === t.id}
              onOpen={() => !arranging && setLightbox(t)}
              onCrop={() => setCropping(t)}
              onBroken={() => markBroken(t.id)}
              onDragStart={beginDrag}
              size={sizeOf(t, variant)}
              onResize={() => cycleSize(t)}
              onRemove={() => removePhoto(t)}
              onCaption={(text) => saveCaption(t, text)}
            />
          )
        })}
      </div>
      )}

      {cropping && (
        <CropDialog photo={cropping} onCancel={() => setCropping(null)}
          onSave={(focal, zoom) => saveCrop(cropping, focal, zoom)} />
      )}
      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </>
  )
}

// ---------------------------------------------------------------- one photo
function PhotoTile({ photo, box, width, size = 'small', arranging, editable, dragging, onOpen, onCrop, onBroken, onDragStart, onResize, onRemove, onCaption }) {
  const tr = useT()
  return (
    <figure
      data-tile
      style={{
        // A TILE MOVES ON ITS TRANSFORM, NOT ON `left` AND `top` (2 Sep 2026).
        //
        // Ethan: "make it even smoother and animate even better, not so jumbly
        // and snappy."
        //
        // Animating `left`/`top` is animating LAYOUT: every frame of every
        // tile's 200ms ease re-runs layout and paint for the whole board, and
        // with ten tiles re-flowing at once - which is exactly what a reorder
        // does - the phone drops frames and the result reads as the tiles
        // jumping rather than sliding. A transform is composited: it never
        // touches layout, so ten of them move on the GPU at once.
        // (This is the same lesson the chat room header paid for.)
        position: 'absolute',
        left: 0,
        top: 0,
        width: box.w * width,
        height: box.h * width,
        // Picking a photo up brings it to the front, which is what a pile of
        // prints does, and lifts it slightly off the board so the tile in the
        // hand is visibly the one in the hand.
        transform: `translate3d(${box.x * width}px, ${box.y * width}px, 0)${dragging ? ' scale(1.04)' : ''}`,
        zIndex: dragging ? 30 : 1,
      }}
      className={cx(
        'group overflow-hidden rounded-xl bg-cloud',
        dragging ? 'shadow-lift ring-2 ring-brand' : 'shadow-card',
        // THE OTHER TILES GLIDE; THE ONE IN YOUR HAND DOES NOT.
        //
        // This is the difference between "shuffliness" and a board that reads
        // as a board. Every tile except the one being dragged eases to its new
        // packed position over 200ms, so a reorder is something you WATCH
        // happen rather than a set of photographs that were somewhere else the
        // last time you blinked. The dragged tile has no transition at all,
        // because a 200ms ease on `left` means the tile lags the finger - which
        // reads as the board being slow, and is the other half of what Ethan
        // called jittery.
        // ONLY THE TRANSFORM MOVES. 240ms on the same spring-ish curve the rest
        // of the app settles on - long enough to read as a movement, short
        // enough not to lag a second drag. The held tile has NO transition at
        // all, because any easing on its transform means the tile trails the
        // finger.
        //
        // WIDTH AND HEIGHT ARE NOT TRANSITIONED. Animating a box's SIZE is
        // animating LAYOUT - the whole reason the position moved to a transform
        // (see the style above) - so leaving the size in the list would have
        // kept the expensive half of exactly what was being removed. A tile
        // that changes span resizes at once and glides to its new place, which
        // is the part the eye actually follows.
        //
        // (While verifying this, both `width` and `transform` read as stuck at
        // their start values in a browser pane that was HIDDEN. That is the
        // pane, not the board: CSS transitions advance on the same clock rAF
        // does, and this repository has paid for that three times already. A
        // screenshot forces a paint and everything lands where the packer put
        // it. Do not "fix" a frozen animation measured in a hidden pane.)
        dragging
          ? 'transition-none'
          : 'transition-[transform,box-shadow] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        arranging && 'cursor-grab touch-none active:cursor-grabbing',
      )}
      onPointerDown={(e) => arranging && onDragStart(e, photo)}
    >
      {photo.missing ? (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-cloud px-3 text-center">
          <Icon name="image" className="h-5 w-5 text-gray-300" />
          <span className="text-[11px] font-medium leading-tight text-smoke">
            {tr("This photo is no longer in storage. Remove it and upload it again.")}
          </span>
        </span>
      ) : (
        <img
          src={photo.photo_url}
          alt={photo.caption || 'Travel photo'}
          loading="lazy"
          draggable={false}
          onError={onBroken}
          className="h-full w-full select-none object-cover"
          style={{
            objectPosition: `${(photo.focal_x ?? 0.5) * 100}% ${(photo.focal_y ?? 0.5) * 100}%`,
            transform: `scale(${photo.zoom ?? 1})`,
          }}
        />
      )}

      {/* THE CAPTION IS TYPED ON THE PHOTO ITSELF (1 Sep 2026).

          Ethan: "also should have the option to type the caption directly onto
          the photo."

          It used to be a separate text input under a thumbnail in a separate
          uploader grid on a separate card, so writing a caption meant looking
          at a 104px square that was not the tile the caption would appear on.
          Now the caption IS the caption: same place, same gradient, same two
          lines, and while you are arranging it is an input sitting exactly
          where the text will be.

          It is `pointer-events-none` when it is not editable, so it has never
          been in the way of a drag, and the INPUT stops a pointerdown from
          starting one - otherwise clicking into it would pick the photo up. */}
      {editable && arranging ? (
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-2 pb-2 pt-8">
          <input
            type="text"
            defaultValue={photo.caption || ''}
            placeholder={tr('Add a caption…')}
            maxLength={140}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            onBlur={(e) => onCaption(e.target.value.trim())}
            className="w-full rounded-lg border border-white/25 bg-black/35 px-2 py-1 text-[13px] font-medium text-white placeholder:text-white/55 focus:border-white/60 focus:bg-black/55 focus:outline-none"
          />
        </div>
      ) : photo.caption ? (
        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-2.5 pt-8">
          <span className="line-clamp-2 text-[13px] font-medium leading-snug text-white">{photo.caption}</span>
        </figcaption>
      ) : null}

      {!arranging && (
        <button type="button" onClick={onOpen} className="absolute inset-0" aria-label={tr("Open photo")}>
          <span className="sr-only">{photo.caption || 'Open photo'}</span>
        </button>
      )}

      {editable && !arranging && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCrop() }}
          className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink opacity-0 shadow-card backdrop-blur transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={tr("Reframe this photo")}
        >
          <Icon name="crop" className="h-4 w-4" />
        </button>
      )}

      {editable && arranging && (
        // THE TILE'S OWN CONTROLS, ON THE TILE, WHERE THE PHOTO IS.
        //
        // Size top right (Ethan named the corner), remove top left, and both are
        // real buttons rather than hit zones - the corner-drag resize they
        // replace could not be found on a phone, because nothing hovers there to
        // reveal it.
        //
        // `stopPropagation` on pointerDown as well as click: the figure takes a
        // pointerdown to start a drag, and without this pressing either button
        // would also pick the photograph up.
        <>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="absolute left-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-red-500 shadow-card backdrop-blur transition-transform duration-150 hover:scale-110"
            aria-label={tr('Remove this photo')}
            title={tr('Remove this photo')}
          >
            <Icon name="close" className="h-4 w-4" strokeWidth={2.4} />
          </button>

          {/* WHAT SIZE IT IS AND WHAT PRESSING IT DOES, both readable without
              pressing it. Three bars, filled up to the current level, so the
              button is a state as well as a control - which is what makes a
              cycling button legible instead of a mystery you press three times
              to understand. */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onResize() }}
            className="absolute right-2 top-2 z-20 flex h-8 items-center gap-[3px] rounded-full bg-white/95 px-2.5 text-brand shadow-card backdrop-blur transition-transform duration-150 hover:scale-110"
            aria-label={tr('Change the size of this photo')}
            title={SIZE_TITLE[size] || SIZE_TITLE.small}
          >
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                aria-hidden
                className={cx(
                  'w-[3px] rounded-full transition-all duration-200',
                  n <= (SIZES.indexOf(size) + 1 || 1) ? 'bg-brand' : 'bg-brand/25',
                  n === 1 ? 'h-2' : n === 2 ? 'h-3' : 'h-4',
                )}
              />
            ))}
          </button>
        </>
      )}
    </figure>
  )
}

// ---------------------------------------------------------------- lightbox
function Lightbox({ photo, onClose }) {
  const tr = useT()
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <button
      type="button"
      onClick={onClose}
      className="animate-fade-up fixed inset-0 z-[80] flex items-center justify-center bg-ink/85 p-6 backdrop-blur-sm"
      aria-label={tr("Close photo")}
    >
      <figure className="max-h-full max-w-4xl">
        <img src={photo.photo_url} alt={photo.caption || ''} className="max-h-[80vh] w-auto rounded-card object-contain" />
        {photo.caption && <figcaption className="mt-3 text-center text-sm text-white/90">{photo.caption}</figcaption>}
      </figure>
    </button>
  )
}

// ------------------------------------------------------------------- crop
//
// THE CROP IS A FOCAL POINT AND A ZOOM, NOT A RECTANGLE (migration 108).
// `object-cover` crops from the CENTRE, so a face or a horizon gets sliced off;
// moving where the crop is taken from fixes exactly that, and it costs two
// numbers, no canvas re-encode and no second copy in storage. It matters more
// now than it did, because a freely resized tile can be any shape at all.
function CropDialog({ photo, onCancel, onSave }) {
  const tr = useT()
  const [focal, setFocal] = useState({ x: photo.focal_x ?? 0.5, y: photo.focal_y ?? 0.5 })
  const [zoom, setZoom] = useState(photo.zoom ?? 1)
  const boxRef = useRef(null)
  const dragging = useRef(false)

  const place = useCallback((e) => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setFocal({
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    })
  }, [])

  useEffect(() => {
    const move = (e) => { if (dragging.current) place(e) }
    const up = () => { dragging.current = false }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
    }
  }, [place])

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-card bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <h3 className="text-sm font-semibold">{tr("Reframe this photo")}</h3>
          <button onClick={onCancel} aria-label={tr("Close")}
            className="rounded-full p-1.5 text-smoke transition-colors hover:bg-cloud hover:text-ink">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          <p className="mb-3 text-xs text-smoke">{tr("Drag to choose what stays in the middle when the photo is cropped.")}</p>
          <div
            ref={boxRef}
            onPointerDown={(e) => { dragging.current = true; place(e) }}
            className="relative aspect-[4/3] w-full cursor-crosshair touch-none overflow-hidden rounded-xl bg-cloud"
          >
            <img src={photo.photo_url} alt="" draggable={false}
              className="h-full w-full select-none object-cover"
              style={{ objectPosition: `${focal.x * 100}% ${focal.y * 100}%`, transform: `scale(${zoom})` }} />
            <span className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lift"
              style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }} />
          </div>
          <label className="mt-4 block text-xs font-medium text-smoke">
            {tr("Zoom")}
            <input type="range" min="1" max="2.5" step="0.05" value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="mt-1.5 w-full accent-[#d94407]" />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3.5">
          <button onClick={onCancel} className="btn-ghost !py-2 text-sm">{tr("Cancel")}</button>
          <button onClick={() => onSave(focal, zoom)} className="btn-primary !py-2 text-sm">{tr("Save")}</button>
        </div>
      </div>
    </div>
  )
}
