import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import { formatDate } from '../../lib/utils'

const STATUSES = [
  { key: 'new', label: 'New', tone: 'amber' },
  { key: 'planned', label: 'Planned', tone: 'light' },
  { key: 'in_progress', label: 'In progress', tone: 'brand' },
  { key: 'done', label: 'Done', tone: 'green' },
  { key: 'declined', label: 'Not planned', tone: 'grey' },
]
const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]))

export default function AdminFeedback() {
  const [items, setItems] = useState([])
  const [people, setPeople] = useState({})
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [notes, setNotes] = useState({}) // id -> draft admin_note

  async function load() {
    const { data: fb } = await supabase.from('feedback').select('*').order('created_at', { ascending: false })
    const list = fb ?? []
    setItems(list)
    const ids = [...new Set(list.map((f) => f.creator_id))]
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name, photo_url').in('id', ids)
      setPeople(Object.fromEntries((profs ?? []).map((p) => [p.id, p])))
    }
    setNotes(Object.fromEntries(list.map((f) => [f.id, f.admin_note ?? ''])))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function setStatus(item, status) {
    await supabase.from('feedback').update({ status, updated_at: new Date().toISOString() }).eq('id', item.id)
    setItems((prev) => prev.map((f) => (f.id === item.id ? { ...f, status } : f)))
  }

  async function saveNote(item) {
    const admin_note = (notes[item.id] ?? '').trim()
    await supabase.from('feedback').update({ admin_note, updated_at: new Date().toISOString() }).eq('id', item.id)
    setItems((prev) => prev.map((f) => (f.id === item.id ? { ...f, admin_note } : f)))
  }

  const newCount = items.filter((f) => f.status === 'new').length
  const filtered = items.filter((f) =>
    (!typeFilter || f.type === typeFilter) && (!statusFilter || f.status === statusFilter))

  return (
    <div className="page max-w-4xl">
      <PageHeader
        title="Bug reports & ideas"
        subtitle={newCount > 0 ? `${newCount} new report${newCount === 1 ? '' : 's'} waiting to be triaged.` : 'Everything creators have reported or suggested.'}
      />

      <div className="mb-8 flex flex-col gap-3 sm:flex-row">
        <select className="input sm:max-w-[180px]" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          <option value="bug">Bugs</option>
          <option value="feature">Features</option>
        </select>
        <select className="input sm:max-w-[200px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Icon name="chat" className="h-7 w-7" />} title="Nothing here yet" hint="Bug reports and feature ideas from creators will appear here." />
      ) : (
        <div className="space-y-4">
          {filtered.map((f) => {
            const who = people[f.creator_id]
            const st = STATUS_MAP[f.status] ?? STATUS_MAP.new
            return (
              <div key={f.id} className="card !p-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge tone={f.type === 'feature' ? 'light' : 'grey'}><Icon name={f.type === 'feature' ? 'bulb' : 'bug'} className="h-3.5 w-3.5" />{f.type === 'feature' ? 'Feature' : 'Bug'}</Badge>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <span className="ml-auto text-xs text-smoke">{formatDate(f.created_at)}</span>
                </div>

                <p className="whitespace-pre-line text-sm text-ink">{f.message}</p>
                {f.page && <p className="mt-1 text-xs text-gray-400">Reported from {f.page}</p>}

                <div className="mt-3 flex items-center gap-2">
                  <Avatar src={who?.photo_url} name={who?.name} size="xs" />
                  <span className="text-xs text-smoke">{who?.name ?? 'Unknown creator'}</span>
                </div>

                {/* Triage controls */}
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {STATUSES.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => setStatus(f, s.key)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                          f.status === s.key ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:text-ink'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={notes[f.id] ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [f.id]: e.target.value }))}
                    rows={2}
                    placeholder="Reply to the creator (they'll see this on their report)…"
                    className="input w-full resize-y text-sm"
                  />
                  <div className="mt-2 flex justify-end">
                    <button onClick={() => saveNote(f)} className="btn-secondary !py-1.5 text-xs">Save reply</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
