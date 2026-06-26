import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Skeleton, EmptyState, Badge, Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import { parseDateTime, formatDateTime } from '../../lib/utils'

// Compose an announcement now and have it auto-post to #announcements at a set
// time (a cron does the posting; everyone gets notified, same as a live post).
export default function AdminScheduledAnnouncements() {
  const { user } = useAuth()
  const [list, setList] = useState(null)
  const [body, setBody] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [timeStr, setTimeStr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    const { data } = await supabase.from('scheduled_announcements').select('*').order('scheduled_for', { ascending: false })
    setList(data ?? [])
  }
  useEffect(() => { load() }, [])

  async function schedule(e) {
    e.preventDefault()
    setErr('')
    if (!body.trim()) return setErr('Write an announcement first.')
    const iso = parseDateTime(dateStr, timeStr)
    if (!iso) return setErr('Enter the date as DD/MM/YYYY and time as HH:MM (24h).')
    if (new Date(iso) <= new Date()) return setErr('Pick a time in the future.')
    setBusy(true)
    const { error } = await supabase.from('scheduled_announcements').insert({ body: body.trim(), scheduled_for: iso, created_by: user.id })
    setBusy(false)
    if (error) return setErr(error.message)
    setBody(''); setDateStr(''); setTimeStr('')
    load()
  }

  async function cancel(a) {
    if (!confirm('Cancel this scheduled announcement?')) return
    await supabase.from('scheduled_announcements').delete().eq('id', a.id)
    load()
  }

  return (
    <div className="page max-w-3xl">
      <PageHeader title="Scheduled announcements" subtitle="Write now, post automatically later. Posts to #announcements and notifies everyone." />

      <form onSubmit={schedule} className="card mb-8 space-y-4">
        <div>
          <label htmlFor="ann-body" className="label">Announcement</label>
          <textarea id="ann-body" rows={4} className="input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What do you want to tell the community?" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ann-date" className="label">Date</label>
            <input id="ann-date" type="text" inputMode="numeric" className="input" value={dateStr} onChange={(e) => setDateStr(e.target.value)} placeholder="DD/MM/YYYY" />
          </div>
          <div>
            <label htmlFor="ann-time" className="label">Time</label>
            <input id="ann-time" type="text" inputMode="numeric" className="input" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} placeholder="HH:MM" />
          </div>
        </div>
        {err && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={busy} className="btn-primary">{busy ? <Spinner /> : 'Schedule announcement'}</button>
        </div>
      </form>

      {list === null ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState icon={<Icon name="megaphone" className="h-7 w-7" />} title="Nothing scheduled" hint="Announcements you schedule will appear here until they post." />
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
          {list.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm">{a.body}</p>
                <p className="mt-1 text-xs text-smoke">
                  {a.posted_at ? `Posted ${formatDateTime(a.posted_at)}` : `Scheduled for ${formatDateTime(a.scheduled_for)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={a.posted_at ? 'green' : 'amber'}>{a.posted_at ? 'posted' : 'scheduled'}</Badge>
                {!a.posted_at && <button onClick={() => cancel(a)} className="btn-ghost !px-2 !py-1 text-xs text-red-600">Cancel</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
