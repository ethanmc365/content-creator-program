import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Badge, EmptyState, Modal, PageHeader, SkeletonCards, Spinner } from '../components/ui'
import { timeAgo } from '../lib/utils'

// Jobs board: paid roles the Tryp.com team is hiring for.
// Creators browse and register interest, which sends an automatic DM to the
// team with the role and a short note on why they're suited.
export default function Jobs() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  // "Register interest" modal
  const [interestJob, setInterestJob] = useState(null)
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    supabase
      .from('jobs')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setJobs(data ?? [])
        setLoading(false)
      })
  }, [])

  function openInterest(job) {
    setInterestJob(job)
    setReason('')
  }

  // Send an automatic DM to the program lead (first admin) with the role + reason.
  async function submitInterest(e) {
    e.preventDefault()
    if (!reason.trim()) return
    setSending(true)
    const { data: admin } = await supabase
      .from('profiles').select('id').eq('is_admin', true).order('created_at').limit(1).maybeSingle()
    if (!admin) { setSending(false); return }

    const { data: existing } = await supabase
      .from('conversations').select('id')
      .or(`and(participant_a.eq.${user.id},participant_b.eq.${admin.id}),and(participant_a.eq.${admin.id},participant_b.eq.${user.id})`)
      .maybeSingle()
    let convoId = existing?.id
    if (!convoId) {
      const { data: created } = await supabase
        .from('conversations').insert({ participant_a: user.id, participant_b: admin.id }).select('id').single()
      convoId = created?.id
    }
    if (convoId) {
      await supabase.from('direct_messages').insert({
        conversation_id: convoId, sender_id: user.id, recipient_id: admin.id,
        body: `👋 I'd like to register my interest in the "${interestJob.title}" role.\n\nWhy I'd be a great fit:\n${reason.trim()}`,
      })
    }
    setSending(false)
    setInterestJob(null)
    if (convoId) navigate(`/messages/${convoId}`)
  }

  return (
    <div className="page">
      <PageHeader
        title="Search roles"
        subtitle="We hire from our own community first. Here are the roles we're currently looking to fill."
        action={isAdmin && <Link to="/admin/jobs" className="btn-primary">Manage jobs</Link>}
      />

      {loading ? (
        <SkeletonCards count={3} />
      ) : jobs.length === 0 ? (
        <EmptyState
          emoji="💼"
          title="No open roles right now"
          hint="We post new positions here first. Keep creating great content and you'll be top of mind."
        />
      ) : (
        <div className="space-y-6">
          {jobs.map((j) => (
            <article key={j.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{j.title}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-smoke">
                    <Badge tone="light">{j.job_type}</Badge>
                    {j.location && <span>📍 {j.location}</span>}
                    <span>Posted {timeAgo(j.created_at)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {j.apply_url && (
                    <a href={j.apply_url} target="_blank" rel="noopener noreferrer" className="btn-secondary">Apply form ↗</a>
                  )}
                  <button onClick={() => openInterest(j)} className="btn-primary">Register interest</button>
                </div>
              </div>
              <p className="mt-5 whitespace-pre-line leading-relaxed text-smoke">{j.description}</p>
            </article>
          ))}
        </div>
      )}

      {/* Register interest modal */}
      <Modal open={!!interestJob} onClose={() => setInterestJob(null)} title={`Register interest: ${interestJob?.title ?? ''}`}>
        <form onSubmit={submitInterest} className="space-y-5">
          <p className="text-sm text-smoke">
            Tell the team why you'd be a great fit. We'll send this straight to them as a direct message,
            and they'll reply in your inbox.
          </p>
          <div>
            <label htmlFor="reason" className="label">Why are you suited to this role?</label>
            <textarea
              id="reason" rows={5} required className="input"
              value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Your experience, your content niche, your reach, why you're excited…"
            />
          </div>
          <button type="submit" disabled={sending} className="btn-primary w-full">
            {sending ? <Spinner /> : 'Send to the team →'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
