import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Skeleton, EmptyState, Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import { timeAgo } from '../../lib/utils'

// "What's new" changelog. Admins announce a new feature/improvement here and it
// posts to #announcements, which fires the existing on_announcement trigger ->
// every creator gets a bell notification (+ push/email per prefs). No new
// plumbing: it rides the announcement pipeline we already have.
//
// Each post is tagged with MARKER so we can list past updates as a changelog.
const MARKER = '✨ What’s new'

export default function AdminWhatsNew() {
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)
  const [history, setHistory] = useState(null)

  async function load() {
    // Pull recent announcements and keep just the "What's new" ones.
    const { data } = await supabase
      .from('messages')
      .select('id, body, created_at')
      .eq('channel', 'announcements')
      .eq('deleted', false)
      .order('created_at', { ascending: false })
      .limit(60)
    setHistory((data ?? []).filter((m) => m.body?.startsWith(MARKER)))
  }
  useEffect(() => { load() }, [])

  async function post(e) {
    e.preventDefault()
    setErr(''); setOk(false)
    if (!title.trim()) return setErr('Give the update a short headline.')
    if (!details.trim()) return setErr('Add a sentence on what changed.')
    setBusy(true)
    // Body is what shows in the bell preview and the #announcements channel.
    // "What's new" sits on its own line as a header (no em dash), the headline
    // on the next line, then the detail - cleaner in both the bell and the chat.
    const body = `${MARKER}\n${title.trim()}\n\n${details.trim()}`
    const { error } = await supabase.from('messages').insert({ channel: 'announcements', sender_id: user.id, body })
    setBusy(false)
    if (error) return setErr(error.message)
    setTitle(''); setDetails(''); setOk(true)
    load()
  }

  return (
    <div className="page max-w-3xl">
      <PageHeader
        title="What's new"
        subtitle="Announce a new feature or improvement. It posts to #announcements, lands in every creator's notification bell, and emails them too (unless they've turned off announcement emails)."
      />

      <form onSubmit={post} className="card mb-8 space-y-4">
        <div>
          <label htmlFor="wn-title" className="label">Headline</label>
          <input
            id="wn-title" type="text" className="input" value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Video thumbnails on submissions"
            maxLength={80}
          />
        </div>
        <div>
          <label htmlFor="wn-details" className="label">What changed</label>
          <textarea
            id="wn-details" rows={3} className="input" value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="A sentence or two the community will see. Keep it friendly and short."
          />
        </div>

        {/* Live preview of the bell/announcement copy. */}
        <div className="rounded-xl border border-brand/20 bg-brand-tint/40 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand"><Icon name="bell" className="h-3.5 w-3.5" /> Preview</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">{MARKER}</p>
          {title.trim() && <p className="mt-1 text-sm font-semibold text-ink">{title.trim()}</p>}
          {details.trim() && <p className="mt-1 whitespace-pre-line text-sm text-smoke">{details.trim()}</p>}
        </div>

        {err && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>}
        {ok && <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">Posted. Every creator has been notified in their bell and by email.</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={busy} className="btn-primary">{busy ? <Spinner /> : 'Announce to everyone'}</button>
        </div>
      </form>

      <h2 className="mb-3 text-lg font-semibold">Recent updates</h2>
      {history === null ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : history.length === 0 ? (
        <EmptyState icon={<Icon name="bell" className="h-7 w-7" />} title="No updates yet" hint="Feature announcements you post will show here as a running changelog." />
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
          {history.map((m) => {
            // Strip the marker for a cleaner changelog line.
            const clean = m.body.replace(MARKER, '').replace(/^\s*[—-]\s*/, '').trim()
            const [head, ...rest] = clean.split('\n')
            return (
              <div key={m.id} className="border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">{head}</p>
                  <span className="shrink-0 text-xs text-smoke">{timeAgo(m.created_at)}</span>
                </div>
                {rest.join('\n').trim() && <p className="mt-1 whitespace-pre-line text-sm text-smoke">{rest.join('\n').trim()}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
