import { useEffect, useMemo, useState } from 'react'
import { confirm } from '../../lib/confirm'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Badge, CopyButton, Modal, PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import Turnstile from '../../components/Turnstile'
import { formatDate, timeAgo, downloadCsv } from '../../lib/utils'
import { isOnlineAt } from '../../lib/presence'

// Creator management: the full list with emails (admin-only RPC), plus all
// account actions - password reset, mute, suspend, promote to admin, DM.
//
// Green is now, plain grey is recent, amber is a month of silence, and there is
// exactly one element saying so - see below.
//
// ONE SENTENCE, AND IT SAYS THE SAME KIND OF THING EVERY TIME.
//
// Ethan's report: "rather than saying quiet for a month or two, just say last
// active, two months ago". He is right, and the reason is that "Quiet for 2
// months" and "Active 3 hours ago" are two different sentences about the same
// measurement - one phrased as a duration of absence, the other as a moment in
// the past - so a column of them cannot be scanned. Every row now reads "Last
// active <when>", and the only thing the 30-day judgement changes is the
// colour. Online is the one exception, because "last active 4 seconds ago" is a
// clumsy way of saying somebody is here.
function PresenceChip({ when, online, quiet, detail = false }) {
  if (online) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
        <span className="h-2 w-2 rounded-full bg-green-500" /> Online now
      </span>
    )
  }
  if (!when) {
    return <span className="text-xs text-gray-400">Never opened the app</span>
  }
  // date-fns writes "about 2 months ago"; the hedge is noise in a table.
  const ago = timeAgo(when).replace(/^about /, '').replace(/^almost /, '').replace(/^over /, '')
  return (
    <span
      title={`Last active ${formatDate(when)}`}
      className={quiet
        ? 'flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700'
        : 'text-xs text-smoke'}
    >
      {quiet && <span className="h-2 w-2 rounded-full bg-amber-400" />}
      Last active {ago}{detail ? ` (${formatDate(when)})` : ''}
    </span>
  )
}

export default function AdminCreators() {
  const { user, sendPasswordReset } = useAuth()
  const navigate = useNavigate()

  const [creators, setCreators] = useState([])
  const [emails, setEmails] = useState({}) // id -> email
  const [lastSeen, setLastSeen] = useState({}) // id -> { signIn, seen }
  const [nowTick, setNowTick] = useState(0) // current time (ms), refreshed by a timer so online dots stay fresh
  const [inactiveBefore, setInactiveBefore] = useState(0) // last-active older than this is "inactive"
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState('active')
  const [selected, setSelected] = useState(null) // creator detail modal
  const [detail, setDetail] = useState(null) // their submissions / activity
  const [note, setNote] = useState('') // private admin note for the selected creator
  const [noteSaved, setNoteSaved] = useState(false)
  const [toast, setToast] = useState('')
  // Turnstile gate for sending a password reset (Auth rejects token-less calls).
  const [pwFor, setPwFor] = useState(null) // creator id awaiting the human check
  const [pwToken, setPwToken] = useState('')
  const [pwCaptchaKey, setPwCaptchaKey] = useState(0)

  async function load() {
    const [{ data: profiles }, { data: emailRows }, { data: seenRows }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.rpc('admin_list_emails'),
      supabase.rpc('admin_list_activity'),
    ])
    // Hidden QA/test accounts never show in the roster.
    setCreators((profiles ?? []).filter((p) => !p.is_test))
    setEmails(Object.fromEntries((emailRows ?? []).map((r) => [r.id, r.email])))
    setLastSeen(Object.fromEntries((seenRows ?? []).map((r) => [r.id, { signIn: r.last_sign_in_at, seen: r.last_seen_at, posted: r.last_posted_at, active: r.last_active_at }])))
    setInactiveBefore(Date.now() - 30 * 86400000)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Keep the "online now" dots accurate without a full reload: tick every 30s
  // and refresh the last-seen data every 60s.
  useEffect(() => {
    setNowTick(Date.now())
    const tick = setInterval(() => setNowTick(Date.now()), 30000)
    const refresh = setInterval(async () => {
      const { data } = await supabase.rpc('admin_list_activity')
      if (data) setLastSeen(Object.fromEntries(data.map((r) => [r.id, { signIn: r.last_sign_in_at, seen: r.last_seen_at, posted: r.last_posted_at, active: r.last_active_at }])))
    }, 60000)
    return () => { clearInterval(tick); clearInterval(refresh) }
  }, [])

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
    if (!await confirm(`Really ${verb} ${creator.name}?`)) return
    await supabase.from('profiles').update({ status }).eq('id', creator.id)
    flash(`${creator.name} is now ${status}.`)
    setSelected(null)
    load()
  }

  async function togglePromote(creator) {
    const promoting = !creator.is_admin
    if (!await confirm(promoting
      ? `Promote ${creator.name} to admin? They'll get FULL admin power.`
      : `Remove admin rights from ${creator.name}?`)) return
    const { error } = await supabase.rpc('admin_set_admin', { target: creator.id, make_admin: promoting })
    if (error) { flash(`Couldn't update: ${error.message}`); return }
    flash(promoting ? `${creator.name} is now an admin.` : `${creator.name} is no longer an admin.`)
    setSelected(null)
    load()
  }

  // Password reset needs a Turnstile token: Supabase Auth has captcha
  // protection on /recover, so a token-less call is rejected with
  // "captcha protection: request disallowed" and no email is ever sent.
  async function resetPassword(creator, token) {
    const email = emails[creator.id]
    if (!email) return flash('No email found for this account.')
    const { error } = await sendPasswordReset(email, token)
    setPwFor(null); setPwToken(''); setPwCaptchaKey((k) => k + 1)
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
    if (!await confirm(`Approve ${creator.name}? They'll become an active member of the program.`)) return
    const { error } = await supabase.from('profiles').update({ status: 'active' }).eq('id', creator.id)
    if (error) return flash(`Couldn't approve: ${error.message}`)
    flash(`${creator.name} approved and welcomed.`)
    setSelected(null)
    load()
  }

  // Permanently delete a creator and everything they created. Irreversible.
  async function deleteCreator(creator) {
    if (!await confirm(`PERMANENTLY delete ${creator.name}? This removes their account and ALL their content (submissions, messages, photos, rewards). This cannot be undone.`)) return
    if (!await confirm(`Are you absolutely sure? Type-check: this will erase ${creator.name} forever.`)) return
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

  const STATUS_TONE = { active: 'green', muted: 'amber', suspended: 'red' }

  // A pending creator who never submitted their profile (did page 1 only) shows
  // as "not completed profile"; one who submitted shows as "pending" (awaiting review).
  const statusInfo = (c) =>
    c.deletion_requested_at
      ? { label: 'scheduled for deletion', tone: 'red' }
      : c.status === 'pending'
        ? (c.onboarded ? { label: 'pending', tone: 'amber' } : { label: 'not completed profile', tone: 'grey' })
        : { label: c.status, tone: STATUS_TONE[c.status] || 'grey' }

  // A BADGE EVERY ROW CARRIES IS NOT A BADGE.
  //
  // Ethan: "the active indicator seems to show up for absolutely everyone in the
  // community so we should get rid of it". Nearly every account in the programme
  // is `active`, so a green "active" pill on nearly every row was pure ink: it
  // could not distinguish anybody from anybody, and sitting beside "Quiet for 2
  // months" it read as a contradiction. The badge is now drawn only when the
  // status is something a person would want to know - pending, incomplete,
  // muted, suspended, being deleted. A row with no badge is a normal member,
  // which is what the absence of a flag has always meant everywhere else.
  const badgeWorthShowing = (c) => c.status !== 'active' || !!c.deletion_requested_at
  const isIncomplete = (c) => c.status === 'pending' && !c.onboarded && !c.deletion_requested_at
  const isPendingReview = (c) => c.status === 'pending' && c.onboarded && !c.deletion_requested_at
  const isDeleting = (c) => !!c.deletion_requested_at

  // LAST ACTIVE IS COMPUTED SERVER-SIDE NOW, AND IT MEANS SOMETHING.
  //
  // This used to be `[seen, signIn].sort()` and take the last - a LEXICOGRAPHIC
  // sort of two ISO strings that arrive in different formats (`...Z` from auth,
  // `...+00:00` from the profiles table), which compare in the wrong order at
  // the same instant. And it only ever considered the session anyway: a creator
  // who posts every day but has not re-authenticated in six weeks read as
  // dormant. `creator_activity()` takes the greatest of signing in, the
  // heartbeat, messages, DMs, entries and reactions, and everything - this page
  // and the daily alert - now reads that one number. See migration 093.
  const lastActive = (c) => lastSeen[c.id]?.active ?? null
  // ONE DEFINITION OF ONLINE, SHARED WITH THE REST OF THE APP.
  //
  // This page said three minutes while lib/presence said five, so the same
  // person could be a green dot on the creators page and a grey one in the
  // admin roster. Five is the right number: the heartbeat is every 60s and only
  // fires while the tab is VISIBLE, so a three-minute window flickers somebody
  // offline every time they glance at another tab. `nowTick` (a 30s timer)
  // keeps this pure across re-renders.
  const isOnline = (c) => nowTick > 0 && isOnlineAt(lastSeen[c.id]?.seen, nowTick)
  // Gone quiet: a member in good standing we have not heard from in 30 days.
  // Same definition and the same source as the daily alert (migration 093), so
  // the roster and the notification can no longer disagree about who is quiet.
  const isInactive = (c) => {
    const la = lastActive(c)
    return c.status === 'active' && !c.deletion_requested_at && !!la && new Date(la).getTime() < inactiveBefore
  }

  // WHAT THIS PAGE IS FOR, MADE INTO CONTROLS.
  //
  // It was a search box, a status dropdown and 44 rows. But nobody opens this
  // page to browse: they open it because somebody needs approving, somebody has
  // gone quiet and should be nudged, or they want to know who is around right
  // now. Those are the three jobs, and each of them was several seconds of
  // reading a list to find out whether there was anything to do at all.
  //
  // The segments answer that before you read a single row, and pressing one is
  // the filter. Counts are the point - a zero tells you to leave, which is a
  // useful thing for a page to be able to say.
  const activeMs = (c) => {
    const a = lastSeen[c.id]?.active
    return a ? new Date(a).getTime() : 0
  }

  // `nowTick` and not Date.now(): a render must be a pure function of state, and
  // this repo's lint enforces it. The tick is set in an effect on mount and
  // every 30s after, so it is never stale by more than half a minute.
  const weekAgo = nowTick ? nowTick - 7 * 86400000 : Infinity

  const segments = useMemo(() => {
    const week = weekAgo
    return [
      { key: '', label: 'Everyone', count: creators.length },
      { key: 'online', label: 'Online now', count: creators.filter((c) => isOnline(c)).length, tone: 'green' },
      { key: 'week', label: 'Here this week', count: creators.filter((c) => activeMs(c) > week).length },
      { key: 'quiet', label: 'Gone quiet', count: creators.filter((c) => isInactive(c)).length, tone: 'amber' },
      { key: 'pending', label: 'Awaiting review', count: creators.filter((c) => isPendingReview(c)).length, tone: 'amber' },
      { key: 'incomplete', label: 'Never finished', count: creators.filter((c) => isIncomplete(c)).length },
      { key: 'admin', label: 'Team', count: creators.filter((c) => c.is_admin).length },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creators, lastSeen, nowTick, inactiveBefore])

  const filtered = useMemo(() => {
    const week = weekAgo
    const matchesSegment = (c) => {
      switch (statusFilter) {
        case 'online': return isOnline(c)
        case 'week': return activeMs(c) > week
        case 'quiet': return isInactive(c)
        case 'admin': return c.is_admin
        case 'pending': return isPendingReview(c)
        case 'incomplete': return isIncomplete(c)
        case 'muted': case 'suspended': case 'active': return c.status === statusFilter
        default: return true
      }
    }
    const sorters = {
      // Most recently active first, so who is engaged and who has gone quiet
      // reads top to bottom. Never-seen accounts fall to the bottom, newest
      // sign-up first. This is the same one number the daily alert uses.
      active: (a, b) => activeMs(b) - activeMs(a) || new Date(b.created_at) - new Date(a.created_at),
      joined: (a, b) => new Date(b.accepted_at || b.created_at) - new Date(a.accepted_at || a.created_at),
      name: (a, b) => (a.name || '').localeCompare(b.name || ''),
      // Quietest first: the working order for "who needs a nudge". Never-seen
      // accounts are a different problem (they belong in "Never finished") and
      // would otherwise fill the top of this list forever.
      quiet: (a, b) => (activeMs(a) || Infinity) - (activeMs(b) || Infinity),
    }
    return creators
      .filter((c) => {
        const email = emails[c.id] ?? ''
        if (search && !(c.name + email).toLowerCase().includes(search.toLowerCase())) return false
        return matchesSegment(c)
      })
      .sort(sorters[sort] || sorters.active)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creators, emails, search, statusFilter, sort, lastSeen, nowTick, inactiveBefore])

  return (
    <div className="page">
      <PageHeader
        title="Creators"
        subtitle={`${creators.length} accounts in the program, most recently active first.`}
        action={<button onClick={exportCreators} className="btn-secondary">Export CSV ↓</button>}
      />

      {toast && <p className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700 animate-fade-up">{toast}</p>}

      {/* THE THREE JOBS, WITH THEIR COUNTS ON THEM. Press one to filter to it.
          A zero here is as useful as a number: it means there is nothing to do
          in that column and you can stop reading. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {segments.map((seg) => {
          const on = statusFilter === seg.key
          return (
            <button
              key={seg.key || 'all'}
              type="button"
              onClick={() => setStatusFilter(seg.key)}
              aria-pressed={on}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                on
                  ? 'border-brand bg-brand text-white'
                  : 'border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand'
              }`}
            >
              {seg.tone === 'green' && !on && <span className="h-2 w-2 rounded-full bg-green-500" />}
              {seg.tone === 'amber' && !on && seg.count > 0 && <span className="h-2 w-2 rounded-full bg-amber-400" />}
              {seg.label}
              <span className={on ? 'text-white/80' : 'text-gray-400'}>{seg.count}</span>
            </button>
          )
        })}
      </div>

      <div className="mb-8 flex flex-col gap-3 sm:flex-row">
        <input
          type="search" className="input sm:max-w-xs" placeholder="Search name or email…"
          value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search creators"
        />
        <select className="input sm:max-w-[220px]" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort creators">
          <option value="active">Most recently active</option>
          <option value="quiet">Quietest first</option>
          <option value="joined">Newest members</option>
          <option value="name">Name A to Z</option>
        </select>
        <span className="self-center text-xs text-smoke">
          {filtered.length} shown
        </span>
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
                className="flex w-full flex-col gap-2.5 border-b border-gray-50 px-5 py-4 transition-colors last:border-0 hover:bg-cloud/60 sm:flex-row sm:items-center sm:gap-4 sm:px-7"
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <button onClick={() => setSelected(c)} className="relative shrink-0" aria-label={`Open ${c.name}`}>
                    <Avatar src={c.photo_url} name={c.name} size="sm" />
                    {isOnline(c) && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white" title="Online now" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <button onClick={() => setSelected(c)} className="flex min-w-0 max-w-full items-center gap-2 text-left text-sm font-semibold">
                      <span className="truncate">{c.name}</span>
                      {c.is_admin && <Badge tone="light">Admin</Badge>}
                    </button>
                    {/* Copy-email icon sits directly to the right of the email, not
                        pushed out to the far edge of the row. */}
                    <p className="flex min-w-0 items-center gap-1">
                      <span className="truncate text-xs text-smoke">{emails[c.id] ?? '…'}</span>
                      {emails[c.id] && <CopyButton value={emails[c.id]} label="Copy email" className="!h-6 !w-6 shrink-0" />}
                    </p>
                  </div>
                </div>
                {/* On mobile these sit on their own row under the name (indented past
                    the avatar) so nothing can overlap; on desktop they're inline. */}
                <div className="flex flex-wrap items-center gap-2 pl-[52px] sm:gap-3 sm:pl-0">
                  {/* ONE CHIP, NOT THREE SIGNALS THAT ARGUE.
                      This row used to carry "Active 2 months ago" next to an
                      amber "Inactive" badge next to a green "active" status
                      badge - three things, two of which use the same word for
                      different ideas (has this person been here lately? is this
                      account in good standing?). Recency and the judgement about
                      it are ONE fact, so they are one element, and the account
                      status keeps the badge to itself. */}
                  <PresenceChip when={lastActive(c)} online={isOnline(c)} quiet={isInactive(c)} />
                  <span className="hidden text-xs text-smoke sm:block">· Joined {formatDate(c.accepted_at || c.created_at)}</span>
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
                  {badgeWorthShowing(c) && <Badge tone={s.tone}>{s.label}</Badge>}
                </div>
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
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="break-all">{emails[selected.id]}</span>
                  {emails[selected.id] && <CopyButton value={emails[selected.id]} label="Copy email" />}
                </p>
                <p className="text-xs text-smoke">Joined {formatDate(selected.accepted_at || selected.created_at)} · {selected.age ? `${selected.age} yrs · ` : ''}{(selected.countries_visited ?? []).length} countries</p>
                <p className="mt-0.5 text-xs">
                  <PresenceChip when={lastActive(selected)} online={isOnline(selected)} quiet={isInactive(selected)} detail />
                </p>
                <div className="mt-2 flex gap-2">
                  {badgeWorthShowing(selected) && <Badge tone={statusInfo(selected).tone}>{statusInfo(selected).label}</Badge>}
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
                <button onClick={() => { setPwFor(selected.id); setPwToken('') }} disabled={pwFor === selected.id} className="btn-secondary !py-2 text-xs"><Icon name="key" className="h-4 w-4" /> Send password reset</button>
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

              {/* Human check before a reset email can be sent (Auth requires it). */}
              {pwFor === selected.id && (
                <div className="mt-3 rounded-xl border border-gray-100 bg-cloud/40 p-4">
                  <p className="mb-3 text-[11px] text-smoke">
                    Quick human check, then we'll email a reset link to <span className="font-medium text-ink">{emails[selected.id] || 'this creator'}</span>.
                  </p>
                  <Turnstile key={pwCaptchaKey} onToken={setPwToken} />
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button onClick={() => { setPwFor(null); setPwToken('') }} className="btn-ghost !py-2 text-xs">Cancel</button>
                    <button onClick={() => resetPassword(selected, pwToken)} disabled={!pwToken} className="btn-primary !py-2 text-xs">
                      {pwToken ? 'Send reset link' : 'Verifying…'}
                    </button>
                  </div>
                </div>
              )}

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
