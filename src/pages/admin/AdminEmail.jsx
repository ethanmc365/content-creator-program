import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, Skeleton, StatCard, Spinner } from '../../components/ui'
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
  const [recipientCount, setRecipientCount] = useState(0)
  const [usage, setUsage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  const load = useCallback(async () => {
    const [{ data: profiles }, { data: usageRows }] = await Promise.all([
      supabase.from('profiles').select('id, status, is_admin, is_test, deletion_requested_at, email_prefs'),
      supabase.rpc('email_usage'),
    ])
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

      {loading ? (
        <Skeleton className="h-96 w-full" />
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
    </div>
  )
}
