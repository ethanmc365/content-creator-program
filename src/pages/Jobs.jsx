import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { confirm } from '../lib/confirm'
import { Badge, EmptyState, Modal, PageHeader, SkeletonCards, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { timeAgo } from '../lib/utils'
import { useT } from '../lib/i18n'

// How the applicant sees their application move through the admin's pipeline.
const APPLICANT_STATUS = {
  new: { label: 'Application sent', tone: 'light' },
  reviewing: { label: 'Under review', tone: 'amber' },
  contacted: { label: 'The team reached out', tone: 'green' },
  hired: { label: 'Hired', tone: 'green' },
  declined: { label: 'Not this time', tone: 'grey' },
}

// Jobs board: paid roles the Tryp.com team is hiring for. Creators apply with a
// short pitch, which is stored and reviewed on the admin jobs page (the team
// then reaches out by email or DM). No more fire-and-forget auto DMs.
export default function Jobs() {
  const tr = useT()
  const { user, isAdmin } = useAuth()
  const [jobs, setJobs] = useState([])
  const [applied, setApplied] = useState(new Map()) // job_id -> { id, status }
  const [loading, setLoading] = useState(true)

  // "Apply" modal
  const [applyJob, setApplyJob] = useState(null)
  const [pitch, setPitch] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const [{ data: jobRows }, { data: apps }] = await Promise.all([
      supabase.from('jobs').select('*').eq('status', 'open').order('created_at', { ascending: false }),
      supabase.from('job_applications').select('id, job_id, status').eq('creator_id', user.id),
    ])
    setJobs(jobRows ?? [])
    setApplied(new Map((apps ?? []).map((a) => [a.job_id, a])))
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openApply(job) { setApplyJob(job); setPitch(''); setError('') }

  async function submitApply(e) {
    e.preventDefault()
    if (!pitch.trim()) { setError("Add a short note on why you'd be a great fit."); return }
    setSending(true)
    const { error: insErr } = await supabase.from('job_applications').insert({
      job_id: applyJob.id, creator_id: user.id, pitch: pitch.trim(),
    })
    setSending(false)
    if (insErr) { setError('Could not send your application. Please try again.'); return }
    setApplyJob(null)
    load()
  }

  async function withdraw(job) {
    if (!await confirm(`Withdraw your application for "${job.title}"?`)) return
    setApplied((m) => { const n = new Map(m); n.delete(job.id); return n })
    await supabase.from('job_applications').delete().eq('job_id', job.id).eq('creator_id', user.id)
  }

  return (
    <div className="page">
      <PageHeader
        title={tr("Search roles")}
        subtitle="We hire from our own community first. Here are the roles we're currently looking to fill."
        action={isAdmin && <Link to="/admin/jobs" className="btn-primary">{tr("Manage jobs")}</Link>}
      />

      {loading ? (
        <SkeletonCards count={3} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<Icon name="briefcase" className="h-7 w-7" />}
          title={tr("No open roles right now")}
          hint={tr("We post new positions here first. Keep creating great content and you'll be top of mind.")}
        />
      ) : (
        <div className="space-y-6">
          {jobs.map((j) => {
            const app = applied.get(j.id)
            const st = app ? APPLICANT_STATUS[app.status] || APPLICANT_STATUS.new : null
            return (
              <article key={j.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">{j.title}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-smoke">
                      <Badge tone="light">{j.job_type}</Badge>
                      {j.location && <span className="flex items-center gap-1"><Icon name="pin" className="h-3.5 w-3.5" />{j.location}</span>}
                      <span>Posted {timeAgo(j.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {j.apply_url && (
                      <a href={j.apply_url} target="_blank" rel="noopener noreferrer" className="btn-secondary">{tr("Apply form ↗")}</a>
                    )}
                    {app ? (
                      <div className="flex items-center gap-2">
                        <Badge tone={st.tone}><Icon name="check" className="mr-1 inline h-3.5 w-3.5" />{st.label}</Badge>
                        {(app.status === 'new' || app.status === 'reviewing') && (
                          <button onClick={() => withdraw(j)} className="btn-ghost !py-2 text-xs">{tr("Withdraw")}</button>
                        )}
                      </div>
                    ) : (
                      <button onClick={() => openApply(j)} className="btn-primary">{tr("Apply")}</button>
                    )}
                  </div>
                </div>
                <p className="mt-5 whitespace-pre-line leading-relaxed text-smoke">{j.description}</p>
              </article>
            )
          })}
        </div>
      )}

      {/* Apply modal */}
      <Modal open={!!applyJob} onClose={() => setApplyJob(null)} title={`Apply: ${applyJob?.title ?? ''}`}>
        <form onSubmit={submitApply} className="space-y-5">
          <p className="text-sm text-smoke">
            {tr("Tell the team why you'd be a great fit. Your application is saved for the team to review, and they'll reach out by email or a direct message. You can withdraw any time before they respond.")}
          </p>
          <div>
            <label htmlFor="pitch" className="label">{tr("Why are you suited to this role?")}</label>
            <textarea
              id="pitch" rows={6} required className="input"
              value={pitch} onChange={(e) => setPitch(e.target.value)}
              placeholder={tr("Your experience, your content niche, your reach, why you're excited…")}
            />
          </div>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={sending} className="btn-primary w-full">
            {sending ? <Spinner /> : 'Submit application'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
