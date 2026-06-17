import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Skeleton, StatCard } from '../../components/ui'
import { formatDateTime } from '../../lib/utils'

// Email all creators - free, no paid email service required.
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
  const pressTimer = useRef(null)

  // Admins long-press a logged campaign to delete it (tidy-up).
  async function deleteCampaign(c) {
    if (!confirm(`Delete the logged campaign "${c.subject}"?`)) return
    setHistory((prev) => prev.filter((x) => x.id !== c.id))
    await supabase.from('email_campaigns').delete().eq('id', c.id)
  }
  const startPress = (c) => { pressTimer.current = setTimeout(() => deleteCampaign(c), 550) }
  const cancelPress = () => clearTimeout(pressTimer.current)

  useEffect(() => {
    async function load() {
      // Active creators only - never the Tryp.com team (admins) or yourself.
      const [{ data: emailRows }, { data: profiles }, { data: campaigns }] = await Promise.all([
        supabase.rpc('admin_list_emails'),
        supabase.from('profiles').select('id, status, is_admin'),
        supabase.from('email_campaigns').select('*').order('created_at', { ascending: false }).limit(10),
      ])
      const creatorIds = new Set(
        (profiles ?? [])
          .filter((p) => p.status === 'active' && !p.is_admin && p.id !== user.id)
          .map((p) => p.id)
      )
      setEmails((emailRows ?? []).filter((r) => creatorIds.has(r.id)).map((r) => r.email))
      setHistory(campaigns ?? [])
      setLoading(false)
    }
    load()
  }, [user.id])

  const bccList = emails.join(',')
  const mailto = `mailto:?bcc=${encodeURIComponent(bccList)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`
  // Gmail web compose - opens in a new tab, works without a desktop mail client.
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&bcc=${encodeURIComponent(bccList)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`
  const tooLong = gmailUrl.length > 1900 // very large lists can exceed URL limits

  async function logCampaign() {
    if (!subject.trim()) return
    await supabase.from('email_campaigns').insert({
      subject: subject.trim(), body: bodyText.trim(), recipient_count: emails.length, sent_by: user.id,
    })
    const { data } = await supabase.from('email_campaigns').select('*').order('created_at', { ascending: false }).limit(10)
    setHistory(data ?? [])
  }

  // Primary: open Gmail compose in a new tab (reliable in any browser).
  function openInGmail() {
    logCampaign()
    window.open(gmailUrl, '_blank', 'noopener')
  }

  // Secondary: hand off to the OS default mail app via mailto.
  function openInMailApp() {
    logCampaign()
    window.location.href = mailto
  }

  // Copy with a textarea fallback for browsers that block the async clipboard.
  async function copyEmails() {
    try {
      await navigator.clipboard.writeText(bccList)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = bccList
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
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
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard label="Recipients" value={emails.length} hint="Active creators" accent />
            <StatCard label="Sent so far" value={history.length >= 10 ? '10+' : history.length} hint="Logged campaigns" />
          </div>

          <section className="card space-y-5">
            <div>
              <label htmlFor="subject" className="label">Subject</label>
              <input id="subject" type="text" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. New challenge drops Monday" />
            </div>
            <div>
              <label htmlFor="email-body" className="label">Message</label>
              <textarea id="email-body" rows={10} className="input" value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder="Write your email to the whole community…" />
            </div>

            {tooLong && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
                You have a lot of recipients. If the BCC list looks cut off, use "Copy all emails"
                and paste them into your email's BCC field instead.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button onClick={openInGmail} disabled={!subject.trim() || emails.length === 0} className="btn-primary">
                Compose in Gmail →
              </button>
              <button onClick={openInMailApp} disabled={!subject.trim() || emails.length === 0} className="btn-secondary">
                Use my mail app
              </button>
              <button onClick={copyEmails} className="btn-secondary">{copied ? 'Copied ✓' : 'Copy all emails'}</button>
            </div>
            <p className="text-xs leading-relaxed text-smoke">
              "Compose in Gmail" opens a new tab with the subject, body and every creator in BCC,
              ready for you to review and send. Prefer Outlook or Apple Mail? Use "Use my mail app".
              Either way, the campaign is logged below.
            </p>
          </section>

          {history.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-1 text-lg font-semibold">Recent campaigns</h2>
              <p className="mb-4 text-xs text-smoke">Long-press a campaign to delete it.</p>
              <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
                {history.map((c) => (
                  <div
                    key={c.id}
                    onTouchStart={() => startPress(c)} onTouchEnd={cancelPress} onTouchMove={cancelPress}
                    onMouseDown={() => startPress(c)} onMouseUp={cancelPress} onMouseLeave={cancelPress}
                    onContextMenu={(e) => { e.preventDefault(); deleteCampaign(c) }}
                    className="select-none border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7"
                  >
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
