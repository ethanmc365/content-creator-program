import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { confirm } from '../../lib/confirm'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Badge, CopyButton, EmptyState, Modal, PageHeader, Skeleton, Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import { formatDate, timeAgo } from '../../lib/utils'

// Manage hiring posts: create / edit / open / close roles, AND review the
// applications each role has received. Opening a role notifies every creator.
const JOB_TYPES = ['Permanent', 'Contract', 'Freelance', 'Part-time', 'Internship']
const emptyForm = { title: '', description: '', location: '', job_type: 'Permanent', apply_url: '', status: 'open' }

// The application pipeline the team moves an applicant through.
const APP_STATUSES = ['new', 'reviewing', 'contacted', 'hired', 'declined']
const STATUS_TONE = { new: 'amber', reviewing: 'light', contacted: 'brand', hired: 'green', declined: 'grey' }

export default function AdminJobs() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [apps, setApps] = useState([]) // all applications, each with its profile joined
  const [emails, setEmails] = useState({}) // creator_id -> email (admin RPC)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | job
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [openJob, setOpenJob] = useState(null) // job_id whose applicants are expanded

  async function load() {
    const [{ data: jobRows }, { data: appRows }, { data: emailRows }] = await Promise.all([
      supabase.from('jobs').select('*').order('created_at', { ascending: false }),
      supabase.from('job_applications').select('*, profiles:creator_id(id, name, photo_url)').order('created_at', { ascending: false }),
      supabase.rpc('admin_list_emails'),
    ])
    setJobs(jobRows ?? [])
    setApps(appRows ?? [])
    setEmails(Object.fromEntries((emailRows ?? []).map((r) => [r.id, r.email])))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Applications grouped by job, newest first.
  const appsByJob = useMemo(() => {
    const map = {}
    for (const a of apps) (map[a.job_id] ||= []).push(a)
    return map
  }, [apps])

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
    if (!await confirm(`Delete "${job.title}"? This also removes its applications.`)) return
    await supabase.from('jobs').delete().eq('id', job.id)
    load()
  }

  // Move an applicant along the pipeline (optimistic).
  async function setAppStatus(app, status) {
    setApps((list) => list.map((a) => (a.id === app.id ? { ...a, status } : a)))
    await supabase.from('job_applications').update({ status }).eq('id', app.id)
  }

  // Open (or create) the 1:1 conversation with an applicant and jump into it.
  // Marks them "contacted" so the pipeline reflects that the team reached out.
  async function dm(app) {
    const creatorId = app.creator_id
    if (app.status === 'new' || app.status === 'reviewing') setAppStatus(app, 'contacted')
    const { data: existing } = await supabase
      .from('conversations').select('id')
      .or(`and(participant_a.eq.${user.id},participant_b.eq.${creatorId}),and(participant_a.eq.${creatorId},participant_b.eq.${user.id})`)
      .maybeSingle()
    let convoId = existing?.id
    if (!convoId) {
      const { data: created } = await supabase
        .from('conversations').insert({ participant_a: user.id, participant_b: creatorId }).select('id').single()
      convoId = created?.id
    }
    if (convoId) navigate(`/messages/${convoId}`)
  }

  const totalOpen = jobs.filter((j) => j.status === 'open').length

  return (
    <div className="page max-w-4xl">
      <PageHeader
        title="Manage jobs"
        subtitle={`Post roles and review who's applied. ${totalOpen} role${totalOpen === 1 ? '' : 's'} open · ${apps.length} application${apps.length === 1 ? '' : 's'} in total.`}
        action={<button onClick={() => openEditor(null)} className="btn-primary">+ New job</button>}
      />

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : jobs.length === 0 ? (
        <EmptyState icon={<Icon name="briefcase" className="h-7 w-7" />} title="No jobs posted yet" hint="Post your first role. Your community is the best place to hire from." />
      ) : (
        <div className="space-y-5">
          {jobs.map((j) => {
            const jobApps = appsByJob[j.id] || []
            const isOpen = openJob === j.id
            const newCount = jobApps.filter((a) => a.status === 'new').length
            return (
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
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => toggleStatus(j)} className="btn-secondary !py-2 text-xs">{j.status === 'open' ? 'Close' : 'Reopen'}</button>
                    <button onClick={() => openEditor(j)} className="btn-secondary !py-2 text-xs">Edit</button>
                    <button onClick={() => remove(j)} className="btn-danger !py-2 text-xs">Delete</button>
                  </div>
                </div>

                {/* Applications toggle */}
                <button
                  onClick={() => setOpenJob(isOpen ? null : j.id)}
                  className="mt-4 flex w-full items-center justify-between rounded-xl border border-gray-100 bg-cloud/40 px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-cloud"
                >
                  <span className="flex items-center gap-2">
                    <Icon name="users" className="h-4 w-4 text-brand" />
                    {jobApps.length} applicant{jobApps.length === 1 ? '' : 's'}
                    {newCount > 0 && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">{newCount} new</span>}
                  </span>
                  <Icon name="chevronRight" className={`h-4 w-4 text-smoke transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </button>

                {isOpen && (
                  jobApps.length === 0 ? (
                    <p className="mt-4 rounded-xl bg-cloud/50 px-4 py-6 text-center text-sm text-smoke">No applications yet.</p>
                  ) : (
                    <div className="mt-4 space-y-4">
                      {jobApps.map((a) => {
                        const email = emails[a.creator_id]
                        return (
                          <div key={a.id} className="rounded-card border border-gray-100 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <button onClick={() => navigate(`/profile/${a.creator_id}`)} className="flex min-w-0 items-center gap-3 text-left group">
                                <Avatar src={a.profiles?.photo_url} name={a.profiles?.name} size="sm" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold group-hover:text-brand">{a.profiles?.name || 'A creator'}</p>
                                  <p className="text-xs text-smoke">Applied {timeAgo(a.created_at)}</p>
                                </div>
                              </button>
                              <div className="flex items-center gap-2">
                                <select
                                  value={a.status}
                                  onChange={(e) => setAppStatus(a, e.target.value)}
                                  aria-label={`Status for ${a.profiles?.name || 'applicant'}`}
                                  className="input !w-auto !py-1.5 text-xs"
                                >
                                  {APP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                              </div>
                            </div>

                            <p className="mt-3 whitespace-pre-line rounded-xl bg-cloud/50 px-4 py-3 text-sm leading-relaxed text-ink/90">{a.pitch}</p>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <button onClick={() => dm(a)} className="btn-secondary !py-2 text-xs">
                                <Icon name="chat" className="mr-1 inline h-3.5 w-3.5" />DM {a.profiles?.name?.split(' ')[0] || 'them'}
                              </button>
                              {email ? (
                                <a
                                  href={`mailto:${email}?subject=${encodeURIComponent(`Your application for "${j.title}"`)}`}
                                  onClick={() => { if (a.status === 'new' || a.status === 'reviewing') setAppStatus(a, 'contacted') }}
                                  className="btn-secondary !py-2 text-xs"
                                >
                                  <Icon name="envelope" className="mr-1 inline h-3.5 w-3.5" />Email
                                </a>
                              ) : (
                                <span className="text-xs text-smoke">No email on file</span>
                              )}
                              {email && (
                                <span className="inline-flex items-center gap-1 text-xs text-smoke">
                                  {email}
                                  <CopyButton value={email} label="Copy email" />
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                )}
              </div>
            )
          })}
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
            <label htmlFor="j-url" className="label">External application link <span className="font-normal text-smoke">(optional - creators can always apply in-app)</span></label>
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
