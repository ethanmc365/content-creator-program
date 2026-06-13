import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Skeleton, StatCard } from '../../components/ui'
import { formatDateTime } from '../../lib/utils'

// Email all creators — free, no paid email service required.
//
// How it works: you compose one message, then "Open in email app" launches
// your own mail client (Gmail, Outlook, Apple Mail…) with every creator's
// address in BCC and your subject + body pre-filled. You hit send from there.
// We log each campaign for your records.
//
// Want true one-click automated sending later? See README → "Bulk email"
// for an optional free Resend Edge Function upgrade.
export default function AdminEmail() {
  const { user } = useAuth()
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState([])

  useEffect(() => {
    async function load() {
      // Active creators only (don't email suspended accounts).
      const [{ data: emailRows }, { data: profiles }, { data: campaigns }] = await Promise.all([
        supabase.rpc('admin_list_emails'),
        supabase.from('profiles').select('id, status'),
        supabase.from('email_campaigns').select('*').order('created_at', { ascending: false }).limit(10),
      ])
      const activeIds = new Set((profiles ?? []).filter((p) => p.status !== 'suspended').map((p) => p.id))
      setEmails((emailRows ?? []).filter((r) => activeIds.has(r.id)).map((r) => r.email))
      setHistory(campaigns ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const bccList = emails.join(',')
  const mailto = `mailto:?bcc=${encodeURIComponent(bccList)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`
  const tooLongForMailto = mailto.length > 1900 // some mail clients truncate long URLs

  async function logCampaign() {
    if (!subject.trim()) return
    await supabase.from('email_campaigns').insert({
      subject: subject.trim(), body: bodyText.trim(), recipient_count: emails.length, sent_by: user.id,
    })
    // Refresh history.
    const { data } = await supabase.from('email_campaigns').select('*').order('created_at', { ascending: false }).limit(10)
    setHistory(data ?? [])
  }

  function openInMailApp() {
    logCampaign()
    window.location.href = mailto
  }

  function copyEmails() {
    navigator.clipboard?.writeText(bccList)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="page max-w-3xl">
      <PageHeader title="Email creators" subtitle="Compose once, send to everyone. Opens in your own email app with all creators in BCC." />

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2">
            <StatCard label="Recipients" value={emails.length} hint="Active creators" accent />
            <StatCard label="Sent so far" value={history.length >= 10 ? '10+' : history.length} hint="Logged campaigns" />
          </div>

          <section className="card space-y-5">
            <div>
              <label htmlFor="subject" className="label">Subject</label>
              <input id="subject" type="text" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. New challenge drops Monday 🚀" />
            </div>
            <div>
              <label htmlFor="email-body" className="label">Message</label>
              <textarea id="email-body" rows={10} className="input" value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder="Write your email to the whole community…" />
            </div>

            {tooLongForMailto && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
                You have a lot of recipients. Some mail apps limit link length, so if the BCC list looks cut off,
                use "Copy all emails" below and paste them into your email's BCC field instead.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button onClick={openInMailApp} disabled={!subject.trim() || emails.length === 0} className="btn-primary">
                Open in email app →
              </button>
              <button onClick={copyEmails} className="btn-secondary">{copied ? 'Copied ✓' : 'Copy all emails'}</button>
              <button onClick={logCampaign} disabled={!subject.trim()} className="btn-ghost text-xs">Just log it (sent elsewhere)</button>
            </div>
            <p className="text-xs leading-relaxed text-smoke">
              Tip: clicking "Open in email app" records this campaign and launches your mail client with the
              subject, body and BCC list pre-filled. Review it there, then hit send.
            </p>
          </section>

          {history.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-4 text-lg font-semibold">Recent campaigns</h2>
              <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
                {history.map((c) => (
                  <div key={c.id} className="border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
                    <p className="text-sm font-semibold">{c.subject}</p>
                    <p className="text-xs text-smoke">{formatDateTime(c.created_at)} · {c.recipient_count} recipients</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
