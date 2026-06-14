import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, EmptyState, PageHeader, Skeleton, StatCard } from '../../components/ui'
import { formatDate, downloadCsv } from '../../lib/utils'

// Admin view of referrals: manual leads (the referrals table) plus creators
// who actually joined through someone's invite link.
const STATUSES = ['new', 'contacted', 'joined', 'declined']
const STATUS_TONE = { new: 'amber', contacted: 'light', joined: 'green', declined: 'grey' }

export default function AdminReferrals() {
  const [referrals, setReferrals] = useState([])
  const [referrerNames, setReferrerNames] = useState({})
  const [joined, setJoined] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const [{ data: refs }, { data: joinedProfiles }] = await Promise.all([
      supabase.from('referrals').select('*').order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, name, created_at, referred_by, referrer:referred_by(name)')
        .not('referred_by', 'is', null),
    ])
    setReferrals(refs ?? [])
    setJoined(joinedProfiles ?? [])

    // Look up referrer names for the manual leads.
    const ids = [...new Set((refs ?? []).map((r) => r.referrer_id).filter(Boolean))]
    if (ids.length) {
      const { data: people } = await supabase.from('profiles').select('id, name').in('id', ids)
      setReferrerNames(Object.fromEntries((people ?? []).map((p) => [p.id, p.name])))
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function setStatus(referral, status) {
    await supabase.from('referrals').update({ status }).eq('id', referral.id)
    load()
  }

  function exportCsv() {
    downloadCsv('tryp-referrals.csv', [
      ...joined.map((p) => ({ referred_name: p.name, referred_by: p.referrer?.name ?? '', contact: '', status: 'joined (link)', date: formatDate(p.created_at) })),
      ...referrals.map((r) => ({ referred_name: r.referred_name, referred_by: referrerNames[r.referrer_id] ?? '', contact: r.referred_contact, status: r.status, date: formatDate(r.created_at) })),
    ])
  }

  return (
    <div className="page">
      <PageHeader
        title="Referrals"
        subtitle="Leads your creators have sent in, plus everyone who joined through an invite link."
        action={<button onClick={exportCsv} className="btn-secondary">Export CSV ↓</button>}
      />

      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Joined via link" value={joined.length} accent />
        <StatCard label="Open leads" value={referrals.filter((r) => r.status === 'new' || r.status === 'contacted').length} />
        <StatCard label="Total referrals" value={joined.length + referrals.length} />
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : joined.length === 0 && referrals.length === 0 ? (
        <EmptyState emoji="🤝" title="No referrals yet" hint="When creators share their invite links or refer people, they'll show up here." />
      ) : (
        <div className="space-y-10">
          {joined.length > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-semibold">Joined via invite link</h2>
              <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
                {joined.map((p) => (
                  <div key={p.id} className="flex items-center gap-4 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
                    <Avatar src={null} name={p.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-smoke">Referred by {p.referrer?.name ?? 'a creator'} · {formatDate(p.created_at)}</p>
                    </div>
                    <Badge tone="green">joined</Badge>
                  </div>
                ))}
              </div>
            </section>
          )}

          {referrals.length > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-semibold">Leads to follow up</h2>
              <div className="space-y-3">
                {referrals.map((r) => (
                  <div key={r.id} className="card flex flex-wrap items-center gap-4 !p-5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{r.referred_name}</p>
                      <p className="text-xs text-smoke">
                        {r.referred_contact || 'No contact'} · referred by {referrerNames[r.referrer_id] ?? 'a creator'} · {formatDate(r.created_at)}
                      </p>
                      {r.note && <p className="mt-1 text-xs italic text-smoke">"{r.note}"</p>}
                    </div>
                    <select
                      value={r.status}
                      onChange={(e) => setStatus(r, e.target.value)}
                      className="input !w-auto !py-2 text-xs"
                      aria-label={`Status for ${r.referred_name}`}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
