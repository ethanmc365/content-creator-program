import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { confirm } from '../lib/confirm'
import { Badge, EmptyState, Modal, PageHeader, SkeletonCards, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { cx, timeAgo } from '../lib/utils'
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
  const [openId, setOpenId] = useState(null)

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

  // THE OFFICIAL PROGRAMME LEADS (12 Oct 2026). Ethan: "no one has actually
  // applied... we can definitely improve the search roles thing and advertise
  // other roles like official creators, etc. much better here." It is a jobs
  // row like any other (so applications land in Admin > Jobs), drawn as the
  // featured card above the list.
  const featured = jobs.find((j) => /official/i.test(j.title))
  const rest = jobs.filter((j) => j !== featured)
  const actionFor = (j, big = false) => {
    const app = applied.get(j.id)
    const st = app ? APPLICANT_STATUS[app.status] || APPLICANT_STATUS.new : null
    if (app) {
      return (
        <div className="flex items-center gap-2">
          <Badge tone={st.tone}><Icon name="check" className="mr-1 inline h-3.5 w-3.5" />{tr(st.label)}</Badge>
          {(app.status === 'new' || app.status === 'reviewing') && (
            <button onClick={() => withdraw(j)} className="btn-ghost !py-2 text-xs">{tr("Withdraw")}</button>
          )}
        </div>
      )
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        {j.apply_url && <a href={j.apply_url} target="_blank" rel="noopener noreferrer" className="btn-secondary">{tr("Apply form ↗")}</a>}
        <button onClick={() => openApply(j)} className={big ? 'btn-primary !px-6' : 'btn-primary'}>
          {big ? tr("I'm interested") : tr("Apply")}
        </button>
      </div>
    )
  }

  return (
    <div className="page max-w-4xl">
      <PageHeader
        title={tr("Roles at Tryp.com")}
        subtitle={tr("We hire from our own community first. Paid programmes and team roles, open to creators like you.")}
        action={isAdmin && <Link to="/admin/jobs" className="btn-primary">{tr("Manage jobs")}</Link>}
      />

      {loading ? (
        <SkeletonCards count={3} />
      ) : (
        // A CSS ENTRANCE, NOT A MOTION ONE (12 Oct 2026). Ethan: "improve the animations on the roles page. Currently, it's
        // laggy when that page loads." The page waited for Reveal's settle signal and then sprang three big blocks in
        // with the motion library on the same frame the list drew. Each block now rises on the compositor, 70ms apart.
        <div className="space-y-8">
          {featured && (
            <article className="animate-rise overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
              <div className="relative overflow-hidden bg-gradient-to-br from-brand to-[#f5853f] px-5 py-6 text-white sm:px-8 sm:py-8">
                <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-y-0" />
                <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.16em] text-white/90">
                  <Icon name="badge" className="h-4 w-4" />{tr('Paid programme')}
                </p>
                <h2 className="mt-2 text-2xl font-extrabold leading-tight sm:text-3xl">{featured.title}</h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/90 sm:text-[15px]">
                  {tr('Join the Tryp.com team as a creator: a monthly fee plus pay for the views your videos earn.')}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-px bg-gray-100 sm:grid-cols-3">
                {[
                  { icon: 'cash', title: tr('Paid every month'), text: tr('A monthly fee plus pay per view, agreed before you start.') },
                  { icon: 'users', title: tr('Part of the team'), text: tr('Your own programme space, briefs, bonuses and team room.') },
                  { icon: 'trophy', title: tr('Earned in challenges'), text: tr('Strong challenge entries are the best way to show us your work.') },
                ].map((b) => (
                  <div key={b.title} className="flex items-start gap-3 bg-white px-5 py-4">
                    <Icon name={b.icon} className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{b.title}</p>
                      <p className="mt-0.5 text-[13px] leading-snug text-smoke">{b.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                <button type="button" onClick={() => setOpenId(openId === featured.id ? null : featured.id)} className="flex items-center gap-1 self-start text-sm font-semibold text-brand">
                  {openId === featured.id ? tr('Hide details') : tr('Read the details')}
                  <Icon name={openId === featured.id ? 'chevronUp' : 'chevronDown'} className="h-4 w-4" />
                </button>
                {actionFor(featured, true)}
              </div>
              {openId === featured.id && (
                <p className="animate-fade-up whitespace-pre-line border-t border-gray-100 px-5 py-5 text-sm leading-relaxed text-smoke sm:px-8">{featured.description}</p>
              )}
            </article>
          )}

          <section className="animate-rise [animation-delay:70ms]">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <Icon name="briefcase" className="h-5 w-5 text-brand" />{tr('Open roles')}
              <span className="text-sm font-medium text-smoke">{rest.length}</span>
            </h2>
            {rest.length === 0 ? (
              <EmptyState
                icon={<Icon name="briefcase" className="h-7 w-7" />}
                title={tr("No open roles right now")}
                hint={tr("We post new positions here first. Keep creating great content and you'll be top of mind.")}
              />
            ) : (
              <div className="space-y-3">
                {rest.map((j, i) => {
                  const open = openId === j.id
                  return (
                    <article key={j.id} className="animate-rise rounded-card border border-gray-100 bg-white p-5 shadow-card" style={{ animationDelay: `${120 + Math.min(i, 6) * 60}ms` }}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-ink">{j.title}</h3>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-smoke">
                            <span className="flex items-center gap-1"><Icon name="briefcase" className="h-3.5 w-3.5 text-brand" />{j.job_type}</span>
                            {j.location && <span className="flex items-center gap-1"><Icon name="pin" className="h-3.5 w-3.5 text-brand" />{j.location}</span>}
                            <span>{tr('Posted {when}', { when: timeAgo(j.created_at) })}</span>
                          </div>
                        </div>
                        {actionFor(j)}
                      </div>
                      <p className={cx('mt-3 whitespace-pre-line text-sm leading-relaxed text-smoke', !open && 'line-clamp-3')}>{j.description}</p>
                      {(j.description || '').length > 180 && (
                        <button type="button" onClick={() => setOpenId(open ? null : j.id)} className="mt-1.5 text-[13px] font-semibold text-brand">
                          {open ? tr('Show less') : tr('Read more')}
                        </button>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          {/* THE OTHER WAYS IN. Not jobs, but the same question: how do I do
              more with Tryp.com. */}
          <section className="grid animate-rise grid-cols-1 gap-3 [animation-delay:160ms] sm:grid-cols-2">
            <Link to="/challenges" className="group flex items-center gap-3 rounded-card border border-gray-100 bg-white p-4 shadow-card transition-transform hoverable:hover:-translate-y-0.5">
              <Icon name="flag" className="h-6 w-6 shrink-0 text-brand" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{tr('Get noticed in challenges')}</span>
                <span className="block text-[13px] text-smoke">{tr('The team picks VIP and official creators from the best entries.')}</span>
              </span>
              <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-400" />
            </Link>
            <Link to="/refer" className="group flex items-center gap-3 rounded-card border border-gray-100 bg-white p-4 shadow-card transition-transform hoverable:hover:-translate-y-0.5">
              <Icon name="userPlus" className="h-6 w-6 shrink-0 text-brand" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{tr('Know someone great?')}</span>
                <span className="block text-[13px] text-smoke">{tr('Refer a creator to the community.')}</span>
              </span>
              <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-400" />
            </Link>
          </section>
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
