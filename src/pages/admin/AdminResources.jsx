import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Badge, EmptyState, Modal, PageHeader, Skeleton, Spinner } from '../../components/ui'
import { formatDate } from '../../lib/utils'

// Resource library management: publish tips/guides, optionally attach a
// downloadable file (stored in the public "resources" bucket).
const CATEGORIES = ['Tips', 'Video Ideas', 'Brand Guidelines', "Do's & Don'ts", 'Assets', 'Examples']
const emptyForm = { title: '', body: '', category: 'Tips', file_url: '' }

export default function AdminResources() {
  const { user } = useAuth()
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | resource row
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const { data } = await supabase.from('resources').select('*').order('created_at', { ascending: false })
    setResources(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openEditor(resource) {
    setError('')
    setEditing(resource ?? 'new')
    setForm(resource ? { ...resource } : emptyForm)
  }

  // Optional file attachment → public resources bucket (admin-only upload).
  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 25 * 1024 * 1024) return setError('Files must be under 25MB.')
    setUploading(true)
    setError('')
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
    const { error: upErr } = await supabase.storage.from('resources').upload(path, file)
    if (upErr) {
      setError(upErr.message)
    } else {
      const { data } = supabase.storage.from('resources').getPublicUrl(path)
      setForm((f) => ({ ...f, file_url: data.publicUrl }))
    }
    setUploading(false)
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      category: form.category,
      file_url: form.file_url || null,
    }
    if (editing === 'new') {
      await supabase.from('resources').insert({ ...payload, created_by: user.id })
    } else {
      await supabase.from('resources').update(payload).eq('id', editing.id)
    }
    setBusy(false)
    setEditing(null)
    load()
  }

  async function remove(resource) {
    if (!confirm(`Delete "${resource.title}" from the library?`)) return
    await supabase.from('resources').delete().eq('id', resource.id)
    load()
  }

  return (
    <div className="page max-w-3xl">
      <PageHeader
        title="Manage resources"
        subtitle="Everything you publish here lives in the creators' library permanently."
        action={<button onClick={() => openEditor(null)} className="btn-primary">+ New resource</button>}
      />

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : resources.length === 0 ? (
        <EmptyState emoji="📚" title="The library is empty" hint="Start with your brand guidelines and a few video hooks." />
      ) : (
        <div className="space-y-4">
          {resources.map((r) => (
            <div key={r.id} className="card flex flex-wrap items-center gap-4 !p-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{r.title}</p>
                <p className="text-xs text-smoke">{formatDate(r.created_at)}{r.file_url && ' · has attachment 📎'}</p>
              </div>
              <Badge tone="light">{r.category}</Badge>
              <div className="flex gap-2">
                <button onClick={() => openEditor(r)} className="btn-secondary !py-2 text-xs">Edit</button>
                <button onClick={() => remove(r)} className="btn-danger !py-2 text-xs">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New resource' : 'Edit resource'} wide>
        <form onSubmit={save} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <div>
              <label htmlFor="res-title" className="label">Title</label>
              <input id="res-title" type="text" required className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder='e.g. "10 video hooks that always work"' />
            </div>
            <div>
              <label htmlFor="res-cat" className="label">Category</label>
              <select id="res-cat" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="res-body" className="label">Content</label>
            <textarea id="res-body" rows={10} required className="input font-mono !text-xs" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Write the tip, guide or instructions here. Line breaks are kept." />
          </div>
          <div>
            <p className="label">Attachment <span className="font-normal text-smoke">(optional — logos, templates, b-roll packs)</span></p>
            {form.file_url ? (
              <div className="flex items-center gap-3 rounded-xl bg-cloud px-4 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate">📎 {decodeURIComponent(form.file_url.split('/').pop())}</span>
                <button type="button" onClick={() => setForm({ ...form, file_url: '' })} className="text-xs font-medium text-red-500 hover:underline">Remove</button>
              </div>
            ) : (
              <label className="btn-secondary inline-flex cursor-pointer !py-2 text-xs">
                {uploading ? <Spinner className="h-4 w-4" /> : 'Upload file'}
                <input type="file" className="hidden" onChange={handleFile} />
              </label>
            )}
          </div>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={busy || uploading} className="btn-primary w-full">
            {busy ? <Spinner /> : editing === 'new' ? 'Publish to library' : 'Save changes'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
