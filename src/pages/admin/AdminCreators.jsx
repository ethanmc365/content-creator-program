import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Badge, Modal, PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import { formatDate, timeAgo, downloadCsv } from '../../lib/utils'

// Creator management: the full list with emails (admin-only RPC), plus all
// account actions - password reset, mute, suspend, promote to admin, DM.
export default function AdminCreators() {
  const { user, sendPasswordReset } = useAuth()
  const navigate = useNavigate()

  const [creators, setCreators] = useState([])
  const [emails, setEmails] = useState({}) // id -> email
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState(null) // creator detail modal
  const [detail, setDetail] = useState(null) // their submissions / activity
  const [note, setNote] = useState('') // private admin note for the selected creator
  const [noteSaved, setNoteSaved] = useState(false)
  const [toast, setToast] = useState('')

  async function load() {
    const [{ data: profiles }, { data: emailRows }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.rpc('admin_list_emails'),
    ])
    setCreators(profiles ?? [])
    setEmails(Object.fromEntries((emailRows ?? []).map((r) => [r.id, r.email])))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Load activity + private admin note when a creator is opened.
  useEffect(() => {
    if (!selected) { setDetail(null); setNote(''); setNoteSaved(false); return }
    async function loadDetail() {
      const [{ data: subs }, { count: msgs }, { data: rewards }, { data: n }] = await Promise.all([
        supabase.from('submissions').select('*, challenges(title)').eq('creator_id', selected.id).order('submitted_at', { ascending: false }),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('sender_id', selected.id),
        supabase.from('rewards').select('*').eq('creator_id', selected.id),
        supabase.from('creator_admin_notes').select('note').eq('creator_id', selected.id).maybeSingle(),
      ])
      setDetail({ submissions: subs ?? [], messageCount: msgs ?? 0, rewards: rewards ?? [] })
      setNote(n?.note ?? '')
    }
    loadDetail()
  }, [selected])

  async function saveNote() {
    const { error } = await supabase.from('creator_admin_notes').upsert({
      creator_id: selected.id, note, updated_by: user.id, updated_at: new Date().toISOString(),
    })
    if (error) return flash(`Couldn't save note: ${error.message}`)
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2000)
  }

  function flash(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function setStatus(creator, status) {
    const verb = { active: 'reactivate', muted: 'mute', suspended: 'suspend' }[status]
    if (!confirm(`Really ${verb} ${creator.name}?`)) return
    await supabase.from('profiles').update({ status }).eq('id', creator.id)
    flash(`${creator.name} is now ${status}.`)
    setSelected(null)
    load()
  }

  async function togglePromote(creator) {
    const promoting = !creator.is_admin
    if (!confirm(promoting
      ? `Promote ${creator.name} to admin? They'll get FULL admin power.`
      : `Remove admin rights from ${creator.name}?`)) return
    await supabase.from('profiles').update({ is_admin: promoting }).eq('id', creator.id)
    flash(promoting ? `${creator.name} is now an admin.` : `${creator.name} is no longer an admin.`)
    setSelected(null)
    load()
  }

  async function resetPassword(creator) {
    const email = emails[creator.id]
    if (!email) return flash('No email found for this account.')
    const { error } = await sendPasswordReset(email)
    flash(error ? `Couldn't send: ${error.message}` : `Reset email sent to ${email}.`)
  }

  // Nudge a creator who signed up but never submitted their profile.
  async function sendReminder(creator) {
    const { error } = await supabase.rpc('admin_remind_incomplete', { target: creator.id })
    flash(error ? `Couldn't send: ${error.message}` : `Reminder email sent to ${creator.name}.`)
  }

  // Restore an account that the creator scheduled for deletion (within the
  // 30-day grace period).
  async function restoreCreator(creator) {
    const { error } = await supabase.from('profiles').update({ deletion_requested_at: null }).eq('id', creator.id)
    if (error) return flash(`Couldn't restore: ${error.message}`)
    flash(`${creator.name}'s account restored.`)
    setSelected(null)
    load()
  }

  // Quick-approve a pending applicant straight from the list (a DB trigger
  // sends them the welcome notification, same as the Applications page).
  async function acceptCreator(creator) {
    if (!confirm(`Approve ${creator.name}? They'll become an active member of the program.`)) return
    const { error } = await supabase.from('profiles').update({ status: 'active' }).eq('id', creator.id)
    if (error) return flash(`Couldn't approve: ${error.message}`)
    flash(`${creator.name} approved and welcomed.`)
    setSelected(null)
    load()
  }

  // Permanently delete a creator and everything they created. Irreversible.
  async function deleteCreator(creator) {
    if (!confirm(`PERMANENTLY delete ${creator.name}? This removes their account and ALL their content (submissions, messages, photos, rewards). This cannot be undone.`)) return
    if (!confirm(`Are you absolutely sure? Type-check: this will erase ${creator.name} forever.`)) return
    const { error } = await supabase.rpc('admin_delete_creator', { target: creator.id })
    if (error) return flash(`Couldn't delete: ${error.message}`)
    flash(`${creator.name} has been permanently deleted.`)
    setSelected(null)
    load()
  }

  async function dmCreator(creator) {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_a.eq.${user.id},participant_b.eq.${creator.id}),and(participant_a.eq.${creator.id},participant_b.eq.${user.id})`)
      .maybeSingle()
    if (existing) return navigate(`/messages/${existing.id}`)
    const { data: created } = await supabase
      .from('conversations').insert({ participant_a: user.id, participant_b: creator.id }).select('id').single()
    if (created) navigate(`/messages/${created.id}`)
  }

  function exportCreators() {
    downloadCsv(
      'tryp-creators.csv',
      filtered.map((c) => ({
        name: c.name,
        email: emails[c.id] ?? '',
        status: c.status,
        admin: c.is_admin ? 'yes' : 'no',
        age: c.age ?? '',
        instagram: c.instagram_url ?? '',
        tiktok: c.tiktok_url ?? '',
        youtube: c.youtube_url ?? '',
        languages: (c.languages ?? []).join('; '),
        countries_visited: (c.countries_visited ?? []).length,
        joined: formatDate(c.created_at),
      }))
    )
  }

  const filtered = useMemo(
    () =>
      creators.filter((c) => {
        const email = emails[c.id] ?? ''
        if (search && !(c.name + email).toLowerCase().includes(search.toLowerCase())) return false
        if (statusFilter === 'admin') return c.is_admin
        if (statusFilter === 'pending') return c.status === 'pending' && c.onboarded
        if (statusFilter === 'incomplete') return c.status === 'pending' && !c.onboarded
        if (statusFilter && c.status !== statusFilter) return false
        return true
      }),
    [creators, emails, search, statusFilter]
  )

  const STATUS_TONE = { active: 'green', muted: 'amber', suspended: 'red' }

  // A pending creator who never submitted their profile (did page 1 only) shows
  // as "not completed profile"; one who submitted shows as "pending" (awaiting review).
  const statusInfo = (c) =>
    c.deletion_requested_at
      ? { label: 'scheduled for deletion', tone: 'red' }
      : c.status === 'pending'
        ? (c.onboarded ? { label: 'pending', tone: 'amber' } : { label: 'not completed profile', tone: 'grey' })
        : { label: c.status, tone: STATUS_TONE[c.status] || 'grey' }
  const isIncomplete = (c) => c.status === 'pending' && !c.onboarded && !c.deletion_requested_at
  const isPendingReview = (c) => c.status === 'pending' && c.onboarded && !c.deletion_requested_at
  const isDeleting = (c) => !!c.deletion_requested_at

  return (
    <div className="page">
      <PageHeader
        title="Creators"
        subtitle={`${creators.length} accounts in the program.`}
        action={<button onClick={exportCreators} className="btn-secondary">Export CSV ↓</button>}
      />

      {toast && <p className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700 animate-fade-up">{toast}</p>}

      <div className="mb-8 flex flex-col gap-3 sm:flex-row">
        <input
          type="search" className="input sm:max-w-xs" placeholder="Search name or email…"
          value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search creators"
        />
        <select className="input sm:max-w-[180px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending review</option>
          <option value="incomplete">Not completed profile</option>
          <option value="muted">Muted</option>
          <option value="suspended">Suspended</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
          {filtered.map((c) => {
            const s = statusInfo(c)
            return (
              <div
                key={c.id}
                className="flex w-full items-center gap-3 border-b border-gray-50 px-5 py-4 transition-colors last:border-0 hover:bg-cloud/60 sm:gap-4 sm:px-7"
              >
                <button onClick={() => setSelected(c)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                  <Avatar src={c.photo_url} name={c.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {c.name}
                      {c.is_admin && <Badge tone="light">Admin</Badge>}
                    </p>
                    <p className="truncate text-xs text-smoke">{emails[c.id] ?? '…'}</p>
                  </div>
                </button>
                <span className="hidden text-xs text-smoke sm:block">Joined {formatDate(c.created_at)}</span>
                {isIncomplete(c) && (
                  <button
                    onClick={() => sendReminder(c)}
                    title="Email a reminder to finish their profile"
                    className="btn-secondary shrink-0 !px-3 !py-1.5 text-xs"
                  >
                    <Icon name="envelope" className="h-4 w-4" /> Email
                  </button>
                )}
                {isPendingReview(c) && (
                  <button
                    onClick={() => acceptCreator(c)}
                    title="Approve this applicant"
                    className="btn-primary shrink-0 !px-3 !py-1.5 text-xs"
                  >
                    <Icon name="check" className="h-4 w-4" /> Accept
                  </button>
                )}
                {isDeleting(c) && (
                  <button
                    onClick={() => restoreCreator(c)}
                    title="Restore this account"
                    className="btn-secondary shrink-0 !px-3 !py-1.5 text-xs"
                  >
                    <Icon name="check" className="h-4 w-4" /> Restore
                  </button>
                )}
                <Badge tone={s.tone}>{s.label}</Badge>
              </div>
            )
          })}
          {filtered.length === 0 && <p className="px-7 py-12 text-center text-sm text-smoke">No creators match.</p>}
        </div>
      )}

      {/* ---------- Creator detail modal ---------- */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''} wide>
        {selected && (
          <div className="space-y-7">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar src={selected.photo_url} name={selected.name} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{emails[selected.id]}</p>
                <p className="text-xs text-smoke">Joined {formatDate(selected.created_at)} · {selected.age ? `${selected.age} yrs · ` : ''}{(selected.countries_visited ?? []).length} countries</p>
                <div className="mt-2 flex gap-2">
                  <Badge tone={statusInfo(selected).tone}>{statusInfo(selected).label}</Badge>
                  {selected.is_admin && <Badge tone="light">Admin</Badge>}
                </div>
              </div>
              <Link to={`/profile/${selected.id}`} className="btn-secondary !py-2 text-xs" onClick={() => setSelected(null)}>
                View profile
              </Link>
            </div>

            {/* Activity summary */}
            {detail ? (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-cloud px-3 py-4"><p className="text-lg font-bold">{detail.submissions.length}</p><p className="text-[11px] text-smoke">Submissions</p></div>
                <div className="rounded-xl bg-cloud px-3 py-4"><p className="text-lg font-bold">{detail.messageCount}</p><p className="text-[11px] text-smoke">Chat messages</p></div>
                <div className="rounded-xl bg-cloud px-3 py-4"><p className="text-lg font-bold">{detail.rewards.length}</p><p className="text-[11px] text-smoke">Rewards</p></div>
              </div>
            ) : (
              <Skeleton className="h-20 w-full" />
            )}

            {/* Their submissions */}
            {detail?.submissions.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Submissions</h3>
                <ul className="max-h-44 space-y-2 overflow-y-auto">
                  {detail.submissions.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-2.5 text-xs">
                      <span className="min-w-0 truncate">{s.challenges?.title} · {s.platform} · {timeAgo(s.submitted_at)}</span>
                      <a href={s.video_url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-medium text-brand hover:underline">Watch ↗</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Private admin note (only admins ever see this) */}
            <div className="border-t border-gray-100 pt-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Private note</h3>
                {noteSaved && <span className="text-xs font-medium text-green-600">Saved ✓</span>}
              </div>
              <textarea
                rows={3}
                className="input text-sm"
                placeholder="Notes about this creator, visible only to the Tryp.com Team…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="mt-2 flex justify-end">
                <button onClick={saveNote} className="btn-secondary !py-1.5 text-xs">Save note</button>
              </div>
            </div>

            {/* Account actions */}
            <div className="space-y-3 border-t border-gray-100 pt-5">
              <h3 className="text-sm font-semibold">Account actions</h3>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => dmCreator(selected)} className="btn-primary !py-2 text-xs"><Icon name="chat" className="h-4 w-4" /> Message</button>
                {isPendingReview(selected) && (
                  <button onClick={() => acceptCreator(selected)} className="btn-primary !py-2 text-xs"><Icon name="check" className="h-4 w-4" /> Accept applicant</button>
                )}
                {isDeleting(selected) && (
                  <button onClick={() => restoreCreator(selected)} className="btn-secondary !py-2 text-xs"><Icon name="check" className="h-4 w-4" /> Restore account</button>
                )}
                {isIncomplete(selected) && (
                  <button onClick={() => sendReminder(selected)} className="btn-secondary !py-2 text-xs"><Icon name="envelope" className="h-4 w-4" /> Email reminder</button>
                )}
                <button onClick={() => resetPassword(selected)} className="btn-secondary !py-2 text-xs"><Icon name="key" className="h-4 w-4" /> Send password reset</button>
                <button onClick={() => togglePromote(selected)} className="btn-secondary !py-2 text-xs">
                  <Icon name={selected.is_admin ? 'shield' : 'star'} className="h-4 w-4" /> {selected.is_admin ? 'Remove admin' : 'Promote to admin'}
                </button>
                {selected.status !== 'muted' && selected.status !== 'suspended' && (
                  <button onClick={() => setStatus(selected, 'muted')} className="btn-danger !py-2 text-xs"><Icon name="mute" className="h-4 w-4" /> Mute</button>
                )}
                {selected.status !== 'suspended' ? (
                  <button onClick={() => setStatus(selected, 'suspended')} className="btn-danger !py-2 text-xs"><Icon name="ban" className="h-4 w-4" /> Suspend</button>
                ) : (
                  <button onClick={() => setStatus(selected, 'active')} className="btn-secondary !py-2 text-xs"><Icon name="check" className="h-4 w-4" /> Reactivate</button>
                )}
                {selected.status === 'muted' && (
                  <button onClick={() => setStatus(selected, 'active')} className="btn-secondary !py-2 text-xs"><Icon name="megaphone" className="h-4 w-4" /> Unmute</button>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-smoke">
                Muted: can browse but not post. Suspended: locked out of the platform entirely.
              </p>

              {/* Danger zone: permanent deletion */}
              {!selected.is_admin && (
                <div className="mt-4 rounded-xl border border-red-100 bg-red-50/50 p-4">
                  <p className="text-xs font-semibold text-red-600">Danger zone</p>
                  <p className="mb-3 mt-1 text-[11px] leading-relaxed text-smoke">
                    Permanently delete this creator and all their content. This cannot be undone.
                  </p>
                  <button onClick={() => deleteCreator(selected)} className="btn-danger !py-2 text-xs"><Icon name="trash" className="h-4 w-4" /> Delete creator</button>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
