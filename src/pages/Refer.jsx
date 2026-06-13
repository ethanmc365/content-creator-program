import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Badge, EmptyState, PageHeader, Skeleton, Spinner } from '../components/ui'
import { formatDate } from '../lib/utils'

// Creators refer other creators two ways:
//  1. Share their personal invite link (/signup?ref=CODE) — auto-credited.
//  2. Submit a name/contact for the team to reach out to.
const STATUS_TONE = { new: 'amber', contacted: 'light', joined: 'green', declined: 'grey' }

export default function Refer() {
  const { user, profile } = useAuth()
  const [referrals, setReferrals] = useState([])
  const [joined, setJoined] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState({ referred_name: '', referred_contact: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const inviteLink = `${window.location.origin}/signup?ref=${profile?.referral_code ?? ''}`

  const [participatedCount, setParticipatedCount] = useState(0)

  async function load() {
    const [{ data: refs }, { data: joinedProfiles }] = await Promise.all([
      supabase.from('referrals').select('*').eq('referrer_id', user.id).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name, created_at').eq('referred_by', user.id),
    ])
    setReferrals(refs ?? [])
    setJoined(joinedProfiles ?? [])

    // How many referred creators have actually participated (made a submission)?
    // This is what counts towards the £20 voucher reward.
    const joinedIds = (joinedProfiles ?? []).map((p) => p.id)
    if (joinedIds.length) {
      const { data: subs } = await supabase.from('submissions').select('creator_id').in('creator_id', joinedIds)
      setParticipatedCount(new Set((subs ?? []).map((s) => s.creator_id)).size)
    } else {
      setParticipatedCount(0)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function copyLink() {
    navigator.clipboard?.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.referred_name.trim()) return
    setBusy(true)
    await supabase.from('referrals').insert({
      referrer_id: user.id,
      referred_name: form.referred_name.trim(),
      referred_contact: form.referred_contact.trim(),
      note: form.note.trim(),
    })
    setBusy(false)
    setSent(true)
    setForm({ referred_name: '', referred_contact: '', note: '' })
    load()
    setTimeout(() => setSent(false), 2500)
  }

  return (
    <div className="page max-w-3xl">
      <PageHeader
        title="Refer a creator"
        subtitle="Know someone who'd be perfect for the program? Bring them in. A bigger community means better collabs for everyone."
      />

      {/* Reward incentive + progress */}
      <section className="mb-8 overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-7 text-white shadow-lift sm:p-8">
        <p className="text-xl font-bold sm:text-2xl">Refer 3 creators, earn a £20 Tryp.com voucher 🎁</p>
        <p className="mt-2 max-w-2xl text-sm text-white/85">
          When 3 creators you refer join and take part in a challenge, you earn a £20 Tryp.com voucher.
          All referrals are verified by the Tryp.com team to make sure they're genuine, active creators.
        </p>
        <div className="mt-5 max-w-sm">
          <div className="mb-1.5 flex justify-between text-xs font-medium text-white/90">
            <span>Your progress</span>
            <span>{Math.min(participatedCount, 3)} / 3 participating</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${Math.min((participatedCount / 3) * 100, 100)}%` }} />
          </div>
          {participatedCount >= 3 && (
            <p className="mt-2 text-sm font-semibold">🎉 You've hit 3! The team will verify and send your voucher.</p>
          )}
        </div>
      </section>

      {/* Invite link */}
      <section className="card mb-8">
        <h2 className="text-lg font-semibold">Your invite link</h2>
        <p className="mt-1 text-sm text-smoke">Anyone who signs up with this link is credited to you automatically.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input readOnly value={inviteLink} className="input flex-1 text-sm" onFocus={(e) => e.target.select()} />
          <button onClick={copyLink} className="btn-primary shrink-0">{copied ? 'Copied ✓' : 'Copy link'}</button>
        </div>
      </section>

      {/* Refer by name */}
      <section className="card mb-10">
        <h2 className="text-lg font-semibold">Or refer someone directly</h2>
        <p className="mt-1 text-sm text-smoke">Give us their details and the team will reach out.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="r-name" className="label">Their name</label>
              <input id="r-name" type="text" required className="input" value={form.referred_name} onChange={(e) => setForm({ ...form, referred_name: e.target.value })} placeholder="e.g. Leo Fairbanks" />
            </div>
            <div>
              <label htmlFor="r-contact" className="label">Contact <span className="font-normal text-smoke">(handle or email)</span></label>
              <input id="r-contact" type="text" className="input" value={form.referred_contact} onChange={(e) => setForm({ ...form, referred_contact: e.target.value })} placeholder="@handle or email" />
            </div>
          </div>
          <div>
            <label htmlFor="r-note" className="label">Why them? <span className="font-normal text-smoke">(optional)</span></label>
            <textarea id="r-note" rows={2} className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="A line on their content and following…" />
          </div>
          <div className="flex items-center justify-end gap-3">
            {sent && <span className="text-sm font-medium text-green-600">Thanks! Referral sent ✓</span>}
            <button type="submit" disabled={busy} className="btn-primary">{busy ? <Spinner /> : 'Submit referral'}</button>
          </div>
        </form>
      </section>

      {/* History */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Your referrals</h2>
        {loading ? (
          <div className="space-y-3"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
        ) : referrals.length === 0 && joined.length === 0 ? (
          <EmptyState emoji="🤝" title="No referrals yet" hint="Share your link or refer someone above to get started." />
        ) : (
          <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
            {joined.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
                <div>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-smoke">Joined via your link · {formatDate(p.created_at)}</p>
                </div>
                <Badge tone="green">joined</Badge>
              </div>
            ))}
            {referrals.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{r.referred_name}</p>
                  <p className="truncate text-xs text-smoke">{r.referred_contact || 'No contact'} · {formatDate(r.created_at)}</p>
                </div>
                <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
