import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, CopyButton, PageHeader, Skeleton, Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import { cx, formatDateTime } from '../../lib/utils'
import { confirm, notice } from '../../lib/confirm'
import MarketScope, { useMarkets } from '../../components/admin/MarketScope'
import { roleBadgeTitle } from '../../lib/roles'

// The email page, rebuilt Jul 27 2026.
//
// The platform used to mail the whole community from here. That is gone: a run
// of near-identical messages out of a shared mailbox got us flagged as a bulk
// sender and Gmail started blocking it outright. Email is now down to the two
// jobs that are low volume and genuinely expected by the person receiving them:
//
//   1. Password resets   sent by Supabase Auth, logged here
//   2. Welcome emails    one per accepted creator, reviewed here before sending
//
// So this page does three things and nothing else: hand you the address list,
// let you approve the welcome emails, and show you what has actually been sent.
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-welcome`

export default function AdminEmail() {
  const [people, setPeople] = useState([])   // creators, with their address
  const [team, setTeam] = useState([])       // the Tryp.com team, with theirs
  const [queue, setQueue] = useState([])
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)
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

  // One helper for every call to the mail function. Errors are surfaced from
  // the response body: the function always answers with JSON + CORS headers, so
  // a real failure never shows up as a bogus "network error".
  const callFn = useCallback(async (payload) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(payload),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) return { error: out.error || `Request failed (${res.status}).` }
      return out
    } catch (e) {
      return { error: `Could not reach the email service: ${e.message}` }
    }
  }, [])

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
          <ReviewQueue queue={queue} setQueue={setQueue} callFn={callFn} reload={load} />
          <SentLog rows={log} />
        </div>
      )}
    </div>
  )
}

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
function ReviewQueue({ queue, setQueue, callFn, reload }) {
  const [openId, setOpenId] = useState(null)
  const [html, setHtml] = useState('')
  const [busy, setBusy] = useState(false)
  const [acting, setActing] = useState(null) // 'send' | 'cancel' | 'test' | 'save'

  const item = queue.find((q) => q.id === openId) || queue[0] || null
  const patch = (id, changes) => setQueue((list) => list.map((q) => (q.id === id ? { ...q, ...changes } : q)))

  // Render the exact HTML the creator would receive, debounced as you type.
  useEffect(() => {
    if (!item) { setHtml(''); return }
    let alive = true
    setBusy(true)
    const t = setTimeout(async () => {
      const out = await callFn({
        action: 'preview',
        subject: item.subject, body: item.body,
        ctaLabel: item.cta_label, ctaPath: item.cta_path,
      })
      if (!alive) return
      if (out?.html) setHtml(out.html)
      setBusy(false)
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [item, callFn])

  async function send() {
    const who = item.recipient_name || 'this creator'
    if (!await confirm(`Send this welcome email to ${who}?`)) return
    setActing('send')
    const out = await callFn({
      outboxId: item.id,
      subject: item.subject, body: item.body,
      ctaLabel: item.cta_label, ctaPath: item.cta_path,
    })
    setActing(null)
    if (out.error) return notice(out.error)
    notice(`Welcome email sent to ${who}.`)
    setQueue((list) => list.filter((q) => q.id !== item.id))
    reload()
  }

  async function cancel() {
    const who = item.recipient_name || 'this creator'
    if (!await confirm(`Cancel the welcome email to ${who}?\n\nThey are already in the community and have their in-app notification. Only the email is dropped.`)) return
    setActing('cancel')
    await supabase.from('email_outbox')
      .update({ status: 'declined', decided_at: new Date().toISOString() })
      .eq('id', item.id)
    setActing(null)
    setQueue((list) => list.filter((q) => q.id !== item.id))
  }

  async function test() {
    setActing('test')
    const out = await callFn({
      test: true,
      subject: item.subject, body: item.body,
      ctaLabel: item.cta_label, ctaPath: item.cta_path,
    })
    setActing(null)
    notice(out.error || 'Test sent to your inbox.')
  }

  async function saveEdits() {
    setActing('save')
    const { error } = await supabase.from('email_outbox')
      .update({ subject: item.subject, body: item.body, cta_label: item.cta_label })
      .eq('id', item.id)
    setActing(null)
    notice(error ? `Could not save: ${error.message}` : 'Draft saved.')
  }

  if (queue.length === 0) {
    return (
      <section>
        <SectionHeading icon="envelope" title="Welcome emails to review" />
        <div className="rounded-card border border-dashed border-gray-200 bg-white px-8 py-14 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand">
            <Icon name="check" className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-semibold">Nothing waiting</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-smoke">
            When you accept a creator into the community, their welcome email lands here as a
            draft. Read it, add anything you want to share, then send it.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <SectionHeading
        icon="envelope"
        title="Welcome emails to review"
        hint={`${queue.length} waiting. Nothing sends until you press send.`}
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

        {/* Editor + preview */}
        <div className="grid items-start gap-6 2xl:grid-cols-2">
          <div className="card">
            <h3 className="text-lg font-semibold">
              Welcome {item.recipient_name || 'this creator'}
            </h3>
            <p className="mt-1 text-sm text-smoke">
              Edit anything below, add news if you have some, then send. They already have their
              in-app notification, so there is no rush.
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
                  Plain text. Leave a blank line between paragraphs, and we wrap it in the branded template.
                </p>
              </div>
              <div>
                <label htmlFor="q-cta" className="label">Button text</label>
                <input
                  id="q-cta" type="text" className="input"
                  value={item.cta_label || ''} onChange={(e) => patch(item.id, { cta_label: e.target.value })}
                />
                <p className="mt-1 text-xs text-smoke">
                  Opens the Creator Community at <code className="text-brand">{item.cta_path}</code>.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
              <button onClick={send} disabled={!!acting} className="btn-primary !py-2 text-xs">
                {acting === 'send' ? <Spinner className="h-4 w-4" /> : 'Send welcome email'}
              </button>
              <button onClick={test} disabled={!!acting} className="btn-secondary !py-2 text-xs">
                {acting === 'test' ? 'Sending…' : 'Send test to me'}
              </button>
              <button onClick={saveEdits} disabled={!!acting} className="btn-ghost !py-2 text-xs">
                {acting === 'save' ? 'Saving…' : 'Save draft'}
              </button>
              <button onClick={cancel} disabled={!!acting} className="btn-danger !py-2 text-xs ml-auto">
                {acting === 'cancel' ? 'Cancelling…' : 'Cancel'}
              </button>
            </div>
          </div>

          <div className="card 2xl:sticky 2xl:top-24">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Preview</h3>
                <p className="text-xs text-smoke">Exactly what they receive.</p>
              </div>
              {busy && <Spinner className="h-4 w-4 text-smoke" />}
            </div>
            {/* sandbox="allow-same-origin" (never allow-scripts): a fully
                sandboxed iframe gets an opaque origin, which stops the page CSP
                from matching and breaks the preview only. */}
            <div className="overflow-hidden rounded-xl border border-gray-100 bg-[#f6f6f7]">
              <iframe title="Welcome email preview" srcDoc={html} className="h-[38rem] w-full bg-white" sandbox="allow-same-origin" />
            </div>
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
