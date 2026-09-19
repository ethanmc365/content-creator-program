import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { EmptyState, Skeleton, Spinner, Toggle } from '../../ui'
import Icon from '../../Icon'
import { cx } from '../../../lib/utils'
import { pickClass } from '../../../lib/pick'
import { confirm, notice } from '../../../lib/confirm'
import { kitUrl, uploadKitImage } from '../../../pages/admin/AdminCreatorKit'

// THE GRAPHICS CREATORS REPOST.
//
// Ethan: "I want a place that myself and admins can upload the photos in
// quality that the creators can save to camera roll/download and then use."
//
// IN QUALITY IS THE REQUIREMENT, and it is the one thing that could quietly be
// got wrong here. Every other image upload on this platform goes through
// `compressImage` - 1280px, WebP, q0.82 - because every other image is a
// photograph somebody took on a phone and the point is to make it small. These
// are not photographs. They are finished graphics with type on them, made at a
// deliberate size, and re-encoding them would make the artwork whose entire job
// is to look good on somebody's Instagram story look soft. They are uploaded as
// they are. See `uploadKitImage`.

const KINDS = [
  { key: 'story', label: 'Story', hint: '9:16, for Instagram and TikTok stories', ratio: '9 / 16' },
  { key: 'post', label: 'Post', hint: 'Square, for a feed', ratio: '1 / 1' },
  { key: 'linkedin', label: 'LinkedIn', hint: 'Landscape, for a LinkedIn post', ratio: '1200 / 627' },
  { key: 'banner', label: 'Banner', hint: 'Wide, for a header', ratio: '4 / 1' },
  { key: 'other', label: 'Other', hint: 'Anything else', ratio: '4 / 3' },
]

export const kindOf = (key) => KINDS.find((k) => k.key === key) || KINDS[4]

export default function KitLibrary() {
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('creator_kit_assets')
      .select('*').order('sort_order').order('created_at', { ascending: false })
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function onFiles(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    let failed = 0
    // Sequential rather than Promise.all: these are big files going into one
    // bucket, and six concurrent 12MB uploads on a hotel wifi is how you get
    // six timeouts instead of six files.
    for (const [i, file] of files.entries()) {
      try {
        const { path, width, height } = await uploadKitImage(file)
        const { error } = await supabase.from('creator_kit_assets').insert({
          // The filename is the first draft of the title. An admin uploading
          // six graphics should not have to type six names before seeing them.
          title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 80) || 'Untitled',
          kind: guessKind(width, height),
          path, width, height,
          sort_order: (rows?.length || 0) + i,
          created_by: profile?.id,
        })
        if (error) failed += 1
      } catch { failed += 1 }
    }
    setBusy(false)
    if (failed) notice(`${failed} of ${files.length} could not be uploaded.`, { title: 'Some did not go up' })
    load()
  }

  async function patch(row, fields) {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...fields } : r)))
    const { error } = await supabase.from('creator_kit_assets').update(fields).eq('id', row.id)
    if (error) { notice(error.message, { title: 'Could not save that' }); load() }
  }

  async function remove(row) {
    if (!await confirm(
      `Delete "${row.title}"? Creators will no longer see it on their portfolio page.`,
      { title: 'Delete graphic', confirmLabel: 'Delete', danger: true },
    )) return
    // The ROW first and the FILE second, and never the other way round. If the
    // storage delete fails we are left with a file nobody references, which
    // costs a few megabytes; if the row delete fails after the file is gone,
    // every creator's portfolio draws a broken image.
    const { error } = await supabase.from('creator_kit_assets').delete().eq('id', row.id)
    if (error) return notice(error.message, { title: 'Could not delete that' })
    await supabase.storage.from('creator-kit').remove([row.path])
    load()
  }

  function move(row, by) {
    const list = [...rows]
    const from = list.findIndex((r) => r.id === row.id)
    const to = from + by
    if (to < 0 || to >= list.length) return
    list.splice(to, 0, list.splice(from, 1)[0])
    setRows(list)
    // Renumber the lot. Writing one row's new index is not enough when the
    // existing numbers are 0,0,0 - which they are for anything inserted before
    // ordering existed - and a full renumber is six rows.
    Promise.all(list.map((r, i) => supabase.from('creator_kit_assets').update({ sort_order: i }).eq('id', r.id)))
      .then(load)
  }

  if (rows === null) return <Skeleton className="h-96 w-full rounded-card" />

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-dashed border-gray-300 bg-white p-6 text-center">
        <Icon name="image" className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-3 text-sm font-semibold text-ink">Add the graphics creators can share</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-smoke">
          PNG, JPG or WebP, up to 15MB each. They are stored exactly as you upload them, so what a
          creator downloads is the file you made. Several at once is fine.
        </p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="btn-primary mt-4"
        >
          {busy ? <Spinner /> : <><Icon name="plus" className="h-4 w-4" /> Upload graphics</>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="image"
          title="Nothing in the kit yet"
          hint="Upload the 'I'm officially a Tryp.com Content Creator' graphics and they will appear on every creator's portfolio page, ready to save."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row, i) => (
            <KitCard
              key={row.id}
              row={row}
              first={i === 0}
              last={i === rows.length - 1}
              onPatch={(f) => patch(row, f)}
              onDelete={() => remove(row)}
              onMove={(by) => move(row, by)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// A shape is a better guess than a default. An admin uploading a 1080x1920
// story graphic should not have to tell us it is a story graphic.
function guessKind(w, h) {
  if (!w || !h) return 'other'
  const r = w / h
  if (r < 0.7) return 'story'
  if (r > 3) return 'banner'
  if (r > 1.5) return 'linkedin'
  if (r > 0.9 && r < 1.1) return 'post'
  return 'other'
}

function KitCard({ row, first, last, onPatch, onDelete, onMove }) {
  const [title, setTitle] = useState(row.title)
  const kind = kindOf(row.kind)

  return (
    <div className={cx(
      'overflow-hidden rounded-card border bg-white shadow-card transition-opacity',
      row.is_active ? 'border-gray-100' : 'border-gray-200 opacity-60',
    )}>
      {/* THE TILE RESERVES ITS SHAPE BEFORE THE BYTES ARRIVE. `width`/`height`
          are stored on the row for exactly this: a grid that discovers each
          tile's aspect on load reflows every time one lands. */}
      <div
        className="flex items-center justify-center bg-cloud"
        style={{ aspectRatio: row.width && row.height ? `${row.width} / ${row.height}` : kind.ratio }}
      >
        <img src={kitUrl(row.path)} alt={row.title} className="h-full w-full object-contain" loading="lazy" />
      </div>

      <div className="space-y-3 p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== row.title && onPatch({ title: title.trim().slice(0, 80) })}
          className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-semibold focus:border-brand/40"
          aria-label="Title"
        />

        {/* A NATIVE <select> IS A DIFFERENT APP'S UI. Ethan: "these pop-ups
            are not matching the UI of the website. They're like the weird
            Apple one." He is describing macOS's own dropdown, which is what a
            bare <select> opens - system font, system chrome, system animation,
            none of which this page controls. Five short, mutually exclusive
            options do not need a menu that has to be opened at all: they fit on
            one row as chips, they show the current choice without a click, and
            they are drawn by the same `pickClass` every other selected/unselected
            control on the platform uses. */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="What it is for">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => onPatch({ kind: k.key })}
              aria-pressed={row.kind === k.key}
              title={k.hint}
              className={pickClass(row.kind === k.key, 'rounded-lg border px-2.5 py-1 text-[11px] font-semibold')}
            >
              {k.label}
            </button>
          ))}
          {row.width && row.height && (
            <span className="ml-auto text-[11px] tabular-nums text-gray-400">{row.width}x{row.height}</span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
          <Toggle
            on={row.is_active}
            onChange={(on) => onPatch({ is_active: on })}
            label={row.is_active ? 'Live' : 'Hidden'}
          />
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onMove(-1)} disabled={first}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 hover:bg-cloud hover:text-smoke disabled:opacity-30"
              aria-label="Move earlier">
              <Icon name="arrow-down" className="h-4 w-4 rotate-180" />
            </button>
            <button type="button" onClick={() => onMove(1)} disabled={last}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 hover:bg-cloud hover:text-smoke disabled:opacity-30"
              aria-label="Move later">
              <Icon name="arrow-down" className="h-4 w-4" />
            </button>
            <button type="button" onClick={onDelete}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500"
              aria-label="Delete">
              <Icon name="trash" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
