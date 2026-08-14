import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Badge, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import Reveal from '../../components/network/Reveal'
import { confirm, notice, promptText } from '../../lib/confirm'
import { REPORT_REASONS, REPORT_STATUS } from '../../lib/messageActions'
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

export default function AdminReports() {
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
    <div className="page max-w-4xl">
      <PageHeader
        title="Reported messages"
        subtitle="What creators have flagged in the rooms and in their DMs, and what was done about it."
      />

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
    </div>
  )
}
