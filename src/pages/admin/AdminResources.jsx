import { useEffect, useMemo, useRef, useState } from 'react'
import { confirm } from '../../lib/confirm'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Badge, EmptyState, Modal, PageHeader, Skeleton, Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import RichEditable from '../../components/RichEditable'
import RichToolbar from '../../components/RichToolbar'
import { formatDate } from '../../lib/utils'
import { playableContentType } from '../../lib/media'
import { ensureMp4Brand } from '../../lib/videoRemux'

// Resource library management: publish tips/guides, optionally attach a
// downloadable file (stored in the public "resources" bucket).
const emptyForm = { title: '', body: '', category: '', file_url: '', links: [] }

export default function AdminResources() {
  const { user } = useAuth()
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | resource row
  const editorRef = useRef(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  async function load() {
    const { data } = await supabase.from('resources').select('*').order('created_at', { ascending: false })
    setResources(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openEditor(resource) {
    setError('')
    setEditing(resource ?? 'new')
    // A row loaded from before links existed has none; the form needs an
    // array either way or every map below throws.
    setForm(resource ? { ...resource, links: resource.links ?? [] } : emptyForm)
  }

  // Optional file attachment → public resources bucket (admin-only upload).
  async function handleFile(e) {
    const raw = e.target.files?.[0]
    if (!raw) return
    if (raw.size > 25 * 1024 * 1024) return setError('Files must be under 25MB.')
    setUploading(true)
    setError('')
    // iPhone .mov (QuickTime H.264) won't play inline in most browsers; rewrite
    // the container brand to MP4 so resource-card videos are playable everywhere.
    const file = await ensureMp4Brand(raw)
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
    const { error: upErr } = await supabase.storage.from('resources').upload(path, file, { contentType: playableContentType(file) })
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
      category: form.category.trim(),
      file_url: form.file_url || null,
      // Blank rows are what a person leaves behind after changing their mind
      // about a link, not something they meant to save.
      links: (form.links || []).filter((l) => l.url?.trim()).map((l) => ({
        label: l.label?.trim() || l.url.trim(),
        url: l.url.trim(),
      })),
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
    if (!await confirm(`Delete "${resource.title}" from the library?`)) return
    await supabase.from('resources').delete().eq('id', resource.id)
    load()
  }

  // A LIBRARY GETS LONG, AND THEN THIS PAGE IS A SCROLL.
  // Fourteen resources fit on a screen; forty do not, and the one you came to
  // edit is somewhere in the middle of them. Matching on the body as well as
  // the title matters here - an author looking for "the one with the hooks in"
  // is remembering its contents, not its name.
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return resources
    return resources.filter((r) =>
      `${r.title} ${r.category} ${r.body}`.toLowerCase().includes(q))
  }, [resources, search])

  return (
    <div className="page max-w-4xl">
      <PageHeader
        back={{ to: '/resources', label: 'Resources' }}
        title="Manage resources"
        action={<button onClick={() => openEditor(null)} className="btn-primary">+ New resource</button>}
      />

      {resources.length > 6 && (
        <div className="mb-6 max-w-md">
          <div className="relative">
            <Icon name="magnifier" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-smoke" />
            <input
              type="search" className="input !pl-9" placeholder="Search the library…"
              value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search resources"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : resources.length === 0 ? (
        <EmptyState icon={<Icon name="book" className="h-7 w-7" />} title="The library is empty" hint="Start with your brand guidelines and a few video hooks." />
      ) : (
        <div className="space-y-3">
          {shown.length === 0 && (
            <p className="rounded-card border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-smoke">
              Nothing matches &ldquo;{search}&rdquo;.
            </p>
          )}
          {shown.map((r) => (
            <div key={r.id} className="card flex flex-wrap items-center gap-4 !p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{r.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-smoke">
                  <span>{formatDate(r.created_at)}</span>
                  {r.links?.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <span aria-hidden>·</span>
                      <Icon name="link" className="h-3.5 w-3.5" />
                      {r.links.length}
                    </span>
                  )}
                  {r.file_url && (
                    <span className="inline-flex items-center gap-1">
                      <span aria-hidden>·</span>
                      <Icon name="image" className="h-3.5 w-3.5" />
                      Attachment
                    </span>
                  )}
                </p>
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
              {/* Free text only - type whatever category you like, no presets. */}
              <input
                id="res-cat" type="text" required className="input"
                value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Type a category"
              />
            </div>
          </div>
          {/* THE SAME SURFACE AS NOTES AND THE CHAT COMPOSER.
              This was a monospace textarea holding raw markdown, so an author
              typed ** and # and could not see what the reader would get - and
              Ethan's report that "it shows up a weird font" is exactly that: it
              was set in mono because it was code, and it should never have been
              code. Headings, bold and bullets now look like themselves, the box
              grows with what you write, and what is stored is the same portable
              markdown the reader already renders. */}
          <div>
            <p className="label">Content</p>
            <RichToolbar editorRef={editorRef} only={['h2', 'h3', '|', 'bold', 'italic', 'link', '|', 'ul', 'ol']} />
            <RichEditable
              ref={editorRef}
              docId={editing === 'new' ? 'new' : editing?.id || 'new'}
              initialMd={form.body || ''}
              onChangeMd={(md) => setForm((f) => ({ ...f, body: md }))}
              placeholder="Write the tip, guide or instructions here."
              className="min-h-[16rem] rounded-card border border-gray-200 bg-white px-5 py-4 text-[15px] leading-relaxed focus:border-brand/40"
            />
          </div>

          {/* LINKS, PLURAL. A resource is often a pointer rather than a
              document - watch this, then read that - and those addresses were
              being typed into the body as bare text. */}
          <div>
            <p className="label">Links</p>
            <div className="space-y-2">
              {form.links.map((l, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <input
                    type="text" className="input min-w-[9rem] flex-1 !w-auto" placeholder="What is it?"
                    value={l.label}
                    onChange={(e) => setForm((f) => ({
                      ...f, links: f.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                    }))}
                  />
                  <input
                    type="url" className="input min-w-[12rem] flex-[2] !w-auto" placeholder="https://…"
                    value={l.url}
                    onChange={(e) => setForm((f) => ({
                      ...f, links: f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                    }))}
                  />
                  <button
                    type="button" aria-label="Remove link" className="btn-ghost !px-3"
                    onClick={() => setForm((f) => ({ ...f, links: f.links.filter((_, j) => j !== i) }))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn-secondary mt-2 !py-2 text-xs"
              onClick={() => setForm((f) => ({ ...f, links: [...f.links, { label: '', url: '' }] }))}
            >
              + Add a link
            </button>
          </div>

          <div>
            <p className="label">Attachment</p>
            {form.file_url ? (
              <div className="flex items-center gap-3 rounded-xl bg-cloud px-4 py-3 text-sm">
                <span className="flex min-w-0 flex-1 items-center gap-2 truncate"><Icon name="image" className="h-4 w-4 shrink-0 text-smoke" />{decodeURIComponent(form.file_url.split('/').pop())}</span>
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
