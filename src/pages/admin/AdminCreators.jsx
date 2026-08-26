import { useEffect, useMemo, useState } from 'react'
import { confirm } from '../../lib/confirm'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Badge, CopyButton, Modal, PageHeader, Select, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import Turnstile from '../../components/Turnstile'
import { formatDate, timeAgo, downloadCsv, cx, ageFromDob } from '../../lib/utils'
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
  const [note, setNote] = useState('') // shared admin note for the selected creator
  const [noteMeta, setNoteMeta] = useState(null) // who last touched it, and when
  const [noteSaved, setNoteSaved] = useState(false)
  const [priv, setPriv] = useState(null) // phone etc: admin-only, and ONLY shown here
  const [marketOf, setMarketOf] = useState({}) // creator id -> [market name]
  const [marketFilter, setMarketFilter] = useState('')
  const [toast, setToast] = useState('')
  // Turnstile gate for sending a password reset (Auth rejects token-less calls).
  const [pwFor, setPwFor] = useState(null) // creator id awaiting the human check
  const [pwToken, setPwToken] = useState('')
  const [pwCaptchaKey, setPwCaptchaKey] = useState(0)

  async function load() {
    const [{ data: profiles }, { data: emailRows }, { data: seenRows }, { data: memberRows }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.rpc('admin_list_emails'),
      supabase.rpc('admin_list_activity'),
      // WHICH MARKET SOMEBODY IS IN IS THE FILTER THIS PAGE WAS MISSING.
      // A country manager opening a roster of everybody worldwide has to read
      // past four other markets to find their own, which is most of the reason
      // the page felt like hunting.
      supabase.from('community_members')
        .select('profile_id, communities!inner(name, kind)')
        .eq('status', 'active').eq('communities.kind', 'chapter'),
    ])
    const byCreator = {}
    for (const m of memberRows ?? []) {
      ;(byCreator[m.profile_id] ??= []).push(m.communities.name)
    }
    setMarketOf(byCreator)
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
    if (!selected) { setDetail(null); setNote(''); setNoteMeta(null); setPriv(null); setNoteSaved(false); return }
    async function loadDetail() {
      const [{ data: subs }, { count: msgs }, { data: rewards }, { data: n }, { data: p }] = await Promise.all([
        supabase.from('submissions').select('*, challenges(title)').eq('creator_id', selected.id).order('submitted_at', { ascending: false }),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('sender_id', selected.id),
        supabase.from('rewards').select('*').eq('creator_id', selected.id),
        // The note carries WHO wrote it. It was always shared between admins -
        // one row per creator, an admins-only policy - but it was labelled
        // "Private note" with no author, so it read as your own scratchpad and
        // nobody could tell whether a note was theirs or a colleague's.
        supabase.from('creator_admin_notes').select('note, updated_at, updated_by').eq('creator_id', selected.id).maybeSingle(),
        supabase.from('creator_private').select('phone, phone_country').eq('id', selected.id).maybeSingle(),
      ])
      setDetail({ submissions: subs ?? [], messageCount: msgs ?? 0, rewards: rewards ?? [] })
      setNote(n?.note ?? '')
      setNoteMeta(n?.note ? { at: n.updated_at, by: n.updated_by } : null)
      setPriv(p ?? {})
    }
    loadDetail()
  }, [selected])

  async function saveNote() {
    const { error } = await supabase.from('creator_admin_notes').upsert({
      creator_id: selected.id, note, updated_by: user.id, updated_at: new Date().toISOString(),
    })
    if (error) return flash(`Couldn't save note: ${error.message}`)
    setNoteMeta(note.trim() ? { at: new Date().toISOString(), by: user.id } : null)
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

  // WHAT AN EXPORT IS FOR. It is a working file - a mail merge, a market list,
  // a spend review - so the columns are the ones somebody actually sorts by, in
  // that order, with headings rather than column names. Phone deliberately is
  // NOT here: it is the one detail that lives in this page's panel and nowhere
  // else, and a spreadsheet in an inbox is exactly the "anywhere else" that is
  // supposed to avoid.
  function exportCreators() {
    const rows = filtered.map((c) => ({
      name: c.name,
      email: emails[c.id] ?? '',
      market: (marketOf[c.id] ?? []).join('; '),
      status: statusInfo(c).label,
      team: c.is_admin ? 'Yes' : '',
      last_active: lastActive(c) ? formatDate(lastActive(c)) : 'Never',
      joined: formatDate(c.accepted_at || c.created_at),
      age: c.age ?? '',
      languages: (c.languages ?? []).join('; '),
      countries: (c.countries_visited ?? []).length,
      instagram: c.instagram_url ?? '',
      tiktok: c.tiktok_url ?? '',
      youtube: c.youtube_url ?? '',
      facebook: c.facebook_url ?? '',
    }))
    downloadCsv(`tryp-creators-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'market', label: 'Market' },
      { key: 'status', label: 'Status' },
      { key: 'team', label: 'Tryp.com team' },
      { key: 'last_active', label: 'Last active' },
      { key: 'joined', label: 'Joined' },
      { key: 'age', label: 'Age' },
      { key: 'languages', label: 'Languages' },
      { key: 'countries', label: 'Countries visited' },
      { key: 'instagram', label: 'Instagram' },
      { key: 'tiktok', label: 'TikTok' },
      { key: 'youtube', label: 'YouTube' },
      { key: 'facebook', label: 'Facebook' },
    ])
  }

  const STATUS_TONE = { active: 'green', muted: 'amber', suspended: 'red' }

  // A dial code and a number are two columns in the database and one fact to a
  // person; joined here so nobody has to reassemble it before dialling.
  const phoneOf = (p) => [p?.phone_country, p?.phone].filter(Boolean).join(' ').trim()
  // A note carries the id of whoever saved it. Everybody who can write one is
  // already in this list, so no extra query is needed to name them.
  const creatorName = (id) => creators.find((c) => c.id === id)?.name ?? 'a colleague'

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

  // Every market that has somebody in it, with its count, newest question first:
  // "how many of mine are there".
  const markets = useMemo(() => {
    const tally = {}
    for (const c of creators) for (const m of marketOf[c.id] ?? []) tally[m] = (tally[m] ?? 0) + 1
    return Object.entries(tally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [creators, marketOf])

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
        if (marketFilter === '__none') { if ((marketOf[c.id] ?? []).length) return false }
        else if (marketFilter && !(marketOf[c.id] ?? []).includes(marketFilter)) return false
        return matchesSegment(c)
      })
      .sort(sorters[sort] || sorters.active)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creators, emails, search, statusFilter, sort, lastSeen, nowTick, inactiveBefore, marketFilter, marketOf])

  return (
    <div className="page">
      <PageHeader
        title="Creators"
        back="/admin"
        action={
          <button onClick={exportCreators} className="btn-secondary">
            <Icon name="arrow-down" className="h-4 w-4" /> Export CSV
          </button>
        }
      />

      {toast && <p className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700 animate-fade-up">{toast}</p>}

      {/* ONE TOOLBAR, NOT FOUR ROWS OF LOOSE BUTTONS.
          There were four stacked bands above the list - a row of status pills,
          a row of market pills, a search box, a sort box - each floating on the
          page with nothing holding it together, and the market row grew a pill
          per market so it was going to keep getting worse. That is the "bunch
          of buttons and looks bad" report.
          It is one panel now. Search, market and sort go on the top line
          because they are all "narrow the list to what I mean"; the status
          strip goes underneath because it is the one control whose COUNTS are
          worth reading in their own right - a zero there means there is nothing
          to do in that column. Market moved into a dropdown for the same reason
          the sort is one: an unbounded list is not a row of buttons. */}
      <div className="mb-6 rounded-card border border-gray-100 bg-white p-3 shadow-card">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Icon name="magnifier" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
            <input
              type="search" className="input !pl-9" placeholder="Search name or email…"
              value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search creators"
            />
          </div>
          {markets.length > 1 && (
            <Select
              className="sm:w-[190px]"
              ariaLabel="Filter by market"
              value={marketFilter}
              onChange={setMarketFilter}
              options={[
                { value: '', label: `All markets (${creators.length})` },
                ...markets.map(([m, n]) => ({ value: m, label: `${m} (${n})` })),
                ...(creators.some((c) => !(marketOf[c.id] ?? []).length)
                  ? [{ value: '__none', label: `No market (${creators.filter((c) => !(marketOf[c.id] ?? []).length).length})` }]
                  : []),
              ]}
            />
          )}
          <Select
            className="sm:w-[200px]"
            ariaLabel="Sort creators"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'active', label: 'Most recently active' },
              { value: 'quiet', label: 'Quietest first' },
              { value: 'joined', label: 'Newest members' },
              { value: 'name', label: 'Name A to Z' },
            ]}
          />
        </div>

        {/* The status strip. Scrolls sideways rather than wrapping to a third
            line on a narrow window. */}
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {segments.map((seg) => {
            const on = statusFilter === seg.key
            return (
              <button
                key={seg.key || 'all'}
                type="button"
                onClick={() => setStatusFilter(seg.key)}
                aria-pressed={on}
                className={cx(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
                  on ? 'bg-brand text-white' : 'text-smoke hover:bg-cloud hover:text-ink',
                )}
              >
                {seg.tone === 'green' && !on && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                {seg.tone === 'amber' && !on && seg.count > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                {seg.label}
                <span className={cx('tabular-nums', on ? 'text-white/70' : 'text-gray-400')}>{seg.count}</span>
              </button>
            )
          })}
          <span className="ml-auto shrink-0 pl-3 pr-1 text-xs text-smoke">{filtered.length} shown</span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
          {filtered.map((c) => {
            const s = statusInfo(c)
            return (
              /* THE WHOLE ROW IS THE DOOR.
                 It used to be the avatar and the name only - two small targets
                 inside a row 700 pixels wide, so most of a deliberate click at
                 a creator hit nothing at all. Anywhere that is not one of the
                 row's own buttons now opens the card; the `closest` check is
                 what keeps Accept, Email and Copy working as themselves. */
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={(e) => { if (!e.target.closest('button,a,input')) setSelected(c) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(c) } }}
                className="flex w-full cursor-pointer flex-col gap-2.5 border-b border-gray-50 px-5 py-4 transition-colors last:border-0 hover:bg-cloud/60 focus:outline-none focus-visible:bg-cloud sm:flex-row sm:items-center sm:gap-4 sm:px-7"
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <span className="relative shrink-0">
                    <Avatar src={c.photo_url} name={c.name} size="sm" />
                    {isOnline(c) && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white" title="Online now" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 max-w-full items-center gap-2 text-left text-sm font-semibold">
                      <span className="truncate">{c.name}</span>
                      {c.is_admin && <Badge tone="light">Admin</Badge>}
                    </p>
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
            {/* IDENTITY, then CONTACT, then everything else. The old header
                ran the email, the join date, the age, the country count and the
                presence chip together as four lines of small grey text, so the
                two things you open this panel for - how do I reach them, and
                are they all right - were the hardest to find in it. */}
            <div className="flex flex-wrap items-start gap-4">
              <Avatar src={selected.photo_url} name={selected.name} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold leading-tight">{selected.name}</h3>
                  {badgeWorthShowing(selected) && <Badge tone={statusInfo(selected).tone}>{statusInfo(selected).label}</Badge>}
                  {selected.is_admin && <Badge tone="light">Team</Badge>}
                </div>
                <p className="mt-1 text-xs">
                  <PresenceChip when={lastActive(selected)} online={isOnline(selected)} quiet={isInactive(selected)} detail />
                </p>
                {(marketOf[selected.id] ?? []).length > 0 && (
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    {(marketOf[selected.id] ?? []).map((m) => (
                      <span key={m} className="rounded-full bg-cloud px-2.5 py-0.5 text-[11px] font-medium text-smoke">{m}</span>
                    ))}
                  </p>
                )}
              </div>
            </div>

            {/* THEIR PAGES, AS THEY SEE THEM.
                A creator writes in asking where their voucher went, and until
                now the only way to answer was to reconstruct their view from
                the admin tables - which is a different page with different
                numbers on it. These open the creator's OWN rewards page and
                dashboard, filtered to them, read only, with a band across the
                top saying whose they are. The sandbox does not answer this:
                that is a blank account, and the question is always about a
                specific person's history. */}
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/profile/${selected.id}`}
                className="btn-secondary !py-2 text-xs"
                onClick={() => setSelected(null)}
              >
                <Icon name="users" className="h-4 w-4" /> Their profile
              </Link>
              <Link
                to={`/dashboard?as=${selected.id}`}
                className="btn-secondary !py-2 text-xs"
                onClick={() => setSelected(null)}
              >
                <Icon name="chart" className="h-4 w-4" /> Their dashboard
              </Link>
              <Link
                to={`/rewards?as=${selected.id}`}
                className="btn-secondary !py-2 text-xs"
                onClick={() => setSelected(null)}
              >
                <Icon name="money" className="h-4 w-4" /> Their rewards
              </Link>
              <Link
                to={`/milestones?as=${selected.id}`}
                className="btn-secondary !py-2 text-xs"
                onClick={() => setSelected(null)}
              >
                <Icon name="plane" className="h-4 w-4" /> Their milestones
              </Link>
            </div>

            {/* CONTACT DETAILS, AND THIS IS THE ONLY PLACE THEY APPEAR.
                Ethan's rule: the admin-only details - their number above all -
                show here and nowhere else, not on their profile. A phone number
                is the one field on this platform a creator has not chosen to
                publish to anybody, so it belongs behind a deliberate act (open
                the roster, open the person) rather than on a page a colleague
                might have open on a shared screen. */}
            {/* ORANGE, BECAUSE OF WHAT IS IN IT.
                Ethan asked for the team-only contact details to be highlighted,
                and the reason is not decoration: a phone number is the one
                field on this platform a creator has not chosen to publish to
                anybody, and it sits in a panel a colleague might have open on a
                shared screen. Grey-on-grey made it look like the rest of the
                record. Brand orange makes the boundary a thing you can see
                without reading the label. */}
            <div className="rounded-card border border-brand/30 bg-brand-tint/40 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Icon name="shield" className="h-3.5 w-3.5 text-brand" />
                {/* "Tryp.com team only" is gone: this panel is inside the
                    admin roster, so the only people who can read it are the
                    team. A label that states its own audience to that audience
                    is a label doing nothing. */}
                <h4 className="text-[11px] font-bold uppercase tracking-widest text-brand">
                  Contact details
                </h4>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-[11px] font-medium text-brand/70">Email</dt>
                  <dd className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-sm font-medium">{emails[selected.id] || '—'}</span>
                    {emails[selected.id] && <CopyButton value={emails[selected.id]} label="Copy email" className="!h-6 !w-6 shrink-0" />}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] font-medium text-brand/70">Phone</dt>
                  <dd className="flex min-w-0 items-center gap-1">
                    {priv === null ? (
                      <Skeleton className="h-4 w-28" />
                    ) : phoneOf(priv) ? (
                      <>
                        <span className="truncate text-sm font-medium">{phoneOf(priv)}</span>
                        <CopyButton value={phoneOf(priv)} label="Copy phone" className="!h-6 !w-6 shrink-0" />
                      </>
                    ) : (
                      <span className="text-sm text-smoke">Not given</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-brand/70">Joined</dt>
                  <dd className="text-sm font-medium">{formatDate(selected.accepted_at || selected.created_at)}</dd>
                </div>
                {/* DATE OF BIRTH AND THE AGE IT IMPLIES.
                    "countries visited" is on their profile, where anybody can
                    read it, so repeating it in the team-only panel spent a slot
                    on something already public. A birthday is the thing the
                    team actually needs from here - and `age` on the profile is
                    a number the creator typed once and never updates, so it is
                    derived from the date instead. */}
                <div>
                  <dt className="text-[11px] font-medium text-brand/70">Date of birth</dt>
                  <dd className="text-sm font-medium">
                    {selected.dob ? formatDate(selected.dob) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-brand/70">Age</dt>
                  <dd className="text-sm font-medium">
                    {ageFromDob(selected.dob) ?? selected.age ?? '—'}
                  </dd>
                </div>
              </dl>
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
                <ul className="max-h-44 space-y-2 overflow-y-auto overscroll-contain">
                  {detail.submissions.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-2.5 text-xs">
                      <span className="min-w-0 truncate">{s.challenges?.title} · {s.platform} · {timeAgo(s.submitted_at)}</span>
                      <a href={s.video_url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-medium text-brand hover:underline">Watch ↗</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* THE NOTE IS THE TEAM'S, NOT YOURS.
                It always was - one row per creator, an admins-only policy - but
                it was headed "Private note" with no author on it, which reads
                as a personal scratchpad. Two country managers could overwrite
                each other and neither would know. Same storage, honest label,
                and it now says who wrote what is on screen. */}
            <div className="border-t border-gray-100 pt-5">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Team note</h3>
                {noteSaved && <span className="text-xs font-medium text-green-600">Saved ✓</span>}
              </div>
              <p className="mb-2 text-[11px] text-smoke">
                Every admin sees this, and it is never shown to the creator.
                {noteMeta && (
                  <> Last edited by <span className="font-medium text-ink">{creatorName(noteMeta.by)}</span> {timeAgo(noteMeta.at)}.</>
                )}
              </p>
              <textarea
                rows={3}
                className="input text-sm"
                placeholder="What the rest of the team should know about this creator…"
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
