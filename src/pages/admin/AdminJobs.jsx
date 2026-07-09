import { useEffect, useState } from 'react'
import { confirm } from '../../lib/confirm'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Badge, EmptyState, Modal, PageHeader, Skeleton, Spinner } from '../../components/ui'
import { formatDate } from '../../lib/utils'

// Manage hiring posts: create / edit / open / close roles.
// Opening a role notifies every creator (DB trigger).
const JOB_TYPES = ['Permanent', 'Contract', 'Freelance', 'Part-time', 'Internship']
const emptyForm = { title: '', description: '', location: '', job_type: 'Permanent', apply_url: '', status: 'open' }

export default function AdminJobs() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | job
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from('jobs').select('*').order('created_at', { ascending: false })
    setJobs(data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function openEditor(job) {
    setEditing(job ?? 'new')
    setForm(job ? { ...job, apply_url: job.apply_url || '' } : emptyForm)
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      location: form.location.trim(),
      job_type: form.job_type,
      apply_url: form.apply_url.trim() || null,
      status: form.status,
    }
    if (editing === 'new') await supabase.from('jobs').insert({ ...payload, created_by: user.id })
    else await supabase.from('jobs').update(payload).eq('id', editing.id)
    setBusy(false)
    setEditing(null)
    load()
  }

  async function toggleStatus(job) {
    await supabase.from('jobs').update({ status: job.status === 'open' ? 'closed' : 'open' }).eq('id', job.id)
    load()
  }

  async function remove(job) {
    if (!await confirm(`Delete "${job.title}"?`)) return
    await supabase.from('jobs').delete().eq('id', job.id)
    load()
  }

  return (
    <div className="page max-w-3xl">
      <PageHeader
        title="Manage jobs"
        subtitle="Post roles you're hiring for. Opening a role notifies every creator."
        action={<button onClick={() => openEditor(null)} className="btn-primary">+ New job</button>}
      />

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : jobs.length === 0 ? (
        <EmptyState emoji="💼" title="No jobs posted yet" hint="Post your first role. Your community is the best place to hire from." />
      ) : (
        <div className="space-y-4">
          {jobs.map((j) => (
            <div key={j.id} className="card !p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{j.title}</h2>
                    <Badge tone={j.status === 'open' ? 'green' : 'grey'}>{j.status}</Badge>
                    <Badge tone="light">{j.job_type}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-smoke">{j.location || 'No location'} · posted {formatDate(j.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleStatus(j)} className="btn-secondary !py-2 text-xs">{j.status === 'open' ? 'Close' : 'Reopen'}</button>
                  <button onClick={() => openEditor(j)} className="btn-secondary !py-2 text-xs">Edit</button>
                  <button onClick={() => remove(j)} className="btn-danger !py-2 text-xs">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New job' : 'Edit job'} wide>
        <form onSubmit={save} className="space-y-5">
          <div>
            <label htmlFor="j-title" className="label">Title</label>
            <input id="j-title" type="text" required className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Scotland Country Manager" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="j-loc" className="label">Location</label>
              <input id="j-loc" type="text" className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Edinburgh / Remote" />
            </div>
            <div>
              <label htmlFor="j-type" className="label">Type</label>
              <select id="j-type" className="input" value={form.job_type} onChange={(e) => setForm({ ...form, job_type: e.target.value })}>
                {JOB_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="j-desc" className="label">Description</label>
            <textarea id="j-desc" rows={7} required className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What's the role? What are you looking for?" />
          </div>
          <div>
            <label htmlFor="j-url" className="label">Application link <span className="font-normal text-smoke">(optional, leave blank to let creators apply via DM)</span></label>
            <input id="j-url" type="url" className="input" value={form.apply_url} onChange={(e) => setForm({ ...form, apply_url: e.target.value })} placeholder="https://…" />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner /> : editing === 'new' ? 'Post job' : 'Save changes'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
