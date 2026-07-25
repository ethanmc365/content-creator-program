import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Badge, Modal, PageHeader, Skeleton, StatCard, Spinner, Toggle } from '../../components/ui'
import Icon from '../../components/Icon'
import { notice } from '../../lib/confirm'

// Email all creators, sent straight from the platform.
//
// The old flow opened Gmail's web composer with everyone in BCC. This now posts
// to the `broadcast-email` edge function, which verifies you're an admin and
// sends ONE branded message per recipient over SMTP (never a shared BCC, which
// is what keeps deliverability healthy and lets us log per-recipient results).
// "Send test to me" delivers a single copy to your own address first.
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/broadcast-email`

export default function AdminEmail() {
  const [tab, setTab] = useState('compose') // compose | templates
  const [recipientCount, setRecipientCount] = useState(0)
  const [usage, setUsage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  const [templates, setTemplates] = useState([])
  const [savingKey, setSavingKey] = useState(null)

  const load = useCallback(async () => {
    const [{ data: profiles }, { data: usageRows }, { data: tpls }] = await Promise.all([
      supabase.from('profiles').select('id, status, is_admin, is_test, deletion_requested_at, email_prefs'),
      supabase.rpc('email_usage'),
      supabase.from('email_templates').select('*').order('label'),
    ])
    setTemplates(tpls ?? [])
    // Community creators only: active, never admins, never the test accounts,
    // and never anyone who opted out of announcement email.
    const count = (profiles ?? []).filter((p) =>
      p.status === 'active' && !p.is_admin && !p.is_test && !p.deletion_requested_at &&
      p.email_prefs?.announcement !== false
    ).length
    setRecipientCount(count)
    setUsage(Array.isArray(usageRows) ? usageRows[0] : usageRows)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function send({ test }) {
    if (!subject.trim() || !bodyText.trim()) return notice('Add a subject and a message first.')
    setSending(true)
    setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          subject: subject.trim(),
          body: bodyText.trim(),
          ctaLabel: ctaLabel.trim() || undefined,
          ctaUrl: ctaUrl.trim() || undefined,
          test,
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResult({ error: out.error || 'Could not send. Please try again.' })
      } else {
        setResult(out)
        if (!test) { setSubject(''); setBodyText(''); setCtaLabel(''); setCtaUrl('') }
        load()
      }
    } catch {
      setResult({ error: 'Network error. Please try again.' })
    }
    setSending(false)
  }

  // Ask the edge function to render the exact HTML it would send, so the
  // preview can never drift from the real thing.
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewing, setPreviewing] = useState(false)
  async function preview({ subject: s, body: b, ctaLabel: cl }) {
    if (!s?.trim() || !b?.trim()) return notice('Add a subject and a message first.')
    setPreviewing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'preview', subject: s, body: b, ctaLabel: cl || undefined, ctaUrl: cl ? window.location.origin : undefined }),
      })
      const out = await res.json().catch(() => ({}))
      if (out.html) setPreviewHtml(out.html)
      else notice(out.error || 'Could not build the preview.')
    } catch {
      notice('Network error building the preview.')
    }
    setPreviewing(false)
  }

  const sentToday = Number(usage?.sent_today ?? 0)
  const dailyLimit = Number(usage?.daily_limit ?? 500)
  const pctUsed = Math.min(100, Math.round((sentToday / dailyLimit) * 100))
  const wouldExceed = sentToday + recipientCount > dailyLimit

  return (
    <div className="page max-w-3xl">
      <PageHeader
        title="Email creators"
        subtitle="Compose once and send it to every creator, straight from the platform. Each person gets their own branded copy."
      />

      <div className="mb-8 flex gap-2">
        {[['compose', 'Compose'], ['templates', 'Automatic emails']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={tab === key ? 'btn-primary !py-2 text-sm' : 'btn-secondary !py-2 text-sm'}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : tab === 'templates' ? (
        <TemplatesPanel
          templates={templates}
          setTemplates={setTemplates}
          savingKey={savingKey}
          setSavingKey={setSavingKey}
          onPreview={preview}
          previewing={previewing}
        />
      ) : (
        <>
          {/* ---------- Sending usage (replaces the old campaign log) ---------- */}
          <section className="card mb-8">
            <div className="mb-4 flex items-center gap-2">
              <Icon name="chart" className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-semibold">Sending usage</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Recipients" value={recipientCount} hint="Opted-in creators" accent />
              <StatCard label="Sent today" value={sentToday} hint={`of ${dailyLimit} daily limit`} />
              <StatCard label="This month" value={Number(usage?.sent_month ?? 0)} />
              <StatCard label="All time" value={Number(usage?.sent_total ?? 0)} />
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
                <label htmlFor="cta-url" className="label">Button link</label>
                <input id="cta-url" type="url" className="input" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://…" />
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
                </div>
              )
            )}

            <p className="text-xs leading-relaxed text-smoke">
              Every creator gets their own copy, so nobody sees anyone else's address.
              Creators who turned off announcement emails in their settings are skipped automatically.
              Always use "Send test to me" first.
            </p>
          </section>
        </>
      )}

      {/* Live preview of the real rendered email, in an isolated iframe so the
          email's own styles can never leak into the admin page. */}
      <Modal open={!!previewHtml} onClose={() => setPreviewHtml('')} title="Email preview" wide>
        <iframe
          title="Email preview"
          srcDoc={previewHtml}
          className="h-[60vh] w-full rounded-xl border border-gray-100 bg-white"
          sandbox=""
        />
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Automatic emails: the copy for each email the platform sends on its own.
// Until a template is switched on, the email uses the notification's own
// wording, so nothing changes until an admin deliberately customises it.
const PLACEHOLDERS = [
  ['{{title}}', "the notification's headline"],
  ['{{body}}', "the notification's message"],
  ['{{name}}', "the recipient's first name"],
]

function TemplatesPanel({ templates, setTemplates, savingKey, setSavingKey, onPreview, previewing }) {
  const patch = (key, changes) =>
    setTemplates((list) => list.map((t) => (t.key === key ? { ...t, ...changes } : t)))

  async function save(t) {
    setSavingKey(t.key)
    const { error } = await supabase
      .from('email_templates')
      .update({
        subject: t.subject, body: t.body, cta_label: t.cta_label,
        enabled: t.enabled, updated_at: new Date().toISOString(),
      })
      .eq('key', t.key)
    setSavingKey(null)
    if (error) return notice("Couldn't save: " + error.message)
    // `justSaved` is UI-only; save() picks explicit columns so it never hits the DB.
    patch(t.key, { justSaved: true })
    setTimeout(() => patch(t.key, { justSaved: false }), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-gray-100 bg-cloud/40 p-5">
        <p className="text-sm font-semibold text-ink">How these work</p>
        <p className="mt-1 text-xs leading-relaxed text-smoke">
          These are the emails the platform sends by itself. Each one is off by default and uses the
          wording from the notification it came from. Switch one on to write your own copy. Use the
          placeholders below and they get swapped for the real values when the email is sent.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PLACEHOLDERS.map(([token, what]) => (
            <span key={token} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] text-smoke">
              <code className="font-semibold text-brand">{token}</code> {what}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-smoke">
          Password resets and other sign-in emails are sent by Supabase Auth, not from here.
          Edit those under Authentication &rarr; Emails in the Supabase dashboard.
        </p>
      </div>

      {templates.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">
          No templates found.
        </p>
      ) : templates.map((t) => (
        <section key={t.key} className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{t.label}</h2>
                <Badge tone={t.enabled ? 'green' : 'grey'}>{t.enabled ? 'Custom copy' : 'Default wording'}</Badge>
              </div>
              <p className="mt-1 text-sm text-smoke">{t.description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-smoke">Use custom copy</span>
              <Toggle on={!!t.enabled} onChange={(v) => patch(t.key, { enabled: v })} label={`Use custom copy for ${t.label}`} />
            </div>
          </div>

          {t.enabled && (
            <div className="mt-5 space-y-4 border-t border-gray-100 pt-5">
              <div>
                <label htmlFor={`s-${t.key}`} className="label">Subject</label>
                <input
                  id={`s-${t.key}`} type="text" className="input"
                  value={t.subject} onChange={(e) => patch(t.key, { subject: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor={`b-${t.key}`} className="label">Message</label>
                <textarea
                  id={`b-${t.key}`} rows={6} className="input"
                  value={t.body} onChange={(e) => patch(t.key, { body: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor={`c-${t.key}`} className="label">Button text</label>
                <input
                  id={`c-${t.key}`} type="text" className="input"
                  value={t.cta_label || ''} onChange={(e) => patch(t.key, { cta_label: e.target.value })}
                  placeholder="e.g. Open in the app"
                />
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
            {t.justSaved && <span className="mr-auto text-sm font-medium text-green-600">Saved</span>}
            <button
              onClick={() => onPreview({ subject: t.subject, body: t.body, ctaLabel: t.cta_label })}
              disabled={previewing}
              className="btn-secondary !py-2 text-xs"
            >
              {previewing ? 'Building…' : 'Preview'}
            </button>
            <button onClick={() => save(t)} disabled={savingKey === t.key} className="btn-primary !py-2 text-xs">
              {savingKey === t.key ? <Spinner className="h-4 w-4" /> : 'Save'}
            </button>
          </div>
        </section>
      ))}
    </div>
  )
}
