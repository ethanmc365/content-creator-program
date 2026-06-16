import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { compressImage } from '../lib/image'
import { uploadFile } from '../lib/upload'
import { Spinner } from './ui'
import Icon from './Icon'
import { cx } from '../lib/utils'

const MAX_PHOTOS = 20

// Travel photo gallery (up to 20 images per creator).
//  * editable=false → read-only grid on someone's profile.
//  * editable=true  → owner can upload, caption and delete (used in Edit Profile).
// Photos live in the public "gallery" bucket under gallery/<user id>/...
export default function TravelGallery({ creatorId, editable = false }) {
  const { user } = useAuth()
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(null) // photo being viewed full size
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('creator_photos')
      .select('*')
      .eq('creator_id', creatorId)
      .order('sort_order')
    setPhotos(data ?? [])
    setLoading(false)
  }, [creatorId])

  useEffect(() => { load() }, [load])

  async function handleFiles(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    if (photos.length + files.length > MAX_PHOTOS) {
      setError(`You can share up to ${MAX_PHOTOS} photos. Remove some first.`)
      return
    }
    setError('')
    setUploading(true)
    let order = photos.length
    for (const file of files) {
      if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) {
        setError('Each photo must be an image under 15MB.')
        continue
      }
      const compressed = await compressImage(file, { maxDim: 1280, quality: 0.82 })
      const path = `${user.id}/${Date.now()}-${order}.jpg`
      let url
      try {
        url = await uploadFile('gallery', path, compressed, 'image/jpeg')
      } catch (err) { setError(err.message); continue }
      await supabase.from('creator_photos').insert({ creator_id: user.id, photo_url: url, sort_order: order++ })
    }
    setUploading(false)
    load()
  }

  async function remove(photo) {
    if (!confirm('Remove this photo?')) return
    await supabase.from('creator_photos').delete().eq('id', photo.id)
    load()
  }

  async function saveCaption(photo, caption) {
    if (caption === photo.caption) return
    await supabase.from('creator_photos').update({ caption }).eq('id', photo.id)
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, caption } : p)))
  }

  // Toggle a photo between small (1x1) and large (2x2) on the board.
  async function toggleSize(photo) {
    const size = photo.size === 'large' ? 'small' : 'large'
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, size } : p)))
    await supabase.from('creator_photos').update({ size }).eq('id', photo.id)
  }

  // Move a photo earlier/later in the board, then normalise sort_order so the
  // new arrangement sticks for everyone.
  async function move(index, dir) {
    const j = index + dir
    if (j < 0 || j >= photos.length) return
    const arr = [...photos]
    ;[arr[index], arr[j]] = [arr[j], arr[index]]
    const renumbered = arr.map((p, i) => ({ ...p, sort_order: i }))
    setPhotos(renumbered)
    await Promise.all(
      renumbered
        .filter((p, i) => photos.find((o) => o.id === p.id)?.sort_order !== i)
        .map((p) => supabase.from('creator_photos').update({ sort_order: p.sort_order }).eq('id', p.id))
    )
  }

  if (loading) return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-xl bg-cloud" />)}</div>

  // Read-only profile view with nothing to show.
  if (!editable && photos.length === 0) return null

  return (
    <div>
      {editable && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-smoke">{photos.length} / {MAX_PHOTOS} photos · use the arrows to reorder and the expand button to make a photo larger.</p>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
          <button
            type="button" onClick={() => fileRef.current?.click()}
            disabled={uploading || photos.length >= MAX_PHOTOS}
            className="btn-secondary !py-2 text-xs"
          >
            {uploading ? <Spinner className="h-4 w-4" /> : '+ Add photos'}
          </button>
        </div>
      )}
      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      {/* A masonry-style travel board: large photos span 2x2, dense flow fills gaps. */}
      <div className="grid auto-rows-[110px] grid-cols-2 gap-2 [grid-auto-flow:dense] sm:auto-rows-[150px] sm:grid-cols-4 sm:gap-3">
        {photos.map((p, i) => (
          <figure key={p.id} className={cx('group relative overflow-hidden rounded-xl bg-cloud', p.size === 'large' && 'col-span-2 row-span-2')}>
            <button type="button" onClick={() => setLightbox(p)} className="block h-full w-full">
              <img src={p.photo_url} alt={p.caption || 'Travel photo'} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            </button>

            {editable && (
              <>
                {/* Control bar (always visible so it works on touch) */}
                <div className="absolute inset-x-1 top-1 flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-full bg-white/90 p-1 text-ink shadow-card disabled:opacity-30" aria-label="Move earlier"><Icon name="chevronLeft" className="h-3.5 w-3.5" strokeWidth={2.2} /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1} className="rounded-full bg-white/90 p-1 text-ink shadow-card disabled:opacity-30" aria-label="Move later"><Icon name="chevronRight" className="h-3.5 w-3.5" strokeWidth={2.2} /></button>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => toggleSize(p)} className="rounded-full bg-white/90 p-1 text-brand shadow-card" aria-label={p.size === 'large' ? 'Make smaller' : 'Make larger'} title={p.size === 'large' ? 'Make smaller' : 'Make larger'}><Icon name="expand" className="h-3.5 w-3.5" strokeWidth={2.2} /></button>
                    <button type="button" onClick={() => remove(p)} className="rounded-full bg-white/90 p-1 text-red-500 shadow-card" aria-label="Remove photo"><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg></button>
                  </div>
                </div>
                {/* Caption */}
                <input
                  type="text" defaultValue={p.caption || ''} placeholder="Add a caption…"
                  onBlur={(e) => saveCaption(p, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-x-0 bottom-0 w-full border-0 bg-white/85 px-2 py-1 text-[11px] text-ink backdrop-blur focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </>
            )}
            {!editable && p.caption && (
              <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent px-2 py-2 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                {p.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <button
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-6"
          onClick={() => setLightbox(null)}
          aria-label="Close photo"
        >
          <figure className="max-h-[90vh] max-w-3xl">
            <img src={lightbox.photo_url} alt={lightbox.caption || 'Travel photo'} className="max-h-[80vh] rounded-card object-contain" />
            {lightbox.caption && <figcaption className="mt-3 text-center text-sm text-white">{lightbox.caption}</figcaption>}
          </figure>
        </button>
      )}
    </div>
  )
}
