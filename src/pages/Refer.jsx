import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Badge, EmptyState, PageHeader, Skeleton, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { formatDate } from '../lib/utils'
import { referralStage } from '../lib/referrals'

// Creators refer other creators two ways:
//  1. Share their personal invite link (/signup?ref=CODE) - auto-credited.
//  2. Submit a name/contact for the team to reach out to.
// A referral only counts once the person they referred submits a video to a
// challenge (see lib/referrals.js) - that is what the reward is tied to.
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
  const [linkClicks, setLinkClicks] = useState(0)

  async function load() {
    const [{ data: refs }, { data: joinedProfiles }, { data: me }] = await Promise.all([
      supabase.from('referrals').select('*').eq('referrer_id', user.id).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name, photo_url, created_at, status, onboarded').eq('referred_by', user.id),
      supabase.from('profiles').select('referral_clicks').eq('id', user.id).single(),
    ])
    setReferrals(refs ?? [])
    setLinkClicks(me?.referral_clicks ?? 0)

    // Which referred creators have actually submitted a challenge video? That is
    // what counts towards the £20 voucher reward. Tag each person with their
    // stage so the history list can show exactly where they've got to.
    const list = joinedProfiles ?? []
    const joinedIds = list.map((p) => p.id)
    let submitted = new Set()
    if (joinedIds.length) {
      const { data: subs } = await supabase.from('submissions').select('creator_id').in('creator_id', joinedIds)
      submitted = new Set((subs ?? []).map((s) => s.creator_id))
    }
    const withStage = list
      .map((p) => ({ ...p, stage: referralStage(p, submitted.has(p.id)) }))
      .sort((a, b) => b.stage.step - a.stage.step || new Date(b.created_at) - new Date(a.created_at))
    setJoined(withStage)
    setParticipatedCount(withStage.filter((p) => p.stage.key === 'counted').length)
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
        <p className="text-xl font-bold sm:text-2xl">Refer 3 creators, earn a £20 Tryp.com voucher</p>
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
            <p className="mt-2 text-sm font-semibold">You've hit 3! The team will verify and send your voucher.</p>
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

        {/* Your invite funnel: how the link is converting, stage by stage. */}
        {!loading && (linkClicks > 0 || joined.length > 0) && (
          <div className="mt-6 border-t border-gray-50 pt-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-smoke">Your invite funnel</p>
            <div className="space-y-2.5">
              {[
                { label: 'Link clicks', value: linkClicks },
                { label: 'Signed up', value: joined.length },
                { label: 'Approved', value: joined.filter((p) => p.status === 'active').length },
                { label: 'Participated in a challenge', value: participatedCount },
              ].map((stage, i, stages) => {
                const max = Math.max(stages[0].value, 1)
                return (
                  <div key={stage.label} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-xs text-smoke sm:w-48">{stage.label}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded-full bg-cloud">
                      <div
                        className={`flex h-full items-center justify-end rounded-full pr-2 text-[10px] font-bold text-white transition-all duration-700 ${i === 0 ? 'bg-brand-light' : 'bg-brand'}`}
                        style={{ width: `${Math.max((stage.value / max) * 100, stage.value > 0 ? 8 : 0)}%` }}
                      >
                        {stage.value > 0 && stage.value}
                      </div>
                    </div>
                    {stage.value === 0 && <span className="text-xs tabular-nums text-smoke">0</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* Refer by name */}
      <section className="card mb-10">
        <h2 className="text-lg font-semibold">Or refer someone directly</h2>
        <p className="mt-1 text-sm text-smoke">Give us their details and the team will reach out.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <h2 className="mb-1 text-lg font-semibold">Your referrals</h2>
        <p className="mb-4 text-xs text-smoke">Follow each person's progress. A referral counts once they submit a video to a challenge.</p>
        {loading ? (
          <div className="space-y-3"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
        ) : referrals.length === 0 && joined.length === 0 ? (
          <EmptyState icon={<Icon name="share" className="h-7 w-7" />} title="No referrals yet" hint="Share your link or refer someone above to get started." />
        ) : (
          <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
            {joined.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="truncate text-xs text-smoke">{p.stage.hint} · {formatDate(p.created_at)}</p>
                </div>
                <Badge tone={p.stage.tone} title={p.stage.hint}>{p.stage.label}</Badge>
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
