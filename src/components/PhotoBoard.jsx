import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import { cx } from '../lib/utils'

// THE TRAVEL PHOTO BOARD.
//
// Ethan: "the travel photos need a big upgrade. A lot of them are cut off and it
// just doesn't look good... a free board where you can click and drag photos,
// move them wherever you want. You can click to crop them a bit, resize them.
// They should always start by being the aspect ratio you posted. You can also
// click to snap them to place."
//
// WHY THIS IS A GRID AND NOT ABSOLUTE POSITIONING.
//
// "Free" and "snaps into place" sound like two modes and they are not: a
// 12-column grid gives both at once. Dragging is free - the photo follows the
// pointer - and it lands on a cell because a cell is the only thing it CAN land
// on. Absolute pixels would need a separate snapping pass, would break the
// moment the container changed width, and would store a layout that is only
// correct at the width it was made at. Cells are proportional, so one stored
// board is right on a 1400px desktop and a 700px tablet.
//
// OVERLAP IS ALLOWED, ON PURPOSE. Explicit grid placement lets two photos share
// cells, and "move them wherever you want" means that. Depth is `sort_order`,
// and picking a photo up brings it to the front, which is how a real pile of
// prints behaves.
//
// A BOARD ABOVE `sm`, A COLUMN BELOW IT, and this is not a cop-out. Twelve
// columns on a 375px screen is a 31px cell, and dragging between them with a
// thumb is worse than having no board. On a phone the photos stack in one
// column AT THEIR OWN ASPECT RATIO - which fixes the thing that was actually
// broken, because nothing is cropped, so nothing is cut off. Crop, caption and
// delete still work there; only move and resize need a pointer.
//
// THE CROP IS A FOCAL POINT AND A ZOOM, NOT A RECTANGLE. See migration 108. The
// short version: the complaint is that `object-cover` crops from the CENTRE, so
// a face or a horizon gets sliced off. Moving where the crop is taken from fixes
// exactly that, and it costs two numbers, no canvas re-encode and no second copy
// in storage.

const COLS = 12
// A cell's height as a fraction of its width. Slightly tall, so a 4-wide by
// 4-high tile reads as landscape and 3x5 reads as a portrait.
const CELL_RATIO = 0.82

/** The footprint a photo gets before anybody has arranged it. */
export function defaultBox(aspect, i = 0) {
  // A photo's FIRST appearance matches the shape it was uploaded at, so nothing
  // is cropped until somebody chooses to crop it.
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  let w = 4
  let h = Math.max(2, Math.min(8, Math.round((w / a) / CELL_RATIO)))
  if (a < 0.85) { h = 6; w = Math.max(2, Math.min(6, Math.round((h * CELL_RATIO) * a))) }
  return { pos_x: (i % 3) * 4, pos_y: Math.floor(i / 3) * 5, pos_w: w, pos_h: h }
}

function boxOf(p, i) {
  const set = p.pos_x != null && p.pos_y != null && p.pos_w != null && p.pos_h != null
  return set
    ? { pos_x: p.pos_x, pos_y: p.pos_y, pos_w: p.pos_w, pos_h: p.pos_h }
    : defaultBox(p.aspect, i)
}

/** True above the `sm` breakpoint. The board needs a pointer, so it needs to
 *  know, and a CSS-only answer cannot gate the drag handlers. */
function useWideEnough() {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

// HOW BIG A CELL IS, IN PIXELS.
//
// `grid-auto-rows` cannot be expressed as a fraction of the container's WIDTH in
// CSS, and that is exactly what a square-ish cell needs. So the width is
// measured and the row height set from it. A ResizeObserver rather than a
// window listener: this container is inside a two-column page layout, so it
// changes width when the RAIL appears, without the window resizing at all.
function useCellSize(ref) {
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => setW(entry.contentRect.width))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [ref])
  const cw = w / COLS
  return { boardWidth: w, cellW: cw, cellH: cw * CELL_RATIO }
}

export default function PhotoBoard({ creatorId, editable = false, onCount }) {
  const [photos, setPhotos] = useState(null)
  const [arranging, setArranging] = useState(false)
  const [dragId, setDragId] = useState(null)
  const [cropping, setCropping] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const boardRef = useRef(null)
  const wide = useWideEnough()
  const { cellW, cellH } = useCellSize(boardRef)
  // The live drag lives in a ref: it updates on every pointer move, and a
  // re-render per frame is what makes a drag feel like treacle.
  const drag = useRef(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('creator_photos').select('*')
      .eq('creator_id', creatorId).order('sort_order')
    setPhotos(data ?? [])
    onCount?.((data ?? []).length)
  }, [creatorId, onCount])
  useEffect(() => { load() }, [load])

  const placed = useMemo(
    () => (photos ?? []).map((p, i) => ({ ...p, ...boxOf(p, i) })),
    [photos],
  )

  function beginDrag(e, photo, mode) {
    if (!arranging || !wide) return
    e.preventDefault()
    e.stopPropagation()
    drag.current = {
      id: photo.id, mode,
      startX: e.clientX, startY: e.clientY,
      from: { x: photo.pos_x, y: photo.pos_y, w: photo.pos_w, h: photo.pos_h },
    }
    setDragId(photo.id)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function onMove(e) {
    const d = drag.current
    if (!d || !cellW) return
    const dx = Math.round((e.clientX - d.startX) / cellW)
    const dy = Math.round((e.clientY - d.startY) / cellH)
    setPhotos((cur) => (cur || []).map((p) => {
      if (p.id !== d.id) return p
      if (d.mode === 'move') {
        return { ...p,
          pos_x: Math.max(0, Math.min(COLS - d.from.w, d.from.x + dx)),
          pos_y: Math.max(0, d.from.y + dy),
          pos_w: d.from.w, pos_h: d.from.h }
      }
      return { ...p,
        pos_x: d.from.x, pos_y: d.from.y,
        pos_w: Math.max(2, Math.min(COLS - d.from.x, d.from.w + dx)),
        pos_h: Math.max(2, Math.min(12, d.from.h + dy)) }
    }))
  }

  const endDrag = useCallback(async () => {
    const d = drag.current
    drag.current = null
    setDragId(null)
    if (!d) return
    const p = (photos || []).find((x) => x.id === d.id)
    if (!p) return
    const box = boxOf(p, 0)
    // WRITE ALL FOUR, ALWAYS. A photo nobody has arranged has nulls for every
    // one of them, and saving only the pair that moved leaves it half placed -
    // the flow fallback keeps supplying the other two, so it jumps back to
    // where it was on the next load.
    await supabase.from('creator_photos').update({
      pos_x: box.pos_x, pos_y: box.pos_y, pos_w: box.pos_w, pos_h: box.pos_h,
    }).eq('id', p.id)
  }, [photos])

  async function saveCrop(photo, focal, zoom) {
    setPhotos((cur) => (cur || []).map((p) => (p.id === photo.id
      ? { ...p, focal_x: focal.x, focal_y: focal.y, zoom } : p)))
    setCropping(null)
    await supabase.from('creator_photos')
      .update({ focal_x: focal.x, focal_y: focal.y, zoom }).eq('id', photo.id)
  }

  // BACKFILLING THE SHAPE OF PHOTOS UPLOADED BEFORE TODAY.
  //
  // `aspect` is written at upload now, but every photo already in the gallery
  // has null - and on a phone the aspect ratio is what stops a photo being
  // cropped at all, so those are exactly the ones the complaint was about.
  // Rather than a migration that would have to download and decode every file,
  // the browser measures what it has already loaded and writes it back once.
  //
  // ONLY THE OWNER WRITES. RLS would reject anybody else, so a visitor's board
  // would fire a failing update per photo per view; and the value is identical
  // whoever measures it, so there is nothing to gain from letting them try.
  const healAspect = useCallback(async (photo, natural) => {
    if (!editable || !natural || photo.aspect) return
    setPhotos((cur) => (cur || []).map((p) => (p.id === photo.id ? { ...p, aspect: natural } : p)))
    await supabase.from('creator_photos').update({ aspect: natural }).eq('id', photo.id)
  }, [editable])

  async function resetOne(photo) {
    const box = defaultBox(photo.aspect, 0)
    setPhotos((cur) => (cur || []).map((p) => (p.id === photo.id
      ? { ...p, ...box, focal_x: 0.5, focal_y: 0.5, zoom: 1 } : p)))
    await supabase.from('creator_photos')
      .update({ ...box, focal_x: 0.5, focal_y: 0.5, zoom: 1 }).eq('id', photo.id)
  }

  if (photos === null) return <div className="h-64 w-full animate-pulse rounded-card bg-cloud" />
  if (!photos.length) return null

  const boardStyle = wide
    ? {
        display: 'grid',
        gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
        gridAutoRows: `${cellH || 1}px`,
        gap: '10px',
      }
    : { display: 'grid', gap: '12px' }

  return (
    <>
      {editable && wide && (
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
          {arranging && (
            <p className="text-xs text-smoke">Drag to move, pull the corner to resize. It saves itself.</p>
          )}
        </div>
      )}

      <div
        ref={boardRef}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={boardStyle}
        className={cx('w-full', arranging && 'rounded-card ring-1 ring-inset ring-brand/20')}
      >
        {placed.map((p, i) => (
          <PhotoTile
            key={p.id}
            photo={p}
            index={i}
            wide={wide}
            arranging={arranging && editable}
            dragging={dragId === p.id}
            editable={editable}
            onOpen={() => !arranging && setLightbox(p)}
            onCrop={() => setCropping(p)}
            onReset={() => resetOne(p)}
            onDragStart={beginDrag}
            onNatural={healAspect}
          />
        ))}
      </div>

      {cropping && (
        <CropDialog
          photo={cropping}
          onCancel={() => setCropping(null)}
          onSave={(focal, zoom) => saveCrop(cropping, focal, zoom)}
        />
      )}

      {lightbox && (
        <button
          type="button"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/80 p-6 backdrop-blur-sm"
          aria-label="Close photo"
        >
          <figure className="max-h-full max-w-4xl">
            <img src={lightbox.photo_url} alt={lightbox.caption || ''}
              className="max-h-[80vh] w-auto rounded-card object-contain" />
            {lightbox.caption && (
              <figcaption className="mt-3 text-center text-sm text-white/90">{lightbox.caption}</figcaption>
            )}
          </figure>
        </button>
      )}
    </>
  )
}

// ---------------------------------------------------------------- one photo
//
// THE CAPTION SITS ON THE PHOTO, NOT UNDER IT. Ethan: "adding a caption is nice
// and it should show up cleanly on the photos." Under the image it would set
// the tile's height, so a two-line caption on one tile and none on its
// neighbour would make a board of mismatched boxes - and the whole point of the
// board is that the boxes are what you arranged. On the image, inside a
// gradient that only exists where there is text, it costs no layout at all.
function PhotoTile({ photo, index, wide, arranging, dragging, editable, onOpen, onCrop, onReset, onDragStart, onNatural }) {
  const style = wide
    ? {
        gridColumn: `${photo.pos_x + 1} / span ${photo.pos_w}`,
        gridRow: `${photo.pos_y + 1} / span ${photo.pos_h}`,
        // Picking a photo up brings it to the front.
        zIndex: dragging ? 30 : 1 + index,
      }
    : {
        // ON A PHONE, THE PHOTO'S OWN SHAPE. This is the fix for "a lot of them
        // are cut off": with the aspect ratio set from the file, `object-cover`
        // has nothing to crop.
        aspectRatio: Number.isFinite(photo.aspect) && photo.aspect > 0 ? photo.aspect : 4 / 3,
      }

  return (
    <figure
      style={style}
      className={cx(
        'group relative overflow-hidden rounded-card bg-cloud shadow-card transition-shadow',
        dragging && 'shadow-lift ring-2 ring-brand',
        arranging && 'cursor-grab active:cursor-grabbing',
      )}
      onPointerDown={(e) => arranging && onDragStart(e, photo, 'move')}
    >
      <img
        src={photo.photo_url}
        alt={photo.caption || ''}
        draggable={false}
        loading="lazy"
        onLoad={(e) => {
          const { naturalWidth: w, naturalHeight: h } = e.currentTarget
          if (w && h) onNatural?.(photo, w / h)
        }}
        className="h-full w-full select-none object-cover"
        style={{
          // The crop, applied. `object-position` decides where the cover crop is
          // taken FROM, and the scale pushes past the frame. Together they are
          // the crop, with no re-encoding. See migration 108.
          objectPosition: `${(photo.focal_x ?? 0.5) * 100}% ${(photo.focal_y ?? 0.5) * 100}%`,
          transform: `scale(${photo.zoom ?? 1})`,
        }}
      />

      {photo.caption && (
        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-3 pb-2.5 pt-8">
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
          <button
            type="button"
            onPointerDown={(e) => onDragStart(e, photo, 'resize')}
            className="absolute bottom-1 right-1 z-20 flex h-7 w-7 cursor-nwse-resize items-center justify-center rounded-md bg-white/95 text-smoke shadow-card"
            aria-label="Resize this photo"
          >
            <Icon name="expand" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onReset() }}
            className="absolute left-1 top-1 z-20 rounded-md bg-white/95 px-2 py-1 text-[10px] font-semibold text-smoke shadow-card"
          >
            Reset
          </button>
        </>
      )}
    </figure>
  )
}

// ------------------------------------------------------------------ the crop
//
// REFRAMING, NOT CROPPING, AND THE DIFFERENCE IS THE POINT.
//
// Nothing here modifies the file. What it sets is where the tile's `object-fit:
// cover` takes its crop from, and how far in. That is enough to fix the actual
// complaint - "a lot of them are cut off" happens because cover always crops
// from the centre, so a subject that is not in the middle gets sliced - and it
// means changing your mind later costs nothing and loses nothing. The original
// is always still there, and "Reset" is a real undo rather than a re-upload.
//
// THE PREVIEW IS THE TILE, AT THE TILE'S OWN SHAPE. A square preview would be
// lying: you would frame a photo perfectly in a square and then watch it get
// cut differently in the 4x3 box it actually lives in. So the preview box takes
// the photo's real footprint from the board.
//
// DRAG THE PHOTO, DO NOT DRAG A RECTANGLE OVER IT. Moving the image under a
// fixed frame is how every phone's crop tool works, so it needs no explaining;
// the mapping is inverted (drag right, the focal point moves LEFT) because what
// the hand is doing is sliding the picture, not the window.
function CropDialog({ photo, onCancel, onSave }) {
  const [focal, setFocal] = useState({
    x: photo.focal_x ?? 0.5,
    y: photo.focal_y ?? 0.5,
  })
  const [zoom, setZoom] = useState(photo.zoom ?? 1)
  const frameRef = useRef(null)
  const drag = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  function down(e) {
    e.preventDefault()
    drag.current = { x: e.clientX, y: e.clientY, from: { ...focal } }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function move(e) {
    const d = drag.current
    const box = frameRef.current?.getBoundingClientRect()
    if (!d || !box) return
    // Inverted, and scaled by the zoom: at 2x the same hand movement should
    // travel half as far across the source, because the source is twice the
    // size on screen.
    const nx = d.from.x - ((e.clientX - d.x) / box.width) / zoom
    const ny = d.from.y - ((e.clientY - d.y) / box.height) / zoom
    setFocal({ x: Math.max(0, Math.min(1, nx)), y: Math.max(0, Math.min(1, ny)) })
  }
  function up() { drag.current = null }

  const ratio = (photo.pos_w && photo.pos_h)
    ? photo.pos_w / (photo.pos_h * CELL_RATIO)
    : (Number.isFinite(photo.aspect) && photo.aspect > 0 ? photo.aspect : 4 / 3)

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-label="Reframe photo">
      <div className="w-full max-w-lg rounded-card bg-white p-5 shadow-lift sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Reframe</h2>
            <p className="mt-0.5 text-xs text-smoke">Drag the photo to choose what stays in the frame.</p>
          </div>
          <button onClick={onCancel} aria-label="Close"
            className="-mr-1.5 -mt-1.5 rounded-full p-1.5 text-smoke transition-colors hover:bg-cloud hover:text-ink">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={frameRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          style={{ aspectRatio: ratio }}
          className="relative w-full cursor-grab overflow-hidden rounded-card bg-cloud active:cursor-grabbing"
        >
          <img
            src={photo.photo_url}
            alt=""
            draggable={false}
            className="h-full w-full select-none object-cover"
            style={{
              objectPosition: `${focal.x * 100}% ${focal.y * 100}%`,
              transform: `scale(${zoom})`,
            }}
          />
          {/* Thirds, only while the pointer is down. A permanent grid over
              somebody's photograph is clutter; one that appears as you move it
              is a guide. */}
          <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 [.cursor-grabbing_&]:opacity-100">
            <span className="absolute inset-y-0 left-1/3 w-px bg-white/50" />
            <span className="absolute inset-y-0 left-2/3 w-px bg-white/50" />
            <span className="absolute inset-x-0 top-1/3 h-px bg-white/50" />
            <span className="absolute inset-x-0 top-2/3 h-px bg-white/50" />
          </span>
        </div>

        <div className="mt-4">
          <label htmlFor="crop-zoom" className="label flex items-center justify-between">
            <span>Zoom</span>
            <span className="font-normal tabular-nums text-smoke">{zoom.toFixed(1)}x</span>
          </label>
          <input
            id="crop-zoom"
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-[#d94407]"
          />
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={() => { setFocal({ x: 0.5, y: 0.5 }); setZoom(1) }}
            className="btn-ghost w-full justify-center text-sm sm:w-auto"
          >
            Centre it again
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" onClick={onCancel} className="btn-ghost w-full justify-center sm:w-auto">Cancel</button>
            <button type="button" onClick={() => onSave(focal, zoom)} className="btn-primary w-full justify-center sm:w-auto">
              Save framing
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
