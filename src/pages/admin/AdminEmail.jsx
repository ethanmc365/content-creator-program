import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, CopyButton, PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import { cx, formatDateTime } from '../../lib/utils'
import { confirm, notice } from '../../lib/confirm'
import { openCompose } from '../../lib/compose'
import MarketScope, { useMarkets } from '../../components/admin/MarketScope'
import { roleBadgeTitle } from '../../lib/roles'

// The email page. NOTHING ON IT SENDS AN EMAIL ANY MORE (3 Sep 2026).
//
// Ethan: "for now, all email automations will be paused. Email will be done
// manually, because we're gonna set up the DNS record at a later time. Obviously
// we still want the email admin panel thing so I have the ability to copy all
// emails - but the welcome email etc, that should be abolished. Although I'll
// still have the option to copy all the emails and then send a custom welcome
// email myself."
//
// The platform's outbound mail was already down to two jobs after a run of
// near-identical messages out of a shared mailbox got it flagged as a bulk
// sender. This removes the second of them. What is left is:
//
//   1. Password resets   sent by Supabase Auth, logged here. Not ours to pause -
//                        it is transactional, it is triggered by the person
//                        receiving it, and pausing it locks people out.
//   2. Welcome emails    still QUEUED when a creator is accepted, because the
//                        queue is the worklist. But the queue now hands the
//                        message to Ethan's own Gmail with everything filled
//                        in, and he presses send. See lib/compose.
//
// WHY THE QUEUE SURVIVED THE "ABOLISH IT". The thing to abolish was the
// platform mailing people. The thing worth keeping is the LIST: who was
// accepted, in what order, and whether anybody has actually written to them
// yet. Deleting the queue would not have made the work go away, it would have
// made it untracked - and "did we ever welcome that creator" has no answer
// anywhere else.
//
// The `send-welcome` edge function is no longer called from anywhere in the
// client. It is left deployed rather than removed for the same reason
// `broadcast-email` was left as a 410 stub: a function that is still up but
// unreferenced is safe, and a deleted directory that leaves a live older
// version reachable by URL is not. Retiring it properly is a separate job.

export default function AdminEmail() {
  const [people, setPeople] = useState([])   // creators, with their address
  const [team, setTeam] = useState([])       // the Tryp.com team, with theirs
  const [queue, setQueue] = useState([])
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [emailById, setEmailById] = useState(new Map())
  const { markets, memberRows } = useMarkets()
  const [market, setMarket] = useState('')

  const load = useCallback(async () => {
    const [{ data: profiles }, { data: emailRows }, { data: pending }, { data: logRows }] = await Promise.all([
      supabase.from('profiles').select('id, name, photo_url, status, is_admin, is_test, deletion_requested_at, platform_role, role_title'),
      supabase.rpc('admin_list_emails'),
      supabase.from('email_outbox').select('*').eq('status', 'pending').order('created_at', { ascending: true }),
      supabase.rpc('email_log', { p_limit: 100 }),
    ])
    const emailOf = new Map((emailRows ?? []).map((r) => [r.id, r.email]))
    const live = (profiles ?? []).filter(
      (p) => p.status === 'active' && !p.is_test && !p.deletion_requested_at && emailOf.get(p.id))
    const withEmail = (p) => ({ ...p, email: emailOf.get(p.id) })
    // Community creators only: active, never admins, never the QA test
    // accounts, never anyone on their way out.
    setPeople(live.filter((p) => !p.is_admin).map(withEmail).sort(byName))
    setTeam(live.filter((p) => p.is_admin).map(withEmail).sort(byName))
    setQueue(pending ?? [])
    setLog(logRows ?? [])
    // The queue needs the address to hand to Gmail, and `email_outbox` carries
    // only `recipient_id` - deliberately, so a queued row cannot go stale
    // against a changed address.
    setEmailById(emailOf)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // A creator belongs to the market they are a member of. Same rule as
  // Analytics and Rewards, so "the Spanish list" means the same thing on all
  // three pages.
  const inMarket = useMemo(() => {
    if (!market) return null
    return new Set(memberRows.filter((m) => m.community_id === market).map((m) => m.profile_id))
  }, [market, memberRows])

  const creators = useMemo(
    () => (inMarket ? people.filter((p) => inMarket.has(p.id)) : people),
    [people, inMarket],
  )

  return (
    <div className="page max-w-7xl">
      <PageHeader back="/admin" title="Email" />

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-10">
          <MarketScope
            markets={markets}
            value={market}
            onChange={setMarket}
            note={market ? `${creators.length} of ${people.length} creators` : null}
          />
          <AddressBook creators={creators} team={team} scoped={!!market} />
          {/* THE WELCOME QUEUE IS HIDDEN, NOT DELETED (4 Sep 2026).
              Ethan: "remove the welcome emails thing from the email admin tool -
              there are no more automatic emails for now, so hide it for now,
              don't have to delete it all."

              It is a to-do list for mail nobody is currently sending: outbound
              email is paused until mail.tryp.com exists (see the DNS work in
              [[andre-infrastructure-ask]]), and a queue that fills up with
              people you are not going to write to is a growing red number that
              means nothing. The trigger still WRITES the rows, so nothing is
              lost and the history is intact - this is one flag away from coming
              back the day mail works.

              `ReviewQueue` and everything it needs are left in place
              deliberately: deleting them would mean rebuilding the whole thing
              rather than flipping this back. */}
          {SHOW_WELCOME_QUEUE && (
            <ReviewQueue queue={queue} setQueue={setQueue} emailById={emailById} />
          )}
          <SentLog rows={log} />
        </div>
      )}
    </div>
  )
}

// Turn this back on the day outbound email actually sends. See the note at the
// call site: the rows are still written, so switching it on shows the real
// backlog rather than starting from nothing.
const SHOW_WELCOME_QUEUE = false

// ---------------------------------------------------------------------------
// THE ADDRESS BOOK.
//
// This was one button that copied 45 addresses in a lump. It is the way the
// programme reaches anybody by email - the platform deliberately sends to one
// person at a time - and a lump is the wrong shape for most of what it gets
// used for. Ethan asked for the three things it was missing, and they are all
// the same complaint: you could not take a SUBSET.
//
//   * A copy button per creator, because the common case is mailing ONE of
//     them and the address was not written down anywhere you could reach.
//   * Split by market, because "the Spanish creators" is a real audience and
//     the whole list is not.
//   * The team's own addresses, kept apart. They were simply absent - the list
//     excluded admins, correctly, and then offered nothing else.
//
// Test accounts, admins-in-the-creator-list and anybody mid-deletion stay out
// of all of it.
const byName = (a, b) => (a.name || '').localeCompare(b.name || '')

// The bulk copy. Its own component rather than a <CopyButton>, because it needs
// to say the number out loud - "Copy all 44 emails" is a different promise from
// a clipboard glyph, and pasting 44 addresses into a BCC field is a different
// act from copying one.
function CopyAll({ value, count }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Older or insecure contexts have no async clipboard.
      const ta = document.createElement('textarea')
      ta.value = value
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } finally { document.body.removeChild(ta) }
    }
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2200)
  }

  return (
    <button
      type="button"
      onClick={copy}
      disabled={!count}
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 disabled:opacity-40',
        copied
          ? 'bg-green-100 text-green-700'
          : 'bg-brand text-white hover:-translate-y-0.5 hover:shadow-card',
      )}
    >
      <Icon name={copied ? 'check' : 'copy'} className="h-3.5 w-3.5" />
      {copied ? `Copied ${count}` : count === 1 ? 'Copy their email' : `Copy all ${count} emails`}
    </button>
  )
}

function AddressRow({ person, subtitle }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-cloud/60">
      <Avatar src={person.photo_url} name={person.name} size="xs" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{person.name}</p>
        <p className="truncate text-xs text-smoke">{person.email}</p>
      </div>
      {subtitle && <span className="hidden shrink-0 text-[11px] text-smoke sm:block">{subtitle}</span>}
      <CopyButton value={person.email} label={`Copy ${person.name}'s address`} />
    </div>
  )
}

function AddressList({ title, people, empty, subtitleOf }) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(false)

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return people
    return people.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(q))
  }, [people, search])

  // A list that is 45 rows long pushes the review queue off the page, so it
  // opens at ten and says how many more there are.
  const visible = expanded ? shown : shown.slice(0, 10)
  const all = people.map((p) => p.email).join(', ')

  return (
    <section className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3">
        <h3 className="text-[15px] font-semibold">
          {title} <span className="ml-1 font-normal tabular-nums text-smoke">{people.length}</span>
        </h3>
        {people.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            {people.length > 8 && (
              <input
                type="search" className="input !w-44 !py-1.5 !no-ios-zoom sm:text-xs" placeholder="Search…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                aria-label={`Search ${title.toLowerCase()}`}
              />
            )}
            {/* A LABELLED BUTTON, NOT THE SAME ICON AS EVERY ROW.
                Copying one person's address and copying the entire community
                are very different acts, and drawing them as the identical
                20px square meant the dangerous one was the quiet one. This
                says what it does and how many it will do it to. */}
            <CopyAll value={all} count={people.length} />
          </div>
        )}
      </div>

      {people.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-smoke">{empty}</p>
      ) : shown.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-smoke">Nothing matches &ldquo;{search}&rdquo;.</p>
      ) : (
        <>
          <div className="divide-y divide-gray-50">
            {visible.map((p) => <AddressRow key={p.id} person={p} subtitle={subtitleOf?.(p)} />)}
          </div>
          {shown.length > 10 && (
            <div className="border-t border-gray-100 px-4 py-2.5 text-center">
              <button type="button" onClick={() => setExpanded((v) => !v)} className="btn-ghost !py-1.5 text-xs">
                {expanded ? 'Show less' : `Show all ${shown.length}`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function AddressBook({ creators, team, scoped }) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <AddressList
        title={scoped ? 'Creators in this market' : 'Creators'}
        people={creators}
        empty={scoped ? 'No creators in this market yet.' : 'No creators yet.'}
      />
      <AddressList
        title="Tryp.com team"
        people={team}
        empty="Nobody on the team has an account yet."
        subtitleOf={(p) => roleBadgeTitle(p)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Review queue.
//
// When a creator is accepted, a database trigger writes their welcome email
// here as a draft. Nothing is sent until an admin reads it and presses send, so
// you can add a personal line or a piece of news before it goes out.
// ---------------------------------------------------------------------------
// THE WELCOME QUEUE, WHICH NO LONGER SENDS ANYTHING.
//
// Every accepted creator still lands here - see the note at the head of this
// file for why the list is worth keeping even though the sending is not. What
// changed is the last press: "Send welcome email" called an edge function and
// the platform mailed them; "Open in Gmail" fills in Ethan's own compose window
// and he sends it himself.
//
// MARKING IT SENT IS A SEPARATE PRESS, ON PURPOSE. Opening a compose window is
// not evidence that anybody sent anything - the tab can be closed, the popup can
// be blocked, the message can be abandoned half-written. If opening the composer
// also cleared the row, the one question this list exists to answer ("has this
// creator been welcomed?") would be answered wrong by exactly the cases where it
// matters. So the row stays until somebody says it went.
//
// THE PREVIEW IS GONE WITH THE TEMPLATE. It rendered the branded HTML the edge
// function would have wrapped this in, and no such email exists any more: what
// gets sent is whatever is typed here, as plain text, out of Gmail. Previewing a
// wrapper nobody is using would be a picture of something that will not happen.
// What is on screen now is the message itself, which is the thing being sent.
function ReviewQueue({ queue, setQueue, emailById }) {
  const [openId, setOpenId] = useState(null)
  const [acting, setActing] = useState(null) // 'sent' | 'skip' | 'save'

  const item = queue.find((q) => q.id === openId) || queue[0] || null
  const patch = (id, changes) => setQueue((list) => list.map((q) => (q.id === id ? { ...q, ...changes } : q)))
  const address = item ? emailById.get(item.recipient_id) : null

  function openInGmail() {
    if (!address) {
      notice("We do not have an address for this creator, so there is nothing to open. Copy the message and send it from wherever you have their address.")
      return
    }
    const opened = openCompose({ to: address, subject: item.subject, body: item.body })
    // A blocked popup has to be said out loud. A button that silently does
    // nothing is how somebody walks away believing the email went.
    if (!opened) notice("Your browser blocked the new window. Allow popups for this site, or copy the message and paste it into Gmail yourself.")
  }

  async function markSent() {
    const who = item.recipient_name || 'this creator'
    if (!await confirm(`Mark the welcome email to ${who} as sent?\n\nThis only records that you have written to them - it does not send anything.`)) return
    setActing('sent')
    const { error } = await supabase.from('email_outbox')
      .update({ status: 'sent', decided_at: new Date().toISOString() })
      .eq('id', item.id)
    setActing(null)
    if (error) return notice(`Could not save that: ${error.message}`)
    setQueue((list) => list.filter((q) => q.id !== item.id))
  }

  async function skip() {
    const who = item.recipient_name || 'this creator'
    if (!await confirm(`Take ${who} off the welcome list?\n\nThey are already in the community and have their in-app notification. This only drops the reminder to write to them.`)) return
    setActing('skip')
    await supabase.from('email_outbox')
      .update({ status: 'declined', decided_at: new Date().toISOString() })
      .eq('id', item.id)
    setActing(null)
    setQueue((list) => list.filter((q) => q.id !== item.id))
  }

  async function saveEdits() {
    setActing('save')
    const { error } = await supabase.from('email_outbox')
      .update({ subject: item.subject, body: item.body })
      .eq('id', item.id)
    setActing(null)
    notice(error ? `Could not save: ${error.message}` : 'Draft saved.')
  }

  if (queue.length === 0) {
    return (
      <section>
        <SectionHeading icon="envelope" title="Creators to welcome" />
        <div className="rounded-card border border-dashed border-gray-200 bg-white px-8 py-14 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand">
            <Icon name="check" className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-semibold">Everybody has been written to</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-smoke">
            When you accept a creator, they appear here with a draft welcome. You send it from
            your own Gmail and mark it off. The platform does not email anyone.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <SectionHeading
        icon="envelope"
        title="Creators to welcome"
        hint={`${queue.length} waiting. You send these from your own Gmail - the platform sends nothing.`}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[20rem_1fr]">
        {/* Who is waiting */}
        <div className="space-y-3">
          {queue.map((q) => (
            <button
              key={q.id}
              onClick={() => setOpenId(q.id)}
              className={`card w-full !p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lift ${
                q.id === item.id ? 'ring-2 ring-brand' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon name="star" className="h-4 w-4 shrink-0 text-brand" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-smoke">New creator</span>
              </div>
              <p className="mt-1.5 truncate text-sm font-semibold">{q.recipient_name || 'Creator'}</p>
              <p className="mt-1 text-xs text-smoke">Accepted {formatDateTime(q.created_at)}</p>
            </button>
          ))}
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold">
            Welcome {item.recipient_name || 'this creator'}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-smoke">
            {address ? (
              <>
                <span className="font-medium text-ink">{address}</span>
                <CopyButton value={address} label="Copy their address" />
              </>
            ) : (
              <span className="text-red-600">No address on file for this creator.</span>
            )}
          </div>
          <p className="mt-2 text-sm text-smoke">
            Edit anything below, then open it in Gmail and send it yourself. They already have
            their in-app notification, so there is no rush.
          </p>

          <div className="mt-5 space-y-4 border-t border-gray-100 pt-5">
            <div>
              <label htmlFor="q-subject" className="label">Subject</label>
              <input
                id="q-subject" type="text" className="input"
                value={item.subject} onChange={(e) => patch(item.id, { subject: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="q-body" className="label">Message</label>
              <textarea
                id="q-body" rows={16} className="input"
                value={item.body} onChange={(e) => patch(item.id, { body: e.target.value })}
              />
              <p className="mt-1 text-xs text-smoke">
                Plain text, sent as-is from your own mailbox. There is no branded wrapper any
                more - what is in this box is what they read.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
            <button onClick={openInGmail} disabled={!!acting} className="btn-primary inline-flex items-center gap-1.5 !py-2 text-xs">
              <Icon name="envelope" className="h-3.5 w-3.5" />
              Open in Gmail
            </button>
            <CopyButton value={`${item.subject}\n\n${item.body}`} label="Copy the message" />
            <button onClick={saveEdits} disabled={!!acting} className="btn-ghost !py-2 text-xs">
              {acting === 'save' ? 'Saving…' : 'Save draft'}
            </button>
            <button onClick={markSent} disabled={!!acting} className="btn-secondary !py-2 text-xs">
              {acting === 'sent' ? 'Saving…' : 'I have sent it'}
            </button>
            <button onClick={skip} disabled={!!acting} className="btn-danger !py-2 text-xs ml-auto">
              {acting === 'skip' ? 'Removing…' : 'Skip'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// The log. Every email the platform is responsible for, newest first. Password
// resets are recorded when the request is made (the mail itself is sent by
// Supabase Auth, so there is no delivery receipt to show); welcome emails are
// recorded when we hand them to the mail server.
const KIND_META = {
  welcome: { label: 'Welcome email', icon: 'star' },
  password_reset: { label: 'Password reset', icon: 'key' },
  auth: { label: 'Password reset', icon: 'key' },
  invoice: { label: 'Invoice', icon: 'money' },
  broadcast: { label: 'Broadcast (retired)', icon: 'megaphone' },
  notification: { label: 'Notification (retired)', icon: 'bell' },
}

function SentLog({ rows }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? rows : rows.slice(0, 15)

  return (
    <section>
      <SectionHeading
        icon="clock"
        title="Email log"
        hint="Every email the platform has sent or requested, newest first."
      />

      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-sm text-smoke">
          Nothing sent yet.
        </p>
      ) : (
        <div className="card !p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">To</th>
                  <th className="px-5 py-3">Subject</th>
                  <th className="px-5 py-3">Sent</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const meta = KIND_META[r.kind] || { label: r.kind, icon: 'envelope' }
                  return (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0 align-top">
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <span className="inline-flex items-center gap-2 font-medium">
                          <Icon name={meta.icon} className="h-4 w-4 text-brand" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="max-w-[16rem] truncate px-5 py-3.5 text-smoke">
                        {r.recipient_name || r.recipient_email || 'Unknown'}
                      </td>
                      <td className="max-w-[20rem] truncate px-5 py-3.5">{r.subject || '-'}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-smoke">{formatDateTime(r.created_at)}</td>
                      <td className="px-5 py-3.5">
                        {r.status === 'sent' ? (
                          <Badge tone="green">Sent</Badge>
                        ) : (
                          <span className="inline-flex flex-col gap-1">
                            <Badge tone="red">Failed</Badge>
                            {r.error && <span className="max-w-[14rem] truncate text-[11px] text-red-500">{r.error}</span>}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length > 15 && (
            <div className="border-t border-gray-100 px-5 py-3 text-center">
              <button onClick={() => setShowAll((v) => !v)} className="btn-ghost !py-1.5 text-xs">
                {showAll ? 'Show less' : `Show all ${rows.length}`}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function SectionHeading({ icon, title, hint }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <Icon name={icon} className="h-5 w-5 text-brand" />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {hint && <p className="mt-1 text-sm text-smoke">{hint}</p>}
    </div>
  )
}
