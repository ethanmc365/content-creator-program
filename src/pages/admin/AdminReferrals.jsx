import { useEffect, useRef, useState } from 'react'
import { confirm } from '../../lib/confirm'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, EmptyState, PageHeader, Skeleton, StatCard } from '../../components/ui'
import Icon from '../../components/Icon'
import { formatDate, downloadCsv } from '../../lib/utils'
import { REFERRAL_STAGES, referralStage } from '../../lib/referrals'

// Admin view of referrals. Two sources:
//  1. Creators who joined through someone's invite link (profiles.referred_by) -
//     grouped by the creator who referred them, each shown with the exact stage
//     the referred person has reached (finishing signup / awaiting review /
//     joined but not posted / counted). A referral only COUNTS once the referred
//     creator submits a video to a challenge - see lib/referrals.js.
//  2. Manual leads a creator typed in (the referrals table) - follow-up list.
const STATUSES = ['new', 'contacted', 'joined', 'declined']
const STATUS_TONE = { new: 'amber', contacted: 'light', joined: 'green', declined: 'grey' }

function StageBadge({ stage }) {
  return <Badge tone={stage.tone} title={stage.hint}>{stage.label}</Badge>
}

export default function AdminReferrals() {
  const [referrals, setReferrals] = useState([])
  const [referrerNames, setReferrerNames] = useState({})
  const [groups, setGroups] = useState([]) // [{ referrer, people:[{...profile, stage}], counted }]
  const [loading, setLoading] = useState(true)

  async function load() {
    const [{ data: refs }, { data: joinedProfiles }] = await Promise.all([
      supabase.from('referrals').select('*').order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, name, photo_url, created_at, status, onboarded, referred_by, referrer:referred_by(id, name, photo_url)')
        .not('referred_by', 'is', null)
        .order('created_at', { ascending: false }),
    ])
    setReferrals(refs ?? [])

    // Which referred creators have actually submitted a challenge video? That is
    // the only thing that makes a referral "count".
    const joined = joinedProfiles ?? []
    const joinedIds = joined.map((p) => p.id)
    let submitted = new Set()
    if (joinedIds.length) {
      const { data: subs } = await supabase.from('submissions').select('creator_id').in('creator_id', joinedIds)
      submitted = new Set((subs ?? []).map((s) => s.creator_id))
    }

    // Group referred creators under the person who referred them.
    const byReferrer = new Map()
    joined.forEach((p) => {
      const rid = p.referred_by
      if (!byReferrer.has(rid)) byReferrer.set(rid, { referrer: p.referrer, people: [], counted: 0 })
      const g = byReferrer.get(rid)
      const stage = referralStage(p, submitted.has(p.id))
      if (stage.key === 'counted') g.counted += 1
      g.people.push({ ...p, stage })
    })
    // Sort each group's people by stage progress (counted first), and groups by
    // most counted referrals.
    const list = [...byReferrer.values()].map((g) => ({
      ...g,
      people: g.people.sort((a, b) => b.stage.step - a.stage.step || new Date(b.created_at) - new Date(a.created_at)),
    }))
    list.sort((a, b) => b.counted - a.counted || b.people.length - a.people.length)
    setGroups(list)

    // Referrer names for the manual leads.
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

  // Long-press a lead to delete it (tidy up follow-ups).
  const pressTimer = useRef(null)
  async function deleteReferral(r) {
    if (!await confirm(`Delete the lead "${r.referred_name}"?`)) return
    setReferrals((prev) => prev.filter((x) => x.id !== r.id))
    await supabase.from('referrals').delete().eq('id', r.id)
  }
  const startPress = (r) => { pressTimer.current = setTimeout(() => deleteReferral(r), 550) }
  const cancelPress = () => clearTimeout(pressTimer.current)

  const totalJoined = groups.reduce((n, g) => n + g.people.length, 0)
  const totalCounted = groups.reduce((n, g) => n + g.counted, 0)
  const inProgress = totalJoined - totalCounted

  function exportCsv() {
    downloadCsv('tryp-referrals.csv', [
      ...groups.flatMap((g) =>
        g.people.map((p) => ({
          referred_name: p.name,
          referred_by: g.referrer?.name ?? '',
          contact: '',
          stage: p.stage.label,
          counts: p.stage.key === 'counted' ? 'yes' : 'no',
          date: formatDate(p.created_at),
        }))
      ),
      ...referrals.map((r) => ({
        referred_name: r.referred_name,
        referred_by: referrerNames[r.referrer_id] ?? '',
        contact: r.referred_contact,
        stage: `lead: ${r.status}`,
        counts: 'no',
        date: formatDate(r.created_at),
      })),
    ])
  }

  return (
    <div className="page">
      <PageHeader
        title="Referrals"
        subtitle="Who your creators brought in, and exactly how far each referred creator has got. A referral only counts once they submit a video to a challenge."
        action={<button onClick={exportCsv} className="btn-secondary">Export CSV ↓</button>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Counted referrals" value={totalCounted} accent />
        <StatCard label="In progress" value={inProgress} />
        <StatCard label="Open leads" value={referrals.filter((r) => r.status === 'new' || r.status === 'contacted').length} />
      </div>

      {/* Stage legend so the badges read clearly at a glance. */}
      <div className="mb-8 flex flex-wrap gap-2">
        {['signing_up', 'in_review', 'joined', 'counted'].map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-xs text-smoke">
            <StageBadge stage={REFERRAL_STAGES[k]} />
          </span>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : groups.length === 0 && referrals.length === 0 ? (
        <EmptyState icon={<Icon name="share" className="h-7 w-7" />} title="No referrals yet" hint="When creators share their invite links or refer people, they'll show up here." />
      ) : (
        <div className="space-y-10">
          {groups.length > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-semibold">Who referred who</h2>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {groups.map((g, gi) => (
                  <div key={g.referrer?.id ?? `g${gi}`} className="card !p-6">
                    {/* Referrer header */}
                    <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
                      <Avatar src={g.referrer?.photo_url} name={g.referrer?.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{g.referrer?.name ?? 'A creator'}</p>
                        <p className="text-xs text-smoke">
                          {g.people.length} referred · {g.counted} counted
                        </p>
                      </div>
                      {g.counted > 0 && (
                        <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">{g.counted} ✓</span>
                      )}
                    </div>

                    {/* The people they referred, each with their exact stage. */}
                    <ul className="mt-3 space-y-2.5">
                      {g.people.map((p) => (
                        <li key={p.id} className="flex items-center gap-3">
                          <Avatar src={p.photo_url} name={p.name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{p.name}</p>
                            <p className="text-[11px] text-smoke">{p.stage.hint}</p>
                          </div>
                          <StageBadge stage={p.stage} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {referrals.length > 0 && (
            <section>
              <h2 className="mb-1 text-lg font-semibold">Leads to follow up</h2>
              <p className="mb-4 text-xs text-smoke">People a creator flagged for the team to reach out to. Long-press a lead to delete it.</p>
              <div className="space-y-3">
                {referrals.map((r) => (
                  <div
                    key={r.id}
                    onTouchStart={() => startPress(r)} onTouchEnd={cancelPress} onTouchMove={cancelPress}
                    onMouseDown={() => startPress(r)} onMouseUp={cancelPress} onMouseLeave={cancelPress}
                    onContextMenu={(e) => { e.preventDefault(); deleteReferral(r) }}
                    className="card flex select-none flex-wrap items-center gap-4 !p-5"
                  >
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
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
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
