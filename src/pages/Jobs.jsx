import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Badge, EmptyState, PageHeader, SkeletonCards } from '../components/ui'
import { timeAgo } from '../lib/utils'

// Jobs board: paid roles the Tryp.com team is hiring for.
// Creators browse and apply (external link, or DM an admin).
export default function Jobs() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

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

  // "Apply via DM" → open a conversation with the first admin (program lead).
  async function applyByDm(job) {
    const { data: admin } = await supabase
      .from('profiles').select('id').eq('is_admin', true).order('created_at').limit(1).maybeSingle()
    if (!admin) return
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
        body: `Hi! I'd love to apply for the "${job.title}" role. Here's a bit about me…`,
      })
      navigate(`/messages/${convoId}`)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Jobs at Tryp.com"
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
                {j.apply_url ? (
                  <a href={j.apply_url} target="_blank" rel="noopener noreferrer" className="btn-primary">Apply ↗</a>
                ) : (
                  <button onClick={() => applyByDm(j)} className="btn-primary">Apply via DM</button>
                )}
              </div>
              <p className="mt-5 whitespace-pre-line leading-relaxed text-smoke">{j.description}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
