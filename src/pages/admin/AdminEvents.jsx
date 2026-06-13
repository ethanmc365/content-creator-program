import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Badge, EmptyState, Modal, PageHeader, Skeleton, Spinner } from '../../components/ui'
import { formatDateTime } from '../../lib/utils'

// Events management: add / edit / delete calendar events.
// (Challenge start/end dates appear on the calendar automatically —
// no need to create those by hand.)
// Preset types, plus a "Custom" escape hatch so admins can invent their own.
const TYPES = [
  { value: 'event', label: '📍 Event' },
  { value: 'qa', label: '🎤 Q&A' },
  { value: 'deadline', label: '⏰ Deadline' },
  { value: 'milestone', label: '🎉 Milestone' },
  { value: 'meetup', label: '🤝 Meet-up' },
  { value: 'workshop', label: '🎓 Workshop' },
]

const emptyForm = { title: '', description: '', date: '', type: 'event', meeting_url: '', customType: false }

export default function AdminEvents() {
  const { user } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | event row
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from('events').select('*').order('date', { ascending: false })
    setEvents(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openEditor(event) {
    setEditing(event ?? 'new')
    if (event) {
      const known = TYPES.some((t) => t.value === event.type)
      setForm({
        ...event,
        date: new Date(event.date).toISOString().slice(0, 16),
        meeting_url: event.meeting_url || '',
        customType: !known,
      })
    } else {
      setForm(emptyForm)
    }
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      date: new Date(form.date).toISOString(),
      type: form.type.trim() || 'event',
      meeting_url: form.meeting_url.trim() || null,
    }
    if (editing === 'new') {
      await supabase.from('events').insert({ ...payload, created_by: user.id })
    } else {
      await supabase.from('events').update(payload).eq('id', editing.id)
    }
    setBusy(false)
    setEditing(null)
    load()
  }

  async function remove(event) {
    if (!confirm(`Delete "${event.title}"?`)) return
    await supabase.from('events').delete().eq('id', event.id)
    load()
  }

  return (
    <div className="page max-w-3xl">
      <PageHeader
        title="Manage events"
        subtitle="Q&As, content days, milestones. Challenge dates show on the calendar automatically."
        action={<button onClick={() => openEditor(null)} className="btn-primary">+ New event</button>}
      />

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : events.length === 0 ? (
        <EmptyState emoji="📅" title="No events yet" hint='Add your first one. A "Live Q&A" is always a hit.' />
      ) : (
        <div className="space-y-4">
          {events.map((ev) => (
            <div key={ev.id} className="card flex flex-wrap items-center gap-4 !p-5">
              <span className="text-2xl" aria-hidden>{TYPES.find((t) => t.value === ev.type)?.label.split(' ')[0]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{ev.title}</p>
                <p className="text-xs text-smoke">{formatDateTime(ev.date)}</p>
                {ev.description && <p className="mt-1 text-xs text-smoke line-clamp-1">{ev.description}</p>}
              </div>
              <Badge tone={new Date(ev.date) > new Date() ? 'light' : 'grey'}>
                {new Date(ev.date) > new Date() ? 'Upcoming' : 'Past'}
              </Badge>
              <div className="flex gap-2">
                <button onClick={() => openEditor(ev)} className="btn-secondary !py-2 text-xs">Edit</button>
                <button onClick={() => remove(ev)} className="btn-danger !py-2 text-xs">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New event' : 'Edit event'}>
        <form onSubmit={save} className="space-y-5">
          <div>
            <label htmlFor="ev-title" className="label">Title</label>
            <input id="ev-title" type="text" required className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder='e.g. "Live Q&A with Ethan"' />
          </div>
          <div>
            <label htmlFor="ev-desc" className="label">Description <span className="font-normal text-smoke">(optional)</span></label>
            <textarea id="ev-desc" rows={3} className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="ev-date" className="label">Date & time</label>
              <input id="ev-date" type="datetime-local" required className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label htmlFor="ev-type" className="label">Type</label>
              {form.customType ? (
                <input
                  id="ev-type" type="text" required className="input"
                  value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  placeholder="Custom type"
                />
              ) : (
                <select
                  id="ev-type" className="input" value={form.type}
                  onChange={(e) => {
                    if (e.target.value === '__custom') setForm({ ...form, customType: true, type: '' })
                    else setForm({ ...form, type: e.target.value })
                  }}
                >
                  {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  <option value="__custom">+ Custom type…</option>
                </select>
              )}
            </div>
          </div>
          <div>
            <label htmlFor="ev-meet" className="label">
              Meeting link <span className="font-normal text-smoke">(optional, e.g. Google Meet for a live event)</span>
            </label>
            <input id="ev-meet" type="url" className="input" value={form.meeting_url} onChange={(e) => setForm({ ...form, meeting_url: e.target.value })} placeholder="https://meet.google.com/…" />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner /> : editing === 'new' ? 'Add event' : 'Save changes'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
