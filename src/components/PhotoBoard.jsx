import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import { cx } from '../lib/utils'
import { onPhotosChanged } from '../lib/photoEvents'

// THE TRAVEL PHOTO BOARD. FREE PLACEMENT, DONE PROPERLY THIS TIME.
//
// THREE ATTEMPTS, AND WHY THIS ONE IS DIFFERENT.
//
// The original was free 2-D placement on a 12-column grid. It failed, and the
// proof was in production: every creator_photos row had `pos_x = null`, so
// nobody had ever completed a single arrangement. The reasons were structural -
// unbounded `pos_y` let a board grow taller than the screen, and twelve columns
// at 375px is a 31px cell, so the whole feature was switched off on phones.
//
// The second was a masonry grid: drag to REORDER, press to widen. It works, and
// it is not what was asked for. Ethan: "the tool just consists of drag and a
// narrower button, I want the ability to fully resize each one to any size I
// want by dragging from the corner, I want the move function to be able to move
// and drop it anywhere and it stays there, not snapping in place."
//
// So this is free placement again, with the two things that actually broke it
// fixed:
//
//   1. EVERYTHING IS STORED AS A FRACTION OF THE BOARD'S WIDTH, in per-mille,
//      not as grid cells and not as pixels. x, y, w and h are all in the same
//      unit, so a board arranged on a 1400px desktop renders as the SAME
//      ARRANGEMENT, scaled, at 375px. That single decision is what makes free
//      placement survive a phone at all - the old grid could not, which is why
//      it was desktop-only, which is why nobody used it.
//      `smallint` holds 0..32767, so per-mille has plenty of room for a board
//      several screens tall.
//   2. THE BOARD'S HEIGHT IS DERIVED FROM ITS CONTENTS, every render. A photo
//      dragged to the bottom extends the board and the page grows with it; it
//      can never be dropped into space that does not exist.
//
// Overlap is allowed, deliberately - "move it anywhere and it stays there"
// means exactly that, and photographs overlapping at the corners is what a real
// board of prints looks like. Depth is source order, and picking a photo up
// brings it to the front.

const MILLE = 1000
// A photo has to stay big enough to grab and small enough to arrange. 8% of the
// board is about 110px on a desktop and 30px on a phone.
const MIN_W = 80

const toFrac = (n, fallback = null) => (Number.isFinite(Number(n)) && n !== null ? Number(n) / MILLE : fallback)
const toMille = (f) => Math.round(f * MILLE)

/**
 * Where photos sit before anybody has arranged them: a packed masonry layout at
 * each photo's own aspect, in the same fractional units the drags use.
 *
 * IT TRACKS COLUMN HEIGHTS, and it has to. The first version placed row N at
 * `N * h` using ONE photo's height, so a tall portrait in column 0 was overlapped
 * by whatever landed under it - the untouched board looked broken before anybody
 * touched it, which is exactly what sank the original grid.
 * Shortest column wins, which is the standard masonry rule and keeps the board
 * as short as it can be.
 *
 * Takes the whole list rather than one index, because packing is a question
 * about the set. Exported for the tests.
 */
export function defaultLayout(aspects, cols) {
  const gap = 0.02
  const w = (1 - gap * (cols - 1)) / cols
  const heights = new Array(cols).fill(0)
  return aspects.map((raw) => {
    const a = Number.isFinite(raw) && raw > 0 ? raw : 1
    const h = w / a
    let col = 0
    for (let c = 1; c < cols; c += 1) if (heights[c] < heights[col]) col = c
    const y = heights[col]
    heights[col] = y + h + gap
    return { x: col * (w + gap), y, w, h }
  })
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
    onCount?.((data ?? []).length)
  }, [creatorId, onCount])
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

  const cols = width && width < 520 ? 2 : 3

  // Every tile, in fractions. A row that has never been arranged falls back to
  // the flowed default at its own aspect.
  const tiles = useMemo(() => {
    const rows = (photos ?? []).filter((p) => editable || !broken[p.id])
    // The fallback layout is computed over the photos that NEED one, so a board
    // where three of five have been arranged still packs the other two sensibly
    // instead of stacking them at the origin.
    const unplaced = rows.filter((p) => p.pos_x == null || p.pos_y == null || p.pos_w == null || p.pos_h == null)
    const fallback = defaultLayout(unplaced.map((p) => p.aspect || aspects[p.id] || 1), cols)
    const byId = new Map(unplaced.map((p, i) => [p.id, fallback[i]]))
    return rows.map((p) => {
      const aspect = p.aspect || aspects[p.id] || 1
      const placed = p.pos_x != null && p.pos_y != null && p.pos_w != null && p.pos_h != null
      const box = placed
        ? { x: toFrac(p.pos_x, 0), y: toFrac(p.pos_y, 0), w: toFrac(p.pos_w, 0.3), h: toFrac(p.pos_h, 0.3) }
        : byId.get(p.id)
      return { ...p, ...box, aspect, missing: !!broken[p.id] }
    })
  }, [photos, aspects, cols, broken, editable])

  // THE BOARD IS AS TALL AS ITS CONTENTS. Derived every render rather than
  // stored, so a photo dragged downwards extends the board instead of hanging
  // off the end of a fixed-height box - which is how the first version lost
  // photographs entirely.
  const bottom = tiles.reduce((m, t) => Math.max(m, t.y + t.h), 0)
  const boardHeight = width ? Math.max(width * 0.4, width * bottom + 8) : 320

  // ------------------------------------------------------------------ drag
  //
  // NO SNAPPING. The pointer delta is applied straight to the stored fraction,
  // so a photo goes exactly where it is put. The only clamps are the board's
  // own edges, because a photo dragged off the left is a photo nobody can get
  // back.
  const [drag, setDrag] = useState(null)   // { id, mode }
  const dragState = useRef(null)
  const detach = useRef(null)
  const commitRef = useRef(null)

  const commit = useCallback(async (id, box) => {
    await supabase.from('creator_photos').update({
      pos_x: toMille(box.x), pos_y: toMille(box.y),
      pos_w: toMille(box.w), pos_h: toMille(box.h),
    }).eq('id', id)
  }, [])
  useEffect(() => { commitRef.current = commit }, [commit])
  useEffect(() => () => detach.current?.(), [])

  function beginDrag(e, tile, mode) {
    if (!arranging || !width) return
    e.preventDefault()
    e.stopPropagation()
    dragState.current = {
      id: tile.id, mode,
      startX: e.clientX, startY: e.clientY,
      from: { x: tile.x, y: tile.y, w: tile.w, h: tile.h },
      box: { x: tile.x, y: tile.y, w: tile.w, h: tile.h },
    }
    setDrag({ id: tile.id, mode, box: { x: tile.x, y: tile.y, w: tile.w, h: tile.h } })

    const move = (ev) => {
      const d = dragState.current
      if (!d) return
      const dx = (ev.clientX - d.startX) / width
      const dy = (ev.clientY - d.startY) / width
      let box
      if (d.mode === 'move') {
        box = {
          ...d.from,
          x: Math.min(1 - d.from.w, Math.max(0, d.from.x + dx)),
          y: Math.max(0, d.from.y + dy),
        }
      } else {
        // FREE RESIZE FROM THE CORNER. Width and height move independently, so
        // a photo can be made any shape; `object-cover` plus the crop tool
        // decides what stays in frame. The minimum is in PIXELS converted to a
        // fraction, so a tile can never become ungrabbable at any board width.
        const min = MIN_W / width
        box = {
          x: d.from.x, y: d.from.y,
          w: Math.min(1 - d.from.x, Math.max(min, d.from.w + dx)),
          h: Math.max(min, d.from.h + dy),
        }
      }
      d.box = box
      // THE LIVE BOX LIVES IN STATE, not only in the ref. Reading a ref during
      // render is both a lint error here and genuinely unsound - React can
      // render without committing, so a ref read is not guaranteed to match
      // what is on screen. One setState per pointermove is the honest cost of
      // drawing a drag.
      setDrag((cur) => (cur ? { ...cur, box } : cur))
    }
    const up = () => {
      const d = dragState.current
      detach.current?.()
      dragState.current = null
      setDrag(null)
      if (!d) return
      setPhotos((cur) => (cur || []).map((p) => (p.id === d.id ? {
        ...p,
        pos_x: toMille(d.box.x), pos_y: toMille(d.box.y),
        pos_w: toMille(d.box.w), pos_h: toMille(d.box.h),
      } : p)))
      commitRef.current?.(d.id, d.box)
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

  async function resetOne(tile) {
    setPhotos((cur) => (cur || []).map((p) => (
      p.id === tile.id ? { ...p, pos_x: null, pos_y: null, pos_w: null, pos_h: null } : p)))
    await supabase.from('creator_photos')
      .update({ pos_x: null, pos_y: null, pos_w: null, pos_h: null }).eq('id', tile.id)
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
      {editable && !alwaysArranging && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setArranging((v) => !v)}
            className={cx('inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200',
              arranging ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hover:text-ink')}
          >
            <Icon name={arranging ? 'check' : 'pencil'} className="h-3.5 w-3.5" />
            {arranging ? 'Done' : 'Arrange the board'}
          </button>
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
          const live = drag?.id === t.id && drag.box ? drag.box : t
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
              onReset={() => resetOne(t)}
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
function PhotoTile({ photo, box, width, arranging, editable, dragging, onOpen, onCrop, onReset, onDragStart }) {
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
        // No transition while dragging: a 150ms ease on `left` means the tile
        // lags the finger, which reads as the board being slow rather than
        // smooth.
        !dragging && 'transition-shadow duration-150',
        arranging && 'cursor-grab active:cursor-grabbing',
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
          className="h-full w-full select-none object-cover"
          style={{
            objectPosition: `${(photo.focal_x ?? 0.5) * 100}% ${(photo.focal_y ?? 0.5) * 100}%`,
            transform: `scale(${photo.zoom ?? 1})`,
          }}
        />
      )}

      {photo.caption && !arranging && (
        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-2.5 pt-8">
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
        <>
          {/* THE RESIZE GRIP. Bottom-right, which is where every window corner
              in every operating system is, and big enough for a thumb. It stops
              the press reaching the tile underneath, or resizing would also
              start a move. */}
          <button
            type="button"
            onPointerDown={(e) => { e.stopPropagation(); onDragStart(e, photo, 'resize') }}
            className="absolute bottom-1 right-1 z-20 flex h-8 w-8 cursor-nwse-resize items-center justify-center rounded-lg bg-white/95 text-smoke shadow-card"
            aria-label="Drag to resize this photo"
          >
            <Icon name="expand" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onReset() }}
            className="absolute left-1 top-1 z-20 rounded-lg bg-white/95 px-2 py-1 text-[10px] font-semibold text-smoke shadow-card transition-colors hover:text-brand"
          >
            Reset
          </button>
        </>
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
