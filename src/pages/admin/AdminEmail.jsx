import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, Skeleton, Spinner, Badge } from '../../components/ui'
import Icon from '../../components/Icon'
import { formatDateTime } from '../../lib/utils'
import { confirm, notice } from '../../lib/confirm'

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
  const [addresses, setAddresses] = useState([])
  const [queue, setQueue] = useState([])
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const [{ data: profiles }, { data: emailRows }, { data: pending }, { data: logRows }] = await Promise.all([
      supabase.from('profiles').select('id, status, is_admin, is_test, deletion_requested_at'),
      supabase.rpc('admin_list_emails'),
      supabase.from('email_outbox').select('*').eq('status', 'pending').order('created_at', { ascending: true }),
      supabase.rpc('email_log', { p_limit: 100 }),
    ])
    // Community creators only: active, never admins, never the QA test
    // accounts, never anyone on their way out.
    const creatorIds = new Set(
      (profiles ?? [])
        .filter((p) => p.status === 'active' && !p.is_admin && !p.is_test && !p.deletion_requested_at)
        .map((p) => p.id)
    )
    setAddresses((emailRows ?? []).filter((r) => creatorIds.has(r.id) && r.email).map((r) => r.email))
    setQueue(pending ?? [])
    setLog(logRows ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // Copy every creator address, with a textarea fallback for browsers that
  // block the async clipboard API. Comma separated so it pastes straight into a
  // BCC field or an external mailing tool.
  async function copyEmails() {
    const list = addresses.join(', ')
    try {
      await navigator.clipboard.writeText(list)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = list
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

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
      <PageHeader
        title="Email"
        subtitle="Welcome emails wait here for your approval. Everything else the community hears about is push and the in-app bell."
      />

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-8">
          <AddressList count={addresses.length} copied={copied} onCopy={copyEmails} />
          <ReviewQueue queue={queue} setQueue={setQueue} callFn={callFn} reload={load} />
          <SentLog rows={log} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The address list. This is now the way to reach the whole community by email:
// copy it, paste it into a real mailing tool. Sending from the platform is
// deliberately limited to one person at a time.
function AddressList({ count, copied, onCopy }) {
  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon name="users" className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-semibold">Creator address list</h2>
          </div>
          <p className="mt-1 max-w-xl text-sm text-smoke">
            Every active creator, comma separated. Admins and test accounts are left out.
            Paste it into the BCC field of a mailing tool when you need to reach everybody.
          </p>
        </div>
        <button onClick={onCopy} disabled={count === 0} className="btn-primary !py-2.5 inline-flex items-center gap-2 text-sm">
          <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
          {copied ? `Copied ${count} addresses` : `Copy all ${count} emails`}
        </button>
      </div>
    </section>
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
                  Opens the Creator Program at <code className="text-brand">{item.cta_path}</code>.
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
