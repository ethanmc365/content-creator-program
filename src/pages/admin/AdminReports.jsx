import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Badge, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import Reveal from '../../components/network/Reveal'
import { confirm, notice, promptText } from '../../lib/confirm'
import { REPORT_REASONS, REPORT_STATUS } from '../../lib/messageActions'
import { CREATOR_REPORT_LABEL } from '../../lib/creatorReports'
import { formatDate, cx, timeAgo } from '../../lib/utils'

// Where reported messages land.
//
// A report is not an action, it is a QUESTION put to a person, so this page is
// built around answering it: here is what was said, here is who said it, here
// is who objected and why, and here are the three things you can do about it.
//
// WHY THE MESSAGE IS SHOWN FROM A SNAPSHOT AND NOT FETCHED. For a room message
// either would work. For a DM only this works: `direct_messages` is
// participants-only under RLS and an admin is not in somebody else's thread, by
// design. The snapshot taken at report time (migration 097) is both the only
// way to review a DM report and the privacy-correct amount of it to expose -
// the one message that was reported, and nothing else in the conversation.
//
// The channel key is shown rather than linked for the same reason the snapshot
// exists: the message may be gone by now, and a link to a deleted message is a
// dead end dressed as a lead.

const REASON_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.key, r.label]))

const TABS = [
  { key: 'open', label: 'To review', match: (r) => r.status === 'new' || r.status === 'reviewing' },
  { key: 'closed', label: 'Closed', match: (r) => r.status === 'actioned' || r.status === 'dismissed' },
  { key: 'all', label: 'Everything', match: () => true },
]

function MessageReports({ onCount }) {
  const { user } = useAuth()
  const [rows, setRows] = useState(null)
  const [tab, setTab] = useState('open')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('message_reports')
      .select('*, reporter:reporter_id(id, name, photo_url), author:author_id(id, name, photo_url, is_admin, status)')
      .order('created_at', { ascending: false })
      .limit(300)
    setRows(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (rows) onCount?.((rows ?? []).filter(TABS[0].match).length)
  }, [rows, onCount])

  async function decide(report, status) {
    setBusyId(report.id)
    const note = status === 'dismissed' || status === 'actioned'
      ? await promptText(
          status === 'actioned' ? 'What did you do about it?' : 'Why is this being dismissed?',
          { placeholder: 'Optional, for the record', confirmLabel: 'Save' },
        )
      : null
    const { error } = await supabase.rpc('decide_message_report', {
      p_id: report.id, p_status: status, p_note: note || null,
    })
    setBusyId(null)
    if (error) { await notice(`Could not save that: ${error.message}`); return }
    load()
  }

  // The two things an admin actually does about a bad message, from here rather
  // than by going and finding it. Both use the same paths the chat itself uses,
  // so there is no second set of moderation rules to keep in step.
  async function removeMessage(report) {
    const what = report.kind === 'dm' ? 'this direct message' : 'this message'
    if (!await confirm(`Delete ${what} for everyone? This cannot be undone.`)) return
    setBusyId(report.id)
    const { error } = report.kind === 'dm'
      ? await supabase.from('direct_messages').delete().eq('id', report.dm_id)
      : await supabase.from('messages').update({ deleted: true }).eq('id', report.message_id)
    if (error) { setBusyId(null); await notice(`Could not delete it: ${error.message}`); return }
    await supabase.rpc('decide_message_report', { p_id: report.id, p_status: 'actioned', p_note: 'Message deleted.' })
    setBusyId(null)
    load()
  }

  async function muteAuthor(report) {
    const name = report.author?.name || 'this creator'
    if (!await confirm(`Mute ${name}? They can read but not post until you unmute them in Admin → Creators.`)) return
    setBusyId(report.id)
    const { error } = await supabase.from('profiles').update({ status: 'muted' }).eq('id', report.author_id)
    if (error) { setBusyId(null); await notice(`Could not mute them: ${error.message}`); return }
    await supabase.rpc('decide_message_report', { p_id: report.id, p_status: 'actioned', p_note: `${name} muted.` })
    setBusyId(null)
    load()
  }

  const active = TABS.find((t) => t.key === tab) ?? TABS[0]
  const list = (rows ?? []).filter(active.match)
  const openCount = (rows ?? []).filter(TABS[0].match).length

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const n = (rows ?? []).filter(t.match).length
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cx(
                'rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200',
                tab === t.key ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hover:text-ink active:scale-95',
              )}
            >
              {t.label}{n > 0 && <span className="ml-1.5 opacity-80">{n}</span>}
            </button>
          )
        })}
        {openCount === 0 && rows !== null && (
          <span className="ml-auto text-xs font-medium text-green-700">Nothing waiting</span>
        )}
      </div>

      {rows === null ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Icon name="flag" className="h-7 w-7" />}
          title={tab === 'open' ? 'Nothing to review' : 'Nothing here'}
          hint={tab === 'open'
            ? 'When somebody reports a message in a room or a DM, it turns up here.'
            : 'Reports you have actioned or dismissed will be listed here.'}
        />
      ) : (
        <Reveal className="space-y-4" stagger={0.05}>
          {list.map((r) => {
            const st = REPORT_STATUS[r.status] ?? REPORT_STATUS.new
            const open = r.status === 'new' || r.status === 'reviewing'
            const busy = busyId === r.id
            const gone = r.kind === 'dm' ? !r.dm_id : !r.message_id
            return (
              <div key={r.id} className="card !p-5 sm:!p-6">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <Badge tone="grey">{r.kind === 'dm' ? 'Direct message' : `#${r.context || 'room'}`}</Badge>
                  <Badge tone="light">{REASON_LABEL[r.reason] || r.reason}</Badge>
                  <span className="ml-auto text-xs text-smoke" title={formatDate(r.created_at)}>{timeAgo(r.created_at)}</span>
                </div>

                {/* WHAT WAS SAID. The snapshot, verbatim, and never rendered as
                    markdown: this is evidence, and a reported message is exactly
                    the kind of text you want to read as it was written rather
                    than as it wants to look. */}
                <div className="rounded-card border border-gray-100 bg-cloud/50 p-4">
                  <div className="mb-2 flex items-center gap-2.5">
                    {r.author ? (
                      <Link to={`/profile/${r.author.id}`} className="flex items-center gap-2.5 hover:text-brand">
                        <Avatar src={r.author.photo_url} name={r.author.name} size="sm" />
                        <span className="text-sm font-semibold">{r.author.name}</span>
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-smoke">Account deleted</span>
                    )}
                    {r.author?.is_admin && <Badge tone="light" className="!px-2 !py-0.5">Team</Badge>}
                    {r.author?.status === 'muted' && <Badge tone="amber" className="!px-2 !py-0.5">Muted</Badge>}
                  </div>
                  {r.body_snapshot
                    ? <p className="whitespace-pre-line text-sm text-ink [overflow-wrap:anywhere]">{r.body_snapshot}</p>
                    : <p className="text-sm italic text-smoke">No text, an attachment only.</p>}
                  {r.media_snapshot && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-smoke">
                      <Icon name="image" className="h-3.5 w-3.5" /> An attachment was included.
                    </p>
                  )}
                  {gone && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-smoke">
                      <Icon name="ban" className="h-3.5 w-3.5" /> The original has since been deleted.
                    </p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-smoke">
                  <span>Reported by</span>
                  {r.reporter ? (
                    <Link to={`/profile/${r.reporter.id}`} className="flex items-center gap-1.5 font-medium text-ink hover:text-brand">
                      <Avatar src={r.reporter.photo_url} name={r.reporter.name} size="xs" />
                      {r.reporter.name}
                    </Link>
                  ) : <span className="font-medium text-ink">a former member</span>}
                </div>
                {r.details && (
                  <p className="mt-2 whitespace-pre-line rounded-xl bg-white px-3 py-2 text-sm text-ink ring-1 ring-gray-100">
                    “{r.details}”
                  </p>
                )}

                {r.admin_note && (
                  <p className="mt-3 rounded-xl bg-brand-tint/60 px-3 py-2 text-xs text-ink">
                    <span className="font-semibold text-brand">Outcome: </span>{r.admin_note}
                    {r.reviewed_at && <span className="text-smoke"> · {formatDate(r.reviewed_at)}</span>}
                  </p>
                )}

                {open ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!gone && (
                      <button type="button" disabled={busy} onClick={() => removeMessage(r)} className="btn-secondary !py-2 text-xs">
                        <Icon name="trash" className="h-4 w-4" /> Delete the message
                      </button>
                    )}
                    {r.author && !r.author.is_admin && r.author.status !== 'muted' && (
                      <button type="button" disabled={busy} onClick={() => muteAuthor(r)} className="btn-secondary !py-2 text-xs">
                        <Icon name="mute" className="h-4 w-4" /> Mute {r.author.name.split(' ')[0]}
                      </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => decide(r, 'dismissed')} className="btn-ghost !py-2 text-xs">
                      No action needed
                    </button>
                    {r.status === 'new' && (
                      <button type="button" disabled={busy} onClick={() => decide(r, 'reviewing')} className="btn-ghost !py-2 text-xs sm:ml-auto">
                        Mark as looking at it
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-4">
                    <button type="button" disabled={busy} onClick={() => decide(r, 'new')} className="btn-ghost !py-2 text-xs">
                      Reopen
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </Reveal>
      )}

      {/* The reviewer's own name is never shown to the reporter or the author -
          this is a note to the team, not a verdict published to the community. */}
      {user && rows !== null && rows.length > 0 && (
        <p className="mt-8 text-xs text-smoke">
          Reports are only visible to the team and to whoever filed them. Nobody is told who reported a message.
        </p>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// REPORTED CREATORS.
//
// The other half of this page, and it is a separate list rather than a `kind`
// column on the one above for the same reason the tables are separate: a
// message report is a complaint about something that was SAID, and everything
// above is built around the snapshot of it. This is a complaint about a person.
// There is nothing to quote, so the card leads with who they are, and the
// actions are about the account rather than about a post.
//
// Ethan: "this will show up on the report section we already have for the chats
// on the admin panel, but obviously it'll be split for like report a creator."

const C_TABS = [
  { key: 'open', label: 'To review', match: (r) => r.status === 'new' || r.status === 'reviewing' },
  { key: 'closed', label: 'Closed', match: (r) => r.status === 'actioned' || r.status === 'dismissed' },
  { key: 'all', label: 'Everything', match: () => true },
]

function CreatorReports({ onCount }) {
  const [rows, setRows] = useState(null)
  const [tab, setTab] = useState('open')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('creator_reports')
      .select('*, reporter:reporter_id(id, name, photo_url), reported:reported_id(id, name, photo_url, city, country, status, is_admin)')
      .order('created_at', { ascending: false })
      .limit(300)
    setRows(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (rows) onCount?.(rows.filter(C_TABS[0].match).length) }, [rows, onCount])

  // No RPC for this one. `decide_message_report` exists because that table
  // needs a definer to reach a DM the admin is not a participant in; here the
  // update policy is plain `is_admin()` and a direct write is the whole job.
  async function decide(report, status) {
    const note = await promptText(
      status === 'actioned' ? 'What did you do about it?' : 'Why is this being dismissed?',
      { placeholder: 'Optional, for the record', confirmLabel: 'Save' },
    )
    setBusyId(report.id)
    const { data: { user } = {} } = await supabase.auth.getUser()
    const { error } = await supabase.from('creator_reports').update({
      status,
      admin_note: note || null,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', report.id)
    setBusyId(null)
    if (error) { await notice(`Could not save that: ${error.message}`); return }
    load()
  }

  async function mute(report) {
    const name = report.reported?.name || 'this creator'
    if (!await confirm(`Mute ${name}? They can read but not post until you unmute them in Admin → Creators.`)) return
    setBusyId(report.id)
    const { error } = await supabase.from('profiles').update({ status: 'muted' }).eq('id', report.reported_id)
    if (error) { setBusyId(null); await notice(`Could not mute them: ${error.message}`); return }
    const { data: { user } = {} } = await supabase.auth.getUser()
    await supabase.from('creator_reports').update({
      status: 'actioned', admin_note: `${name} muted.`,
      reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString(),
    }).eq('id', report.id)
    setBusyId(null)
    load()
  }

  const active = C_TABS.find((t) => t.key === tab) ?? C_TABS[0]
  const list = (rows ?? []).filter(active.match)

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {C_TABS.map((t) => {
          const n = (rows ?? []).filter(t.match).length
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={cx('rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200',
                tab === t.key ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hover:text-ink active:scale-95')}>
              {t.label}{n > 0 && <span className="ml-1.5 opacity-80">{n}</span>}
            </button>
          )
        })}
      </div>

      {rows === null ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Icon name="shield" className="h-7 w-7" />}
          title={tab === 'open' ? 'Nothing to review' : 'Nothing here'}
          hint={tab === 'open'
            ? 'When somebody reports a creator from their profile, it turns up here.'
            : 'Reports you have actioned or dismissed will be listed here.'}
        />
      ) : (
        <Reveal className="space-y-3" stagger={0.04}>
          {list.map((r) => {
            const st = REPORT_STATUS[r.status] ?? REPORT_STATUS.new
            const open = r.status === 'new' || r.status === 'reviewing'
            return (
              <div key={r.id} className="card !p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <Avatar src={r.reported?.photo_url} name={r.reported?.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link to={`/profile/${r.reported_id}`} className="font-semibold hover:text-brand">
                        {r.reported?.name || 'Unknown creator'}
                      </Link>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {r.reported?.status === 'muted' && <Badge tone="grey">Muted</Badge>}
                    </p>
                    <p className="mt-0.5 text-xs text-smoke">
                      {CREATOR_REPORT_LABEL[r.reason] || r.reason}
                      {' · reported by '}
                      <Link to={`/profile/${r.reporter_id}`} className="hover:text-brand">
                        {r.reporter?.name || 'someone'}
                      </Link>
                      {' · '}{timeAgo(r.created_at)}
                    </p>
                  </div>
                </div>

                {/* SCROLLS, NEVER CLAMPS - the same rule the message snapshot
                    follows. A report cut off mid-sentence is a report an admin
                    has to guess at. */}
                {r.details && (
                  <div className="mt-3 max-h-40 overflow-y-auto overscroll-contain rounded-xl bg-cloud/60 px-4 py-3 text-sm leading-relaxed text-ink">
                    {r.details}
                  </div>
                )}

                {r.admin_note && (
                  <p className="mt-3 text-xs text-smoke">
                    <span className="font-semibold text-ink">Note:</span> {r.admin_note}
                    {r.reviewed_at && ` · ${formatDate(r.reviewed_at)}`}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {open ? (
                    <>
                      <Link to={`/profile/${r.reported_id}`} className="btn-secondary !py-1.5 text-xs">
                        Look at their profile
                      </Link>
                      {/* An admin cannot be muted from here. It is not a
                          permission check, it is a guard against the one
                          misclick on this page that locks a colleague out. */}
                      {!r.reported?.is_admin && r.reported?.status !== 'muted' && (
                        <button onClick={() => mute(r)} disabled={busyId === r.id}
                          className="btn-danger !py-1.5 text-xs">Mute them</button>
                      )}
                      <button onClick={() => decide(r, 'actioned')} disabled={busyId === r.id}
                        className="btn-primary !py-1.5 text-xs">Actioned</button>
                      <button onClick={() => decide(r, 'dismissed')} disabled={busyId === r.id}
                        className="btn-ghost !py-1.5 text-xs">Dismiss</button>
                    </>
                  ) : (
                    <button onClick={() => decide(r, 'new')} disabled={busyId === r.id}
                      className="btn-ghost !py-1.5 text-xs">Reopen</button>
                  )}
                </div>
              </div>
            )
          })}
        </Reveal>
      )}
    </>
  )
}

// THE PAGE, WHICH IS NOW TWO QUEUES.
//
// A single toggle at the top rather than two entries in the admin menu: they
// are the same job - somebody objected to something, decide what to do - and
// splitting them across two pages means an admin has to remember to check both.
// The counts sit in the toggle so a glance answers "is there anything waiting"
// for both at once.
const SOURCES = [
  { key: 'messages', label: 'Messages' },
  { key: 'creators', label: 'Creators' },
]

export default function AdminReports() {
  const [source, setSource] = useState('messages')
  const [counts, setCounts] = useState({ messages: null, creators: null })
  const onMessages = useCallback((n) => setCounts((c) => (c.messages === n ? c : { ...c, messages: n })), [])
  const onCreators = useCallback((n) => setCounts((c) => (c.creators === n ? c : { ...c, creators: n })), [])

  return (
    <div className="page max-w-4xl">
      <PageHeader
        title="Reports"
        subtitle="What creators have flagged, and what was done about it."
      />

      <div className="mb-5 inline-flex rounded-full bg-cloud p-1">
        {SOURCES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSource(s.key)}
            className={cx(
              'rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200',
              source === s.key ? 'bg-white text-ink shadow-card' : 'text-smoke hover:text-ink',
            )}
          >
            {s.label}
            {counts[s.key] > 0 && (
              <span className="ml-1.5 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                {counts[s.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* BOTH STAY MOUNTED. Unmounting the hidden one would drop its rows and
          its unread count, so the toggle would lose the badge on whichever
          queue you are not looking at - which is the one the badge is for. */}
      <div className={source === 'messages' ? undefined : 'hidden'}><MessageReports onCount={onMessages} /></div>
      <div className={source === 'creators' ? undefined : 'hidden'}><CreatorReports onCount={onCreators} /></div>
    </div>
  )
}
