import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import { cx } from '../lib/utils'

// THE TRAVEL PHOTO BOARD, REBUILT.
//
// WHAT THE OLD ONE DID AND WHY IT HAD TO GO.
//
// It was free 2-D placement on a 12-column grid: every photo carried pos_x,
// pos_y, pos_w and pos_h, you dragged a tile anywhere and it landed on a cell.
// On paper that is "a board you can arrange". Measured against production it
// was worse than that: NOBODY HAD EVER SUCCESSFULLY ARRANGED ONE. Every
// creator_photos row in the database had `pos_x = null` - all 250-odd of them -
// and not one had a stored aspect either. Ethan: "it's not showing all the
// photos added, and dragging, moving, resizing, none of those functions are
// working. Please completely rebuild it."
//
// The reasons it could not work were structural, not bugs to patch:
//
//   * OVERLAP WAS LEGAL. Two photos could hold the same cells - that was called
//     a feature - so the untouched default stacked tiles on top of each other
//     and the board looked broken before anybody dragged anything.
//   * NOTHING BOUNDED THE HEIGHT. `pos_y` was unclamped, so one downward drag
//     left a board several screens tall with a photo at the bottom of it.
//   * IT WAS DESKTOP-ONLY BY CONSTRUCTION. Twelve columns on a 375px screen is
//     a 31px cell, so the feature was switched off on the device these photos
//     are mostly looked at on.
//   * ASPECT WAS DECORATIVE. The stored box drove the shape, so a portrait
//     photo in a landscape box was cropped whatever the crop tool said.
//
// WHAT IT IS NOW: a masonry grid. Every photo keeps THE SHAPE IT WAS UPLOADED
// AT, always, because its row span is computed from its own measured aspect.
// Arranging is ORDER plus WIDTH - drag a photo to a new place in the run, press
// the button to let it span two columns - which is the arranging people
// actually do, cannot produce an overlap or a hole, and works the same with a
// thumb as with a mouse. Two columns on a phone, three above that, so a board
// of ten photos is a screen and a half rather than the six screens the old
// default produced.
//
// `sort_order` carries the order and `pos_w` carries the span (1 or 2). The
// other pos_* columns are left alone: they hold nothing anywhere, and dropping
// them is a migration for another day.

// A masonry row unit. Small enough that a span lands within a pixel or two of
// the true height, large enough that a 400px tile is 50 spans and not 400.
const ROW = 8
const GAP = 10

/** How many columns the board runs at this width. */
export function colsFor(width) {
  if (width < 420) return 2
  return 3
}

/**
 * How many ROW units a photo of this aspect needs at this column width.
 * Exported for the tests: this is the one piece of arithmetic that decides
 * whether a photo keeps its shape.
 */
export function spanFor(aspect, colWidth, span = 1) {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const w = colWidth * span + GAP * (span - 1)
  const h = w / a
  return Math.max(4, Math.round((h + GAP) / ROW))
}

export default function PhotoBoard({ creatorId, editable = false, alwaysArranging = false, onCount }) {
  const [photos, setPhotos] = useState(null)
  const [arrangingSelf, setArranging] = useState(false)
  const [cropping, setCropping] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  // id -> measured aspect. Held here rather than only in the database so the
  // FIRST render after an upload is already the right shape, and so a board
  // whose rows predate the `aspect` column (all of them, today) lays out
  // correctly without waiting for a write to land.
  const [aspects, setAspects] = useState({})
  // Photos whose file is no longer in storage. There are six of these in
  // production right now, all belonging to one creator, and they were rendering
  // as the browser's broken-image icon - which is what "it's not showing all
  // the photos added" looks like from the outside.
  //
  // A VISITOR SEES NOTHING; THE OWNER SEES THE TRUTH. Hiding a missing photo
  // from everybody would mean the person who uploaded it never finds out it is
  // gone, and they are the only one who can do anything about it. Hiding it
  // from a stranger is simply not showing them somebody else's broken data.
  const [broken, setBroken] = useState({})
  const boardRef = useRef(null)
  const [width, setWidth] = useState(0)

  const arranging = editable && (alwaysArranging || arrangingSelf)

  useEffect(() => {
    const el = boardRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [photos])

  const load = useCallback(async () => {
    const { data } = await supabase.from('creator_photos').select('*')
      .eq('creator_id', creatorId).order('sort_order')
    setPhotos(data ?? [])
    onCount?.((data ?? []).length)
  }, [creatorId, onCount])
  useEffect(() => { load() }, [load])

  // MEASURE EVERY PHOTO ONCE, and write back the ones the database is missing.
  //
  // `new Image()` rather than an onLoad on the rendered <img>: the layout needs
  // the aspect BEFORE it can decide the tile's height, and an onLoad fires
  // after the browser has already laid the wrong height out once, which is a
  // visible jump on every board. The write-back is best effort - it is a cache
  // warm, not something anything waits for - and only the owner does it,
  // because a visitor has no business writing to somebody else's rows.
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
        if (editable) {
          supabase.from('creator_photos').update({ aspect: a }).eq('id', p.id).then(() => {})
        }
      }
      // The same probe that measures also tells us the file is gone, so a
      // missing photo is known BEFORE it has a chance to paint a broken icon.
      img.onerror = () => { if (alive) setBroken((cur) => ({ ...cur, [p.id]: true })) }
      img.src = p.photo_url
    }
    return () => { alive = false }
  }, [photos, aspects, editable])

  const cols = colsFor(width || 900)
  const colWidth = width ? (width - GAP * (cols - 1)) / cols : 0

  const tiles = useMemo(() => (photos ?? []).filter((p) => editable || !broken[p.id]).map((p) => {
    // A span of 2 on a two-column phone is a full-width photo, which is fine
    // and deliberate; it is never allowed to exceed the column count.
    const span = Math.min(cols, Math.max(1, Number(p.pos_w) || 1))
    return { ...p, span, aspect: p.aspect || aspects[p.id] || null, missing: !!broken[p.id] }
  }), [photos, aspects, cols, broken, editable])

  // ------------------------------------------------------------------ drag
  //
  // ONE DIMENSION, NOT TWO. Reordering a run is a drag with exactly one correct
  // answer at every moment - which tile am I over - so it cannot produce an
  // overlap, cannot leave a hole, and needs no snapping pass. The old free
  // placement had to guess, and guessed wrong often enough that nobody ever
  // finished a drag.
  //
  // Document-level listeners: a pointer leaves the tile constantly (the tile is
  // moving under it), and every ending has to be heard or a card is left stuck.
  const [drag, setDrag] = useState(null) // { id, overIndex }
  const dragRef = useRef(null)

  const order = useMemo(() => tiles.map((t) => t.id), [tiles])

  const endDragRef = useRef(null)

  const endDrag = useCallback(async () => {
    const d = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!d || d.overIndex == null) return
    const from = order.indexOf(d.id)
    if (from < 0 || from === d.overIndex) return
    const next = [...order]
    next.splice(from, 1)
    next.splice(d.overIndex, 0, d.id)
    // Optimistic: the board settles on the frame the finger lifts and the
    // writes catch up. A board that waits for six round trips before it moves
    // reads as a board that ignored you.
    setPhotos((cur) => next.map((id) => (cur || []).find((p) => p.id === id)).filter(Boolean))
    await Promise.all(next.map((id, i) =>
      supabase.from('creator_photos').update({ sort_order: i }).eq('id', id)))
  }, [order])

  // The handler closed over at pointerdown must call the CURRENT endDrag, not
  // the one that existed when the drag started - `order` changes underneath it.
  // Written in an effect rather than during render: a ref assignment in the
  // render body is a side effect, and React can render without committing.
  useEffect(() => { endDragRef.current = endDrag }, [endDrag])

  // THE LISTENERS GO ON AT POINTERDOWN, NOT IN AN EFFECT.
  //
  // They used to be attached by an effect keyed on `drag`, which means they are
  // not live until React has committed the state change that starts the drag.
  // A pointermove or pointerup that arrives before that commit is simply lost.
  // With a human hand the first move is tens of milliseconds later so it
  // usually works; with a fast flick, a slow frame, or a synthetic event it
  // does not, and the tile is left stuck to the finger with no way to drop it.
  // Same race, and the same fix, as the boarding-pass camera: do the work in
  // the handler rather than hoping a commit has already happened.
  const detach = useRef(null)

  useEffect(() => () => detach.current?.(), [])

  function beginDrag(e, photo) {
    if (!arranging) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { id: photo.id, overIndex: null }
    setDrag({ id: photo.id, overIndex: null })

    const move = (ev) => {
      const el = boardRef.current
      if (!el || !dragRef.current) return
      // Hit-test the rendered boxes. That is the honest question - which photo
      // is under my finger - and it is the same question on every device.
      const nodes = [...el.querySelectorAll('[data-tile]')]
      for (let i = 0; i < nodes.length; i += 1) {
        const r = nodes[i].getBoundingClientRect()
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          if (dragRef.current.overIndex !== i) {
            dragRef.current.overIndex = i
            setDrag((d) => (d ? { ...d, overIndex: i } : d))
          }
          return
        }
      }
    }
    const up = () => {
      detach.current?.()
      endDragRef.current?.()
    }
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

  async function toggleSpan(photo) {
    const next = photo.span >= 2 ? 1 : 2
    setPhotos((cur) => (cur || []).map((p) => (p.id === photo.id ? { ...p, pos_w: next } : p)))
    await supabase.from('creator_photos').update({ pos_w: next }).eq('id', photo.id)
  }

  async function saveCrop(photo, focal, zoom) {
    setPhotos((cur) => (cur || []).map((p) => (
      p.id === photo.id ? { ...p, focal_x: focal.x, focal_y: focal.y, zoom } : p)))
    setCropping(null)
    await supabase.from('creator_photos')
      .update({ focal_x: focal.x, focal_y: focal.y, zoom })
      .eq('id', photo.id)
  }

  if (photos === null) {
    return <div className="h-64 w-full animate-pulse rounded-card bg-cloud" />
  }
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
        // `touch-action: none` while arranging, or the browser claims the drag
        // as a page scroll on the first pixel and the tile never moves. Only
        // while arranging: the rest of the time this board must scroll normally.
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridAutoRows: `${ROW}px`,
          columnGap: `${GAP}px`,
          touchAction: arranging ? 'none' : undefined,
        }}
        className="w-full"
      >
        {tiles.map((p, i) => (
          <PhotoTile
            key={p.id}
            photo={p}
            index={i}
            colWidth={colWidth}
            arranging={arranging}
            editable={editable}
            dragging={drag?.id === p.id}
            dropTarget={!!drag && drag.overIndex === i && drag.id !== p.id}
            onOpen={() => !arranging && setLightbox(p)}
            onCrop={() => setCropping(p)}
            onToggleSpan={() => toggleSpan(p)}
            onDragStart={beginDrag}
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

      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </>
  )
}

// ---------------------------------------------------------------- one photo
function PhotoTile({
  photo, index, colWidth, arranging, editable, dragging, dropTarget,
  onOpen, onCrop, onToggleSpan, onDragStart,
}) {
  const span = spanFor(photo.aspect, colWidth || 300, photo.span)
  return (
    <figure
      data-tile
      data-index={index}
      style={{
        gridColumn: `span ${photo.span}`,
        gridRow: `span ${span}`,
        marginBottom: `${GAP}px`,
      }}
      className={cx(
        'group relative overflow-hidden rounded-xl bg-cloud transition-all duration-150',
        dragging && 'scale-[0.97] opacity-50',
        dropTarget && 'ring-2 ring-brand ring-offset-2',
        arranging && 'cursor-grab touch-none active:cursor-grabbing',
      )}
      // THE WHOLE TILE IS THE HANDLE WHILE ARRANGING, and that is safe here in
      // a way it was not on the old board: in arrange mode a tile has no other
      // job, so there is nothing to disambiguate a press from. Outside arrange
      // mode the tile opens the lightbox instead and nothing drags.
      onPointerDown={(e) => arranging && onDragStart(e, photo)}
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
          <span className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-smoke shadow-card">
            <Icon name="grip" className="h-3 w-3" />
            Drag
          </span>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggleSpan() }}
            className="absolute bottom-2 right-2 z-10 flex h-8 items-center gap-1.5 rounded-full bg-white/95 px-2.5 text-[11px] font-semibold text-smoke shadow-card transition-colors hover:text-brand"
            aria-label={photo.span >= 2 ? 'Make this photo narrower' : 'Make this photo wider'}
          >
            <Icon name="expand" className="h-3.5 w-3.5" />
            {photo.span >= 2 ? 'Narrower' : 'Wider'}
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
        {photo.caption && (
          <figcaption className="mt-3 text-center text-sm text-white/90">{photo.caption}</figcaption>
        )}
      </figure>
    </button>
  )
}

// ------------------------------------------------------------------- crop
//
// THE CROP IS A FOCAL POINT AND A ZOOM, NOT A RECTANGLE (migration 108). The
// complaint it answers is that `object-cover` crops from the CENTRE, so a face
// or a horizon gets sliced off. Moving where the crop is taken from fixes
// exactly that, and it costs two numbers, no canvas re-encode and no second
// copy in storage.
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
          <p className="mb-3 text-xs text-smoke">
            Drag to choose what stays in the middle when the photo is cropped.
          </p>
          <div
            ref={boxRef}
            onPointerDown={(e) => { dragging.current = true; place(e) }}
            className="relative aspect-[4/3] w-full cursor-crosshair touch-none overflow-hidden rounded-xl bg-cloud"
          >
            <img
              src={photo.photo_url}
              alt=""
              draggable={false}
              className="h-full w-full select-none object-cover"
              style={{ objectPosition: `${focal.x * 100}% ${focal.y * 100}%`, transform: `scale(${zoom})` }}
            />
            <span
              className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lift"
              style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
            />
          </div>
          <label className="mt-4 block text-xs font-medium text-smoke">
            Zoom
            <input
              type="range" min="1" max="2.5" step="0.05" value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="mt-1.5 w-full accent-[#d94407]"
            />
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
