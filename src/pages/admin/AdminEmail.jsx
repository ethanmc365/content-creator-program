import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, Skeleton, StatCard, Spinner, Toggle } from '../../components/ui'
import Icon from '../../components/Icon'
import { formatDateTime } from '../../lib/utils'
import { confirm, notice } from '../../lib/confirm'

// Email all creators, sent straight from the platform.
//
// The old flow opened Gmail's web composer with everyone in BCC. This now posts
// to the `broadcast-email` edge function, which verifies you're an admin and
// sends ONE branded message per recipient over SMTP (never a shared BCC, which
// is what keeps deliverability healthy and lets us log per-recipient results).
// "Send test to me" delivers a single copy to your own address first.
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/broadcast-email`

export default function AdminEmail() {
  const [tab, setTab] = useState('compose') // compose | templates | queue
  const [addresses, setAddresses] = useState([])
  const [usage, setUsage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaPath, setCtaPath] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  const [templates, setTemplates] = useState([])
  const [savingKey, setSavingKey] = useState(null)
  const [queue, setQueue] = useState([])

  const load = useCallback(async () => {
    const [{ data: profiles }, { data: emailRows }, { data: usageRows }, { data: tpls }, { data: pending }] = await Promise.all([
      supabase.from('profiles').select('id, status, is_admin, is_test, deletion_requested_at'),
      supabase.rpc('admin_list_emails'),
      supabase.rpc('email_usage'),
      supabase.from('email_templates').select('*').order('label'),
      supabase.from('email_outbox').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
    ])
    setTemplates(tpls ?? [])
    setQueue(pending ?? [])
    // Community creators only: active, never admins, never the test accounts,
    // never anyone on their way out. A message you write here is a direct
    // message to the programme, so it is NOT filtered by notification
    // preferences - those govern the automatic emails, not this one.
    const creatorIds = new Set(
      (profiles ?? [])
        .filter((p) => p.status === 'active' && !p.is_admin && !p.is_test && !p.deletion_requested_at)
        .map((p) => p.id)
    )
    setAddresses(
      (emailRows ?? []).filter((r) => creatorIds.has(r.id) && r.email).map((r) => r.email)
    )
    setUsage(Array.isArray(usageRows) ? usageRows[0] : usageRows)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const recipientCount = addresses.length

  // Copy every creator address, with a textarea fallback for browsers that
  // block the async clipboard API. Comma-separated so it pastes straight into
  // a BCC field or an external mailing tool.
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

  // Render the exact HTML the sender would produce.
  const renderPreview = useCallback(
    (p) => callFn({ action: 'preview', ...p }),
    [callFn]
  )
  // Send a single copy to the signed-in admin.
  const sendTest = useCallback(
    async (p) => { const out = await callFn({ test: true, ...p }); load(); return out },
    [callFn, load]
  )

  async function send({ test }) {
    if (!subject.trim() || !bodyText.trim()) return notice('Add a subject and a message first.')
    setSending(true)
    setResult(null)
    const out = await callFn({
      // 'broadcast' is a direct message from the team, not one of the automatic
      // notification categories, so the sender does not apply a per-type
      // notification preference to it.
      type: 'broadcast',
      subject: subject.trim(),
      body: bodyText.trim(),
      ctaLabel: ctaLabel.trim() || undefined,
      ctaPath: ctaPath.trim() || undefined,
      test,
    })
    if (out.error) setResult({ error: out.error })
    else {
      setResult(out)
      if (!test) { setSubject(''); setBodyText(''); setCtaLabel(''); setCtaPath('') }
      load()
    }
    setSending(false)
  }

  const sentToday = Number(usage?.sent_today ?? 0)
  const dailyLimit = Number(usage?.daily_limit ?? 500)
  const pctUsed = Math.min(100, Math.round((sentToday / dailyLimit) * 100))
  const wouldExceed = sentToday + recipientCount > dailyLimit

  return (
    <div className="page max-w-7xl">
      <PageHeader
        title="Email creators"
        subtitle="Compose once and send it to every creator, straight from the platform. Each person gets their own branded copy."
      />

      <div className="mb-8 flex gap-2">
        {[['compose', 'Compose'], ['templates', 'Automatic emails'], ['queue', 'Review queue']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`${tab === key ? 'btn-primary' : 'btn-secondary'} !py-2 text-sm inline-flex items-center gap-2`}
          >
            {label}
            {key === 'queue' && queue.length > 0 && (
              <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${tab === key ? 'bg-white text-brand' : 'bg-brand text-white'}`}>
                {queue.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : tab === 'queue' ? (
        <ReviewQueue
          queue={queue}
          setQueue={setQueue}
          renderPreview={renderPreview}
          callFn={callFn}
          reload={load}
        />
      ) : tab === 'templates' ? (
        <TemplatesPanel
          templates={templates}
          setTemplates={setTemplates}
          savingKey={savingKey}
          setSavingKey={setSavingKey}
          renderPreview={renderPreview}
          sendTest={sendTest}
        />
      ) : (
        <>
          <div className="mx-auto max-w-3xl">
          {/* ---------- Deliverability warning ----------
              Mail currently leaves through a personal Gmail account. Gmail's
              own outbound filter treats 30+ near-identical messages as bulk
              mail and returns "Message blocked ... unsolicited". Nothing in
              this page can fix that: it needs a sending domain we control. */}
          <section className="mb-8 rounded-card border border-amber-200 bg-amber-50 px-5 py-4">
            <div className="flex items-start gap-3">
              <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0 text-sm text-amber-900">
                <p className="font-semibold">Large sends are being blocked by Gmail</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-800">
                  Email leaves through a personal Gmail account, and Gmail rejects a run of
                  near-identical messages as unsolicited bulk mail. Until a Tryp sending domain is
                  verified with a proper email provider, keep broadcasts small, lean on the in-app
                  and push notification for anything urgent, and use "Copy all emails" if you need
                  to send from somewhere else. See <code className="font-semibold">docs/EMAIL_SETUP.md</code>.
                </p>
              </div>
            </div>
          </section>

          {/* ---------- Sending usage (replaces the old campaign log) ---------- */}
          <section className="card mb-8">
            <div className="mb-4 flex items-center gap-2">
              <Icon name="chart" className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-semibold">Sending usage</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Recipients" value={recipientCount} hint="Active creators" accent />
              <StatCard label="Sent today" value={sentToday} hint={`of ${dailyLimit} daily limit`} />
              <StatCard label="This month" value={Number(usage?.sent_month ?? 0)} />
              <StatCard label="All time" value={Number(usage?.sent_total ?? 0)} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
              <button
                onClick={copyEmails}
                disabled={recipientCount === 0}
                className="btn-secondary !py-2 text-xs inline-flex items-center gap-2"
              >
                <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
                {copied ? `Copied ${recipientCount} addresses` : 'Copy all emails'}
              </button>
              <p className="text-xs text-smoke">
                Every active creator, comma separated. Admins and test accounts are left out.
                Paste it into a BCC field or an external mailing tool.
              </p>
            </div>

            <div className="mt-5">
              <div className="mb-1.5 flex items-baseline justify-between text-xs">
                <span className="font-medium text-ink">Daily allowance</span>
                <span className="tabular-nums text-smoke">{sentToday} / {dailyLimit}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-cloud">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${pctUsed > 85 ? 'bg-red-500' : 'bg-gradient-to-r from-brand to-brand-light'}`}
                  style={{ width: `${Math.max(pctUsed, 2)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-smoke">
                Counted per recipient, which is how the provider measures it. One broadcast to{' '}
                {recipientCount} creators uses {recipientCount} of today's allowance. Resets at midnight UTC.
              </p>
              {Number(usage?.failed_today ?? 0) > 0 && (
                <p className="mt-2 text-xs font-medium text-red-600">
                  {Number(usage.failed_today)} failed to send today. Check the SMTP settings.
                </p>
              )}
            </div>
          </section>

          {/* ---------- Composer ---------- */}
          <section className="card space-y-5">
            <div>
              <label htmlFor="subject" className="label">Subject</label>
              <input id="subject" type="text" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. New challenge drops Monday" />
            </div>
            <div>
              <label htmlFor="email-body" className="label">Message</label>
              <textarea
                id="email-body" rows={10} className="input" value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Write your email to the whole community…&#10;&#10;Leave a blank line between paragraphs."
              />
              <p className="mt-1 text-xs text-smoke">Plain text. Blank lines become paragraphs, and we wrap it in the Tryp.com branded template.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="cta-label" className="label">Button text <span className="font-normal text-smoke">(optional)</span></label>
                <input id="cta-label" type="text" className="input" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="e.g. Read the brief" />
              </div>
              <div>
                <label htmlFor="cta-url" className="label">Button opens</label>
                <input id="cta-url" type="text" className="input" value={ctaPath} onChange={(e) => setCtaPath(e.target.value)} placeholder="/challenges" />
                <p className="mt-1 text-xs text-smoke">An in-app path. Buttons always open the Creator Program, never tryp.com.</p>
              </div>
            </div>

            {wouldExceed && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
                This send ({recipientCount}) would push you past today's limit of {dailyLimit}.
                Wait until tomorrow, or upgrade the sending provider.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => send({ test: false })} disabled={sending || wouldExceed || recipientCount === 0} className="btn-primary">
                {sending ? <Spinner /> : `Send to ${recipientCount} creators`}
              </button>
              <button onClick={() => send({ test: true })} disabled={sending} className="btn-secondary">
                Send test to me
              </button>
            </div>

            {result && (
              result.error ? (
                <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{result.error}</p>
              ) : (
                <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
                  <p className="font-semibold">
                    {result.test ? 'Test sent to your inbox.' : `Sent to ${result.sent} of ${result.total} creators.`}
                  </p>
                  {result.failed > 0 && (
                    <p className="mt-1 text-xs text-red-600">
                      {result.failed} failed{result.failures?.length ? `: ${result.failures.map((f) => f.email).join(', ')}` : ''}
                    </p>
                  )}
                  {result.blocked > 0 && (
                    <p className="mt-1 text-xs text-red-600">
                      {result.blocked} of those were blocked as bulk mail, not a broken address.
                      Some providers also accept a message and bounce it back minutes later, so
                      check the sending inbox too.
                    </p>
                  )}
                </div>
              )
            )}

            <p className="text-xs leading-relaxed text-smoke">
              This goes to every active creator. Each one gets their own copy, so nobody sees
              anyone else's address. Always use "Send test to me" first.
            </p>
          </section>
          </div>
        </>
      )}

    </div>
  )
}



// ---------------------------------------------------------------------------
// Automatic emails.
//
// The previous version exposed the raw {{body}} token, which read as gibberish:
// you saw "{{body}}" where you expected the actual message. The model here is
// explicit instead - an automatic email is three stacked parts:
//
//   1. Your intro      (you write it, optional)
//   2. The message     (filled in automatically from the announcement/event -
//                       shown read-only with a real example, never as a token)
//   3. Your sign-off   (you write it, optional)
//
// Under the hood that is still one `body` string with {{body}} in the middle,
// so nothing about sending changed - only how it is presented.
const AUTO_BLURB = {
  announcement: "The announcement's own text",
  challenge: "The challenge title and details",
  event: "The event details, date and link",
  application: "The welcome message",
}

function splitBody(body) {
  const raw = String(body ?? '')
  const i = raw.indexOf('{{body}}')
  if (i === -1) return { intro: raw, outro: '', hasAuto: false }
  return {
    intro: raw.slice(0, i).replace(/\n+$/, ''),
    outro: raw.slice(i + '{{body}}'.length).replace(/^\n+/, ''),
    hasAuto: true,
  }
}
function joinBody(intro, outro, hasAuto) {
  if (!hasAuto) return intro
  return [intro.trim(), '{{body}}', outro.trim()].filter(Boolean).join('\n\n')
}

// Swap the tokens for this template's realistic example values.
function withSample(text, t) {
  return String(text ?? '')
    .replaceAll('{{title}}', t.sample_title || t.label)
    .replaceAll('{{body}}', t.sample_body || '')
    .replaceAll('{{name}}', 'Ethan')
}

function TemplatesPanel({ templates, setTemplates, savingKey, setSavingKey, renderPreview, sendTest }) {
  const [activeKey, setActiveKey] = useState(templates[0]?.key ?? null)
  const [html, setHtml] = useState('')
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const active = templates.find((t) => t.key === activeKey) || templates[0]

  const patch = (key, changes) =>
    setTemplates((list) => list.map((t) => (t.key === key ? { ...t, ...changes } : t)))

  const parts = active ? splitBody(active.body) : { intro: '', outro: '', hasAuto: false }
  const setPart = (which, value) =>
    patch(active.key, {
      body: joinBody(
        which === 'intro' ? value : parts.intro,
        which === 'outro' ? value : parts.outro,
        parts.hasAuto,
      ),
    })

  useEffect(() => {
    if (!active) return
    let alive = true
    setBusy(true)
    const id = setTimeout(async () => {
      const out = await renderPreview({
        subject: withSample(active.subject, active),
        body: withSample(active.body, active),
        ctaLabel: active.cta_label,
        ctaPath: active.cta_path,
      })
      if (!alive) return
      if (out?.html) setHtml(out.html)
      setBusy(false)
    }, 400)
    return () => { alive = false; clearTimeout(id) }
  }, [active, renderPreview])

  async function save() {
    setSavingKey(active.key)
    const { error } = await supabase
      .from('email_templates')
      .update({
        subject: active.subject, body: active.body,
        cta_label: active.cta_label, auto_send: active.auto_send,
        updated_at: new Date().toISOString(),
      })
      .eq('key', active.key)
    setSavingKey(null)
    if (error) return notice("Couldn't save: " + error.message)
    patch(active.key, { justSaved: true })
    setTimeout(() => patch(active.key, { justSaved: false }), 2000)
  }

  async function test() {
    setTesting(true)
    const out = await sendTest({
      subject: withSample(active.subject, active),
      body: withSample(active.body, active),
      ctaLabel: active.cta_label,
      ctaPath: active.cta_path,
    })
    setTesting(false)
    notice(out?.error ? out.error : 'Test sent to your inbox.')
  }

  if (!active) {
    return <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">No templates found.</p>
  }

  return (
    <div className="space-y-5">
      {/* Which email you're editing */}
      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveKey(t.key)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all hover:-translate-y-0.5 ${
              t.key === active.key ? 'bg-brand text-white shadow-card' : 'border border-gray-200 bg-white text-smoke hover:border-brand hover:text-brand'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        {/* ---- Editor ---- */}
        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{active.label}</h2>
              <p className="mt-1 text-sm text-smoke">{active.description}</p>
            </div>
          </div>

          <div className="mt-5 space-y-5 border-t border-gray-100 pt-5">
            <div>
              <label htmlFor="tpl-subject" className="label">Subject line</label>
              <input
                id="tpl-subject" type="text" className="input"
                value={active.subject} onChange={(e) => patch(active.key, { subject: e.target.value })}
              />
              <p className="mt-1.5 text-xs text-smoke">
                Creators will see: <span className="font-medium text-ink">{withSample(active.subject, active)}</span>
              </p>
            </div>

            {/* The three stacked parts of the message */}
            <div>
              <p className="label">Message</p>

              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">1 &middot; Your intro</p>
                <textarea
                  rows={2} className="input !border-0 !bg-cloud/50 !p-3 text-sm"
                  value={parts.intro} onChange={(e) => setPart('intro', e.target.value)}
                  placeholder="Hi {{name}},"
                  aria-label="Intro"
                />

                {parts.hasAuto && (
                  <div className="mt-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      <Icon name="bulb" className="h-3.5 w-3.5 text-brand" />
                      2 &middot; {AUTO_BLURB[active.key] || 'The message'} &mdash; filled in automatically
                    </p>
                    <div className="rounded-lg border border-dashed border-brand/30 bg-brand-tint/25 p-3">
                      <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">
                        {active.sample_body || 'The message from the notification appears here.'}
                      </p>
                      <p className="mt-2 text-[11px] italic text-smoke">
                        Example only. The real text comes from the actual {active.label.toLowerCase()}.
                      </p>
                    </div>
                  </div>
                )}

                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {parts.hasAuto ? '3' : '2'} &middot; Your sign-off <span className="font-normal normal-case tracking-normal">(optional)</span>
                  </p>
                  <textarea
                    rows={2} className="input !border-0 !bg-cloud/50 !p-3 text-sm"
                    value={parts.outro} onChange={(e) => setPart('outro', e.target.value)}
                    placeholder="See you there!"
                    aria-label="Sign-off"
                  />
                </div>
              </div>

              <p className="mt-2 text-xs text-smoke">
                Use <code className="font-semibold text-brand">{'{{name}}'}</code> anywhere to drop in each creator's first name.
              </p>
            </div>

            <div>
              <label htmlFor="tpl-cta" className="label">Button text</label>
              <input
                id="tpl-cta" type="text" className="input"
                value={active.cta_label || ''} onChange={(e) => patch(active.key, { cta_label: e.target.value })}
                placeholder="Open Tryp.com Content Creator Program"
              />
              <p className="mt-1 text-xs text-smoke">
                Always opens the Creator Program at <code className="text-brand">{active.cta_path}</code>.
              </p>
            </div>

            {/* Whether this one needs approval before it goes out */}
            <div className="flex items-center gap-4 rounded-xl bg-cloud/50 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Send without asking me</p>
                <p className="text-xs text-smoke">
                  {active.auto_send
                    ? 'Goes straight out to creators as soon as it happens.'
                    : 'Waits in the Review queue so you can check, edit or decline it first.'}
                </p>
              </div>
              <Toggle
                on={!!active.auto_send}
                onChange={(v) => patch(active.key, { auto_send: v })}
                label={`Send ${active.label} without approval`}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
            {active.justSaved && <span className="mr-auto text-sm font-medium text-green-600">Saved</span>}
            <button onClick={test} disabled={testing} className="btn-secondary !py-2 text-xs">
              {testing ? 'Sending…' : 'Send test to me'}
            </button>
            <button onClick={save} disabled={savingKey === active.key} className="btn-primary !py-2 text-xs">
              {savingKey === active.key ? <Spinner className="h-4 w-4" /> : 'Save'}
            </button>
          </div>
        </section>

        {/* ---- Live preview ---- */}
        <section className="card xl:sticky xl:top-24">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Preview</h2>
              <p className="text-xs text-smoke">A real example, exactly as a creator receives it.</p>
            </div>
            {busy && <Spinner className="h-4 w-4 text-smoke" />}
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-[#f6f6f7]">
            <iframe
              title="Email preview"
              srcDoc={html}
              className="h-[36rem] w-full bg-white"
              sandbox="allow-same-origin"
            />
          </div>
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Review queue: every broadcast email waits here until an admin approves it.
// Push notifications already went out instantly; only the EMAIL is held, so a
// small announcement can be declined without anyone getting a pointless inbox
// interruption. Each item can be edited before it goes.
const TYPE_META = {
  announcement: { label: 'Announcement', icon: 'megaphone' },
  challenge: { label: 'New challenge', icon: 'flag' },
  event: { label: 'Event', icon: 'calendar' },
}

function ReviewQueue({ queue, setQueue, renderPreview, callFn, reload }) {
  const [openId, setOpenId] = useState(queue[0]?.id ?? null)
  const [html, setHtml] = useState('')
  const [busy, setBusy] = useState(false)
  const [acting, setActing] = useState(null) // 'send' | 'decline' | 'test'
  const item = queue.find((q) => q.id === openId) || queue[0]

  const patch = (id, changes) => setQueue((list) => list.map((q) => (q.id === id ? { ...q, ...changes } : q)))

  useEffect(() => {
    if (!item) { setHtml(''); return }
    let alive = true
    setBusy(true)
    const t = setTimeout(async () => {
      const out = await renderPreview({
        subject: item.subject, body: item.body,
        ctaLabel: item.cta_label, ctaPath: item.cta_path,
      })
      if (!alive) return
      if (out?.html) setHtml(out.html)
      setBusy(false)
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [item, renderPreview])

  async function approve() {
    setActing('send')
    const out = await callFn({
      outboxId: item.id, type: item.type,
      subject: item.subject, body: item.body,
      ctaLabel: item.cta_label, ctaPath: item.cta_path,
    })
    setActing(null)
    if (out.error) return notice(out.error)
    notice(`Sent to ${out.sent} creator${out.sent === 1 ? '' : 's'}.`)
    setQueue((list) => list.filter((q) => q.id !== item.id))
    reload()
  }

  async function decline() {
    if (!await confirm(`Decline this email?\n\n"${item.subject}"\n\nCreators already got the in-app notification and push. Only the email is cancelled.`)) return
    setActing('decline')
    await supabase.from('email_outbox')
      .update({ status: 'declined', decided_at: new Date().toISOString() })
      .eq('id', item.id)
    setActing(null)
    setQueue((list) => list.filter((q) => q.id !== item.id))
  }

  async function test() {
    setActing('test')
    const out = await callFn({
      test: true, subject: item.subject, body: item.body,
      ctaLabel: item.cta_label, ctaPath: item.cta_path,
    })
    setActing(null)
    notice(out.error || 'Test sent to your inbox.')
  }

  async function saveEdits() {
    await supabase.from('email_outbox')
      .update({ subject: item.subject, body: item.body, cta_label: item.cta_label })
      .eq('id', item.id)
    notice('Changes saved to this queued email.')
  }

  if (queue.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-gray-200 bg-white px-8 py-16 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand">
          <Icon name="check" className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-semibold">Nothing waiting for review</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-smoke">
          When an announcement, challenge or event goes out, its email lands here first so you can
          check it before it reaches everyone. Push notifications are never held up.
        </p>
      </div>
    )
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[22rem_1fr]">
      {/* ---- Queue list ---- */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {queue.length} waiting for approval
        </p>
        {queue.map((q) => {
          const meta = TYPE_META[q.type] || { label: q.type, icon: 'envelope' }
          return (
            <button
              key={q.id}
              onClick={() => setOpenId(q.id)}
              className={`card w-full !p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lift ${
                q.id === item.id ? 'ring-2 ring-brand' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon name={meta.icon} className="h-4 w-4 shrink-0 text-brand" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-smoke">{meta.label}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm font-semibold">{q.subject}</p>
              <p className="mt-1 text-xs text-smoke">{formatDateTime(q.created_at)}</p>
            </button>
          )
        })}
      </div>

      {/* ---- Editor + preview for the selected item ---- */}
      <div className="grid items-start gap-6 2xl:grid-cols-2">
        <section className="card">
          <h2 className="text-lg font-semibold">Check before it sends</h2>
          <p className="mt-1 text-sm text-smoke">
            Edit anything here, then approve. Creators already received the in-app and push
            notification; this is only the email.
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
                id="q-body" rows={8} className="input"
                value={item.body} onChange={(e) => patch(item.id, { body: e.target.value })}
              />
              <p className="mt-1 text-xs text-smoke">
                <code className="font-semibold text-brand">{'{{name}}'}</code> becomes each creator's first name.
              </p>
            </div>
            <div>
              <label htmlFor="q-cta" className="label">Button text</label>
              <input
                id="q-cta" type="text" className="input"
                value={item.cta_label || ''} onChange={(e) => patch(item.id, { cta_label: e.target.value })}
              />
              <p className="mt-1 text-xs text-smoke">Opens the Creator Program at <code className="text-brand">{item.cta_path}</code>.</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
            <button onClick={approve} disabled={!!acting} className="btn-primary !py-2 text-xs">
              {acting === 'send' ? <Spinner className="h-4 w-4" /> : 'Approve and send to everyone'}
            </button>
            <button onClick={test} disabled={!!acting} className="btn-secondary !py-2 text-xs">
              {acting === 'test' ? 'Sending…' : 'Send test to me'}
            </button>
            <button onClick={saveEdits} disabled={!!acting} className="btn-ghost !py-2 text-xs">Save changes</button>
            <button onClick={decline} disabled={!!acting} className="btn-danger !py-2 text-xs ml-auto">
              {acting === 'decline' ? 'Declining…' : 'Decline'}
            </button>
          </div>
        </section>

        <section className="card">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Preview</h2>
              <p className="text-xs text-smoke">Exactly what a creator receives.</p>
            </div>
            {busy && <Spinner className="h-4 w-4 text-smoke" />}
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-[#f6f6f7]">
            <iframe title="Queued email preview" srcDoc={html} className="h-[34rem] w-full bg-white" sandbox="allow-same-origin" />
          </div>
        </section>
      </div>
    </div>
  )
}
