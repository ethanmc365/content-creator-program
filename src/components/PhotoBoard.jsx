import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import { cx } from '../lib/utils'
import { onPhotosChanged } from '../lib/photoEvents'
import { notice } from '../lib/confirm'

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
// RESIZING HAS NO HANDLES. Ethan: "you can change the size, but I don't want
// any of these squares in each corner. I just want the functionality to resize
// them without the squares." The bottom-right corner of a tile is a hit zone
// while arranging, with a cursor and a faint corner mark that only appears
// under the pointer - no square sitting on the artwork. Dragging it changes how
// many COLUMNS the photo spans, which is the only size that can exist on a
// packed board and the only one that can never overlap.
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

/** How many columns the board runs at this width. Two on a phone. */
export function colsFor(width) {
  if (!width) return 3
  return width < 520 ? 2 : 3
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
export function spanOf(p, cols) {
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
 * @param boxes the other tiles' packed rects, in order
 */
export function dropIndex(boxes, px, py) {
  let idx = boxes.length
  let best = Infinity
  for (let i = 0; i < boxes.length; i += 1) {
    const b = boxes[i]
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    const d = Math.hypot(px - cx, py - cy)
    if (d < best) { best = d; idx = px < cx ? i : i + 1 }
  }
  return idx
}

export default function PhotoBoard({ creatorId, editable = false, alwaysArranging = false, onCount }) {
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

  useEffect(() => {
    const el = boardRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [photos])

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

  // WHAT IS IN THE HAND, IF ANYTHING.
  //  { id, mode, order?, spans?, pointer? }
  // `order` and `spans` are the PREVIEW: the layout memo below packs those
  // instead of the committed ones, so the board shows the result of the drag
  // while it is still happening. Declared up here because the layout reads it.
  const [drag, setDrag] = useState(null)
  const dragState = useRef(null)
  const detach = useRef(null)
  const commitRef = useRef(null)

  // THE BOARD'S ORDER. `sort_order` is the running order; the packer turns it
  // into coordinates. A drag rewrites this list and nothing else.
  const ordered = useMemo(() => {
    const rows = (photos ?? []).filter((p) => editable || !broken[p.id])
    return [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      || String(a.id).localeCompare(String(b.id)))
  }, [photos, broken, editable])

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
      span: drag?.spans?.[p.id] ?? spanOf(p, cols),
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
  }, [ordered, aspects, cols, drag])

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
  // TWO GESTURES, ONE ENGINE. A press on the tile MOVES it (which means
  // reordering it); a press in the bottom-right corner RESIZES it (which means
  // changing how many columns it spans). Both work by rewriting the preview and
  // letting the packer do the rest - neither one positions anything itself,
  // which is why neither one can produce an overlap.

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
  const commit = useCallback(async (order, spans) => {
    const items = order.map((p) => ({
      aspect: p.aspect || aspects[p.id] || 1,
      span: spans?.[p.id] ?? spanOf(p, cols),
    }))
    const boxes = packBoard(items, cols)
    const before = photos
    const patches = []
    order.forEach((p, i) => {
      const b = boxes[i]
      const next = {
        sort_order: i,
        pos_x: toMille(b.x), pos_y: toMille(b.y),
        pos_w: toMille(b.w), pos_h: toMille(b.h),
      }
      const changed = next.sort_order !== (p.sort_order ?? null)
        || next.pos_x !== (p.pos_x ?? null) || next.pos_y !== (p.pos_y ?? null)
        || next.pos_w !== (p.pos_w ?? null) || next.pos_h !== (p.pos_h ?? null)
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
  }, [photos, aspects, cols])
  useEffect(() => { commitRef.current = commit }, [commit])
  useEffect(() => () => detach.current?.(), [])

  function beginDrag(e, tile, mode) {
    if (!arranging || !width) return
    e.preventDefault()
    e.stopPropagation()
    const colW = (1 - GAP * (cols - 1)) / cols
    const startSpan = spanOf(tile, cols)
    dragState.current = {
      id: tile.id, mode,
      startX: e.clientX, startY: e.clientY,
      startSpan,
      // Where inside the tile the finger landed, so a moved tile does not jump
      // its own top-left corner under the pointer.
      grabX: (e.clientX - (boardRef.current?.getBoundingClientRect().left ?? 0)) / width - tile.x,
      grabY: (e.clientY - (boardRef.current?.getBoundingClientRect().top ?? 0)) / width - tile.y,
      colW,
      order: layout.order,
      spans: {},
      moved: false,
    }
    setDrag({ id: tile.id, mode, order: layout.order, spans: {}, pointer: { x: tile.x, y: tile.y } })

    const move = (ev) => {
      const d = dragState.current
      if (!d) return
      const rect = boardRef.current?.getBoundingClientRect()
      if (!rect) return
      const px = (ev.clientX - rect.left) / width
      const py = (ev.clientY - rect.top) / width
      if (!d.moved && Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 4) return
      d.moved = true

      if (d.mode === 'resize') {
        // HOW MANY COLUMNS, not how many pixels. A packed board has no other
        // kind of width, and a width measured in columns is the reason nothing
        // can ever overlap after a resize.
        const left = layout.byId.get(d.id)?.x ?? 0
        const wanted = Math.max(0, px - left)
        const span = Math.max(1, Math.min(cols, Math.round((wanted + GAP) / (d.colW + GAP))))
        if (span !== (d.spans[d.id] ?? d.startSpan)) {
          d.spans = { ...d.spans, [d.id]: span }
          setDrag((cur) => (cur ? { ...cur, spans: d.spans } : cur))
        }
        return
      }

      // MOVE = REORDER. The dragged tile is lifted out of the list, the drop
      // index is read off where the finger is, and it goes back in there. The
      // packer then lays everything out, so the other tiles slide to show you
      // the answer before you let go.
      const others = d.order.filter((p) => p.id !== d.id)
      const items = others.map((p) => ({
        aspect: p.aspect || aspects[p.id] || 1,
        span: d.spans[p.id] ?? spanOf(p, cols),
      }))
      const boxes = packBoard(items, cols)
      const at = dropIndex(boxes, px, py)
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
      commitRef.current?.(d.order, d.spans)
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
  const [resetting, setResetting] = useState(false)
  async function resetAll() {
    if (resetting) return
    setResetting(true)
    const before = photos
    setPhotos((cur) => (cur || []).map((p) => (
      { ...p, pos_x: null, pos_y: null, pos_w: null, pos_h: null })))
    const { error } = await supabase.from('creator_photos')
      .update({ pos_x: null, pos_y: null, pos_w: null, pos_h: null })
      .eq('creator_id', creatorId)
    setResetting(false)
    if (error) {
      setPhotos(before)
      await notice(`The board could not be tidied: ${error.message}`)
    }
  }

  async function saveCrop(photo, focal, zoom) {
    setPhotos((cur) => (cur || []).map((p) => (
      p.id === photo.id ? { ...p, focal_x: focal.x, focal_y: focal.y, zoom } : p)))
    setCropping(null)
    await supabase.from('creator_photos')
      .update({ focal_x: focal.x, focal_y: focal.y, zoom }).eq('id', photo.id)
  }

  if (photos === null) return <div className="h-64 w-full animate-pulse rounded-card bg-cloud" />
  if (!photos.length) return null

  return (
    <>
      {editable && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
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
          const held = drag?.id === t.id && drag.mode === 'move' && drag.pointer
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
            />
          )
        })}
      </div>

      {cropping && (
        <CropDialog photo={cropping} onCancel={() => setCropping(null)}
          onSave={(focal, zoom) => saveCrop(cropping, focal, zoom)} />
      )}
      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </>
  )
}

// ---------------------------------------------------------------- one photo
function PhotoTile({ photo, box, width, arranging, editable, dragging, onOpen, onCrop, onBroken, onDragStart }) {
  return (
    <figure
      data-tile
      style={{
        position: 'absolute',
        left: box.x * width,
        top: box.y * width,
        width: box.w * width,
        height: box.h * width,
        // Picking a photo up brings it to the front, which is what a pile of
        // prints does and what makes overlap usable rather than confusing.
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
        dragging
          ? 'transition-none'
          : 'transition-[left,top,width,height,box-shadow] duration-200 ease-out motion-reduce:transition-none',
        arranging && 'cursor-grab touch-none active:cursor-grabbing',
      )}
      onPointerDown={(e) => arranging && onDragStart(e, photo, 'move')}
    >
      {photo.missing ? (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-cloud px-3 text-center">
          <Icon name="image" className="h-5 w-5 text-gray-300" />
          <span className="text-[11px] font-medium leading-tight text-smoke">
            This photo is no longer in storage. Remove it and upload it again.
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

      {/* THE CAPTION IS ON THE ARRANGE BOARD TOO.
          It used to be hidden while arranging, which meant you laid the board
          out against a set of tiles that did not look like the board anybody
          would see - and a caption is a third of the height of a small tile, so
          the arrangement that looked right came out wrong. Ethan: "the caption
          should appear on the arranged board as well if I've added a caption in
          the travel photos section." It is `pointer-events-none`, so it has
          never been in the way of a drag. The bottom-right corner is left clear
          for the resize grip while arranging. */}
      {photo.caption && (
        <figcaption className={cx(
          'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-2.5 pt-8',
          arranging && 'pr-11',
        )}>
          <span className="line-clamp-2 text-[13px] font-medium leading-snug text-white">{photo.caption}</span>
        </figcaption>
      )}

      {!arranging && (
        <button type="button" onClick={onOpen} className="absolute inset-0" aria-label="Open photo">
          <span className="sr-only">{photo.caption || 'Open photo'}</span>
        </button>
      )}

      {editable && !arranging && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCrop() }}
          className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink opacity-0 shadow-card backdrop-blur transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label="Reframe this photo"
        >
          <Icon name="crop" className="h-4 w-4" />
        </button>
      )}

      {arranging && (
        // RESIZE WITH NO SQUARES ON THE ARTWORK.
        //
        // Ethan: "you can change the size, but I don't want any of these
        // squares in each corner. I just want the functionality to resize them
        // without the squares." There were four 16px white-and-orange blocks
        // sitting on every photograph, which on a board of ten is forty pieces
        // of furniture over the thing you are trying to look at.
        //
        // So the bottom-right corner is a HIT ZONE rather than a control: 36px
        // of tile that takes a drag, with the resize cursor on a desktop and a
        // faint corner rule that only fades in under the pointer. Nothing sits
        // on the picture until you go looking for it.
        //
        // ONE CORNER, NOT FOUR. On a packed board a resize changes how many
        // COLUMNS a photo spans, and a span grows to the right by definition -
        // there is no meaningful "resize from the top left" when the packer
        // decides where the tile starts. Four corners was an affordance for a
        // freely-placed board that no longer exists.
        // `stopPropagation` so a resize does not also start a move.
        <span
          role="button"
          tabIndex={-1}
          aria-label="Drag to resize this photo"
          onPointerDown={(e) => { e.stopPropagation(); onDragStart(e, photo, 'resize') }}
          className="group/grip absolute bottom-0 right-0 z-20 h-9 w-9 cursor-nwse-resize"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-1.5 right-1.5 h-3.5 w-3.5 rounded-br-[5px] border-b-2 border-r-2 border-white/90 opacity-0 drop-shadow transition-opacity duration-150 group-hover/grip:opacity-100 group-hover:opacity-70"
          />
        </span>
      )}
    </figure>
  )
}

// ---------------------------------------------------------------- lightbox
function Lightbox({ photo, onClose }) {
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
      aria-label="Close photo"
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
          <h3 className="text-sm font-semibold">Reframe this photo</h3>
          <button onClick={onCancel} aria-label="Close"
            className="rounded-full p-1.5 text-smoke transition-colors hover:bg-cloud hover:text-ink">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          <p className="mb-3 text-xs text-smoke">Drag to choose what stays in the middle when the photo is cropped.</p>
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
            Zoom
            <input type="range" min="1" max="2.5" step="0.05" value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="mt-1.5 w-full accent-[#d94407]" />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3.5">
          <button onClick={onCancel} className="btn-ghost !py-2 text-sm">Cancel</button>
          <button onClick={() => onSave(focal, zoom)} className="btn-primary !py-2 text-sm">Save</button>
        </div>
      </div>
    </div>
  )
}
