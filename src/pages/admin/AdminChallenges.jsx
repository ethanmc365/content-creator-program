import { useEffect, useState } from 'react'
import { confirm, notice } from '../../lib/confirm'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Badge, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import { formatDate } from '../../lib/utils'

// Challenge management: every challenge with its lifecycle controls.
// Lifecycle: draft → active → ended → archived.
const STATUS_TONE = { draft: 'grey', active: 'brand', ended: 'amber', archived: 'grey' }

export default function AdminChallenges() {
  const [challenges, setChallenges] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await supabase
      .from('challenges')
      .select('*, submissions(count)')
      .order('created_at', { ascending: false })
    setChallenges(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const [deleting, setDeleting] = useState(null)
  const [savedVouchers, setSavedVouchers] = useState(null)

  // Record how many participation vouchers were actually handed out for a
  // challenge, so analytics and the books stay accurate.
  async function saveVouchers(challenge, value) {
    const n = Math.max(0, parseInt(value, 10) || 0)
    if (n === (challenge.vouchers_given ?? 0)) return
    const { error } = await supabase.from('challenges').update({ vouchers_given: n }).eq('id', challenge.id)
    if (error) { notice(`Could not save: ${error.message}`); return }
    setChallenges((prev) => prev.map((c) => (c.id === challenge.id ? { ...c, vouchers_given: n } : c)))
    setSavedVouchers(challenge.id)
    setTimeout(() => setSavedVouchers((cur) => (cur === challenge.id ? null : cur)), 2000)
  }

  async function setStatus(challenge, status) {
    const messages = {
      active: `Publish "${challenge.title}"? Every creator will be notified that it's live.`,
      ended: `Close "${challenge.title}"? Creators will no longer be able to submit.`,
      archived: `Archive "${challenge.title}"? It moves to the past-challenges archive.`,
    }
    if (!await confirm(messages[status])) return
    await supabase.from('challenges').update({ status }).eq('id', challenge.id)
    load()
  }

  // Permanently delete a challenge (admins only, via a SECURITY DEFINER RPC).
  // FK cascades remove its submissions, results and reminder records; any linked
  // rewards keep their history with the challenge link cleared. Irreversible.
  async function remove(challenge) {
    const entries = challenge.submissions?.[0]?.count ?? 0
    const warn = `Permanently delete "${challenge.title}"?\n\nThis also deletes ${entries} submission${entries === 1 ? '' : 's'} and all its results. This cannot be undone.`
    if (!await confirm(warn)) return
    setDeleting(challenge.id)
    const { error } = await supabase.rpc('admin_delete_challenge', { target: challenge.id })
    setDeleting(null)
    if (error) { notice(`Could not delete: ${error.message}`); return }
    setChallenges((prev) => prev.filter((c) => c.id !== challenge.id))
  }

  return (
    <div className="page">
      <PageHeader
        title="Manage challenges"
        subtitle="Create, publish, close and archive. One live challenge at a time works best."
        action={<Link to="/admin/challenges/new" className="btn-primary">+ New challenge</Link>}
      />

      {loading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : challenges.length === 0 ? (
        <EmptyState
          emoji="🏁"
          title="No challenges yet"
          hint="Create your first challenge. Set the brief, dates and prizes, then publish."
          action={<Link to="/admin/challenges/new" className="btn-primary">Create a challenge</Link>}
        />
      ) : (
        <div className="space-y-5">
          {challenges.map((c) => (
            <div key={c.id} className="card !p-6 sm:!p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{c.title}</h2>
                    <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-smoke">
                    {formatDate(c.start_date)} → {formatDate(c.end_date)} · {c.submissions?.[0]?.count ?? 0} entries
                  </p>
                </div>

                {/* Lifecycle controls */}
                <div className="flex flex-wrap gap-2">
                  {c.status === 'draft' && (
                    <button onClick={() => setStatus(c, 'active')} className="btn-primary !py-2 text-xs">Publish</button>
                  )}
                  {c.status === 'active' && (
                    <button onClick={() => setStatus(c, 'ended')} className="btn-secondary !py-2 text-xs">⏹ Close entries</button>
                  )}
                  {c.status === 'ended' && (
                    <button onClick={() => setStatus(c, 'archived')} className="btn-secondary !py-2 text-xs">📦 Archive</button>
                  )}
                </div>
              </div>

              {/* Participation vouchers actually handed out, tracked for the
                  records + analytics. Saves on blur. */}
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-50 pt-5">
                <label htmlFor={`vouchers-${c.id}`} className="text-xs font-medium text-smoke">Vouchers given out</label>
                <input
                  id={`vouchers-${c.id}`}
                  type="number" min="0"
                  className="input !w-24 !py-1.5 text-sm"
                  defaultValue={c.vouchers_given ?? 0}
                  onBlur={(e) => saveVouchers(c, e.target.value)}
                />
                {savedVouchers === c.id && <span className="text-xs font-medium text-green-600">Saved ✓</span>}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-50 pt-4">
                <Link to={`/challenges/${c.id}`} className="btn-ghost !py-2 text-xs">View page</Link>
                <Link to={`/admin/challenges/${c.id}/edit`} className="btn-secondary !py-2 text-xs">✏️ Edit</Link>
                <Link to={`/admin/challenges/${c.id}/results`} className="btn-secondary !py-2 text-xs">📊 Results & leaderboard</Link>
                <button
                  onClick={() => remove(c)}
                  disabled={deleting === c.id}
                  className="btn-ghost ml-auto !py-2 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting === c.id ? 'Deleting…' : '🗑 Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
